import { createAdminClient } from '@/lib/supabase/admin'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'
import { enqueueDurableJob } from '@/lib/orchestration/queue'

const PROFILING_AGENT_KEY = 'profiling_agent'
const PROFILING_AGENT_VERSION = '2.0'
const PROFILING_ENGINE_NAME = 'profiling-engine'
const PROFILING_ENGINE_VERSION = '1.1'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function queueGovernedReprofile(input: {
  projectId: string
  datasetVersionId: string
  actorUserId: string
  autonomyActionId: string
}) {
  const admin = createAdminClient()
  const idempotencyKey = `governed-reprofile:${input.autonomyActionId}`

  const { data: existing, error: existingError } = await admin.schema('orchestration').from('job_queue')
    .select('id,status,agent_run_id,payload')
    .eq('project_id', input.projectId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existingError) throw new Error(`Unable to resolve prior governed reprofile: ${existingError.message}`)
  if (existing?.agent_run_id) {
    const payload = existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload) ? existing.payload as Record<string, unknown> : {}
    return {
      reused: true,
      durableJobId: existing.id,
      agentRunId: existing.agent_run_id,
      profilingRunId: text(payload.profilingRunId) || null,
      status: existing.status,
    }
  }

  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,dataset_id,status')
    .eq('id', input.datasetVersionId)
    .maybeSingle()
  if (versionError || !version) throw new Error(`Unable to resolve approved reprofile dataset version: ${versionError?.message ?? 'not found'}`)
  if (String(version.status).toUpperCase() !== 'AVAILABLE') throw new Error('Approved reprofile requires an AVAILABLE dataset version.')

  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets')
    .select('id,project_id,data_source_id,source_identifier')
    .eq('id', version.dataset_id)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (datasetError || !dataset) throw new Error(`Approved reprofile dataset is outside the governed project: ${datasetError?.message ?? 'not found'}`)

  const { data: agentDefinition, error: agentError } = await admin.schema('agent').from('agent_definitions')
    .select('id,agent_key,version,enabled')
    .eq('agent_key', PROFILING_AGENT_KEY)
    .eq('version', PROFILING_AGENT_VERSION)
    .eq('enabled', true)
    .maybeSingle()
  if (agentError || !agentDefinition) throw new Error(`Profiling Agent ${PROFILING_AGENT_VERSION} is unavailable: ${agentError?.message ?? 'not registered'}`)

  const { data: source, error: sourceError } = dataset.data_source_id
    ? await admin.schema('catalog').from('data_sources').select('id,project_id,status,source_type,connection_metadata').eq('id', dataset.data_source_id).eq('project_id', input.projectId).maybeSingle()
    : { data: null, error: null }
  if (sourceError) throw new Error(`Unable to resolve approved reprofile source: ${sourceError.message}`)
  if (!source || String(source.status).toUpperCase() !== 'ACTIVE') throw new Error('Approved reprofile source is not ACTIVE.')

  const sourceValidation = await validateDataSourceForProfiling(admin, source, text(dataset.source_identifier))
  if (!sourceValidation.valid) throw new Error(`Approved reprofile preflight failed: ${sourceValidation.errors.join(' ') || 'source validation failed.'}`)

  const { data: executionSources, error: executionSourceError } = await admin.schema('profiling').from('dataset_execution_sources')
    .select('id,active,source_type,source_uri,execution_config,updated_at')
    .eq('dataset_version_id', input.datasetVersionId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (executionSourceError) throw new Error(`Unable to resolve approved reprofile execution source: ${executionSourceError.message}`)
  if (!executionSources?.[0]) throw new Error('Approved reprofile execution source is not active.')

  const requestInput = {
    projectId: input.projectId,
    datasetVersionId: input.datasetVersionId,
    agentDefinitionId: agentDefinition.id,
    trigger: 'GOVERNED_AUTONOMY_REPROFILE',
    autonomyActionId: input.autonomyActionId,
    approvedBy: input.actorUserId,
    idempotencyKey,
  }
  const now = new Date().toISOString()
  const { data: agentRun, error: runError } = await admin.schema('agent').from('agent_runs').insert({
    agent_definition_id: agentDefinition.id,
    project_id: input.projectId,
    dataset_id: dataset.id,
    dataset_version_id: input.datasetVersionId,
    status: 'QUEUED',
    input: requestInput,
  }).select('id').single()
  if (runError || !agentRun) throw new Error(`Unable to create governed reprofile agent run: ${runError?.message ?? 'unknown error'}`)

  const { data: profilingRun, error: profileError } = await admin.schema('profiling').from('profile_runs').insert({
    dataset_version_id: input.datasetVersionId,
    status: 'RUNNING',
    agent_run_id: agentRun.id,
    engine_name: PROFILING_ENGINE_NAME,
    engine_version: PROFILING_ENGINE_VERSION,
    configuration: {
      agent_definition_id: agentDefinition.id,
      agent_key: agentDefinition.agent_key,
      agent_version: agentDefinition.version,
      execution_mode: 'durable_queue_outbox',
      source_validation: sourceValidation,
      trigger: 'GOVERNED_AUTONOMY_REPROFILE',
      autonomy_action_id: input.autonomyActionId,
      approval_actor_user_id: input.actorUserId,
    },
    started_at: now,
  }).select('id').single()
  if (profileError || !profilingRun) {
    await admin.schema('agent').from('agent_runs').update({
      status: 'FAILED',
      error_code: 'GOVERNED_REPROFILE_RUN_CREATION_FAILED',
      error_message: profileError?.message ?? 'Unable to create governed profiling run.',
      completed_at: new Date().toISOString(),
    }).eq('id', agentRun.id)
    throw new Error(`Unable to create governed profiling run: ${profileError?.message ?? 'unknown error'}`)
  }

  try {
    const durableJob = await enqueueDurableJob({
      projectId: input.projectId,
      jobType: 'PROFILING',
      entityId: input.datasetVersionId,
      agentRunId: agentRun.id,
      idempotencyKey,
      payload: {
        userId: input.actorUserId,
        projectId: input.projectId,
        datasetVersionId: input.datasetVersionId,
        agentDefinitionId: agentDefinition.id,
        agentVersion: agentDefinition.version,
        agentRunId: agentRun.id,
        profilingRunId: profilingRun.id,
        requestInput,
      },
      maxAttempts: 3,
    })
    return {
      reused: false,
      durableJobId: durableJob.id,
      agentRunId: agentRun.id,
      profilingRunId: profilingRun.id,
      status: durableJob.status,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to queue governed reprofile.'
    await Promise.all([
      admin.schema('profiling').from('profile_runs').update({
        status: 'FAILED',
        error_code: 'GOVERNED_REPROFILE_QUEUE_FAILED',
        error_message: message,
        completed_at: new Date().toISOString(),
      }).eq('id', profilingRun.id).eq('status', 'RUNNING'),
      admin.schema('agent').from('agent_runs').update({
        status: 'FAILED',
        error_code: 'GOVERNED_REPROFILE_QUEUE_FAILED',
        error_message: message,
        completed_at: new Date().toISOString(),
      }).eq('id', agentRun.id).in('status', ['CREATED','QUEUED']),
    ])
    throw error
  }
}
