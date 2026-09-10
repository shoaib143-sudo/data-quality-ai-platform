import { createAdminClient } from '@/lib/supabase/admin'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'
import { sanitizeProfilingRequestInput } from '@/lib/profiling/request-input'
import { enqueueDurableJob } from '@/lib/orchestration/queue'

type JsonRecord = Record<string, any>

const PRODUCTION_AGENT_KEY = 'profiling_agent'
const PRODUCTION_AGENT_VERSION = '2.0'
const PROFILING_ENGINE_NAME = 'profiling-engine'
const PROFILING_ENGINE_VERSION = '1.1'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function executeGovernedReprofileAction(action: JsonRecord) {
  if (text(action.action_key).toUpperCase() !== 'REQUEST_REPROFILE') {
    throw new Error('Governed reprofile executor only accepts REQUEST_REPROFILE actions.')
  }
  if (text(action.target_type).toUpperCase() !== 'DATASET_VERSION' || !action.target_id) {
    throw new Error('REQUEST_REPROFILE requires a DATASET_VERSION target.')
  }

  const admin = createAdminClient()
  const datasetVersionId = String(action.target_id)
  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,dataset_id,status')
    .eq('id', datasetVersionId)
    .maybeSingle()
  if (versionError) throw new Error(`Unable to resolve reprofile dataset version: ${versionError.message}`)
  if (!version) throw new Error('REQUEST_REPROFILE target dataset version was not found.')
  if (String(version.status).toUpperCase() !== 'AVAILABLE') {
    throw new Error('REQUEST_REPROFILE target dataset version is not AVAILABLE.')
  }

  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets')
    .select('id,project_id,data_source_id,source_identifier,status')
    .eq('id', version.dataset_id)
    .eq('project_id', action.project_id)
    .maybeSingle()
  if (datasetError) throw new Error(`Unable to resolve reprofile dataset: ${datasetError.message}`)
  if (!dataset) throw new Error('REQUEST_REPROFILE target does not belong to the governed action project.')

  const { data: definition, error: definitionError } = await admin.schema('agent').from('agent_definitions')
    .select('id,agent_key,version,enabled')
    .eq('agent_key', PRODUCTION_AGENT_KEY)
    .eq('version', PRODUCTION_AGENT_VERSION)
    .eq('enabled', true)
    .maybeSingle()
  if (definitionError) throw new Error(`Unable to resolve production profiling agent: ${definitionError.message}`)
  if (!definition) throw new Error(`Production ${PRODUCTION_AGENT_KEY} v${PRODUCTION_AGENT_VERSION} is not enabled.`)

  const { data: source, error: sourceError } = dataset.data_source_id
    ? await admin.schema('catalog').from('data_sources')
        .select('id,project_id,status,source_type,connection_metadata')
        .eq('id', dataset.data_source_id)
        .eq('project_id', action.project_id)
        .maybeSingle()
    : { data: null, error: null }
  if (sourceError) throw new Error(`Unable to resolve reprofile data source: ${sourceError.message}`)
  if (!source || String(source.status).toUpperCase() !== 'ACTIVE') {
    throw new Error('REQUEST_REPROFILE requires an ACTIVE governed data source.')
  }

  const sourceIdentifier = text(dataset.source_identifier)
  const sourceValidation = await validateDataSourceForProfiling(admin, source, sourceIdentifier)
  if (!sourceValidation.valid) {
    throw new Error(`REQUEST_REPROFILE source preflight failed: ${sourceValidation.errors.join(' ') || 'source validation failed.'}`)
  }

  const { data: executionSourceRows, error: executionSourceError } = await admin.schema('profiling').from('dataset_execution_sources')
    .select('id,active,source_type,source_uri,execution_config,updated_at')
    .eq('dataset_version_id', datasetVersionId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (executionSourceError) throw new Error(`Unable to resolve governed reprofile execution source: ${executionSourceError.message}`)
  if (!executionSourceRows?.[0]) throw new Error('REQUEST_REPROFILE requires an active profiling execution source binding.')

  const actionInput = record(action.input)
  const profilingInput = sanitizeProfilingRequestInput(record(actionInput.profilingInput ?? actionInput.profiling_input))
  const now = new Date().toISOString()
  const persistedInput = {
    projectId: action.project_id,
    datasetVersionId,
    agentDefinitionId: definition.id,
    ...profilingInput,
    governedAutonomyActionId: action.id,
    governedAutonomyPolicyId: action.policy_id,
    governedAutonomyPolicyVersionId: action.policy_version_id,
    productionSourceMutation: false,
  }

  const { data: agentRun, error: agentRunError } = await admin.schema('agent').from('agent_runs').insert({
    agent_definition_id: definition.id,
    project_id: action.project_id,
    dataset_id: dataset.id,
    dataset_version_id: datasetVersionId,
    parent_run_id: action.source_agent_run_id ?? null,
    status: 'QUEUED',
    input: persistedInput,
  }).select('id').single()
  if (agentRunError || !agentRun) throw new Error(`Unable to create governed reprofile agent run: ${agentRunError?.message ?? 'unknown error'}`)

  const { data: profileRun, error: profileRunError } = await admin.schema('profiling').from('profile_runs').insert({
    dataset_version_id: datasetVersionId,
    agent_run_id: agentRun.id,
    status: 'RUNNING',
    engine_name: PROFILING_ENGINE_NAME,
    engine_version: PROFILING_ENGINE_VERSION,
    configuration: {
      agent_definition_id: definition.id,
      agent_key: definition.agent_key,
      agent_version: definition.version,
      execution_mode: 'governed_autonomy_durable_queue',
      governed_autonomy_action_id: action.id,
      source_validation: sourceValidation,
      production_source_mutation: false,
    },
    started_at: now,
  }).select('id').single()
  if (profileRunError || !profileRun) {
    await admin.schema('agent').from('agent_runs').update({
      status: 'FAILED',
      error_code: 'GOVERNED_REPROFILE_RUN_CREATION_FAILED',
      error_message: profileRunError?.message ?? 'Unable to create governed reprofile run.',
      completed_at: new Date().toISOString(),
    }).eq('id', agentRun.id)
    throw new Error(`Unable to create governed reprofile run: ${profileRunError?.message ?? 'unknown error'}`)
  }

  try {
    const durableJob = await enqueueDurableJob({
      projectId: action.project_id,
      jobType: 'PROFILING',
      entityId: datasetVersionId,
      agentRunId: agentRun.id,
      idempotencyKey: `autonomy-reprofile:${action.id}`,
      payload: {
        userId: action.requested_by ?? null,
        projectId: action.project_id,
        datasetVersionId,
        agentDefinitionId: definition.id,
        agentVersion: definition.version,
        agentRunId: agentRun.id,
        profilingRunId: profileRun.id,
        requestInput: profilingInput,
        governedAutonomyActionId: action.id,
      },
      maxAttempts: 3,
    })

    return {
      profilingRunId: profileRun.id,
      agentRunId: agentRun.id,
      durableJobId: durableJob.id,
      datasetVersionId,
      executionCompleted: false,
      productionSourceMutation: false,
      verificationRequired: true,
      rollback: { strategy: 'NONE', reversible: false },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to queue governed reprofile job.'
    await Promise.all([
      admin.schema('profiling').from('profile_runs').update({
        status: 'FAILED',
        error_code: 'GOVERNED_REPROFILE_QUEUE_FAILED',
        error_message: message,
        completed_at: new Date().toISOString(),
      }).eq('id', profileRun.id).eq('status', 'RUNNING'),
      admin.schema('agent').from('agent_runs').update({
        status: 'FAILED',
        error_code: 'GOVERNED_REPROFILE_QUEUE_FAILED',
        error_message: message,
        completed_at: new Date().toISOString(),
      }).eq('id', agentRun.id).in('status', ['CREATED', 'QUEUED']),
    ])
    throw error
  }
}
