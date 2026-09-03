import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeDatasetVersion, AuthorizationError } from '@/lib/auth/authorize'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'
import { enqueueDurableJob } from '@/lib/orchestration/queue'

export const maxDuration = 300

const PRODUCTION_AGENT_KEY = 'profiling_agent'
const PRODUCTION_AGENT_VERSION = '2.0'
const PROFILING_ENGINE_NAME = 'profiling-engine'
const PROFILING_ENGINE_VERSION = '1.1'

function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  let agentRunId: string | null = null
  try {
    const user = await requireUser()
    const admin = createAdminClient()
    const input = await request.json() as Record<string, unknown>
    const requestedProjectId = text(input.projectId ?? input.project_id)
    const datasetVersionId = text(input.datasetVersionId ?? input.dataset_version_id)
    const agentDefinitionId = text(input.agentDefinitionId ?? input.agent_definition_id)
    const rawIdempotencyKey = text(request.headers.get('idempotency-key') ?? input.idempotencyKey ?? input.idempotency_key)
    const idempotencyKey = rawIdempotencyKey ? `profiling:${rawIdempotencyKey}` : null

    if (!requestedProjectId || !datasetVersionId || !agentDefinitionId) {
      return NextResponse.json({ error: 'projectId, datasetVersionId and agentDefinitionId are required' }, { status: 400 })
    }

    const { dataset, version: datasetVersion } = await authorizeDatasetVersion(user.id, datasetVersionId, 'profiling.execute')
    if (dataset.project_id !== requestedProjectId) return NextResponse.json({ error: 'Dataset version does not belong to the requested project.' }, { status: 400 })
    const projectId = dataset.project_id

    if (idempotencyKey) {
      const { data: existingJob, error: existingError } = await admin
        .schema('orchestration')
        .from('job_queue')
        .select('id,status,agent_run_id,payload')
        .eq('project_id', projectId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existingError) throw new Error(`Unable to resolve prior profiling request: ${existingError.message}`)
      if (existingJob?.agent_run_id) {
        const payload = existingJob.payload && typeof existingJob.payload === 'object' ? existingJob.payload as Record<string, unknown> : {}
        const profilingRunId = text(payload.profilingRunId)
        return NextResponse.json({
          accepted: true,
          reused: true,
          execution_completed: existingJob.status === 'SUCCEEDED',
          agentRunId: existingJob.agent_run_id,
          profilingRunId: profilingRunId || null,
          durableJobId: existingJob.id,
          monitorUrl: `/monitoring?run=${encodeURIComponent(existingJob.agent_run_id)}`,
        }, { status: 202 })
      }
    }

    const { data: agentDefinition, error: agentError } = await admin
      .schema('agent')
      .from('agent_definitions')
      .select('id,agent_key,version,enabled')
      .eq('id', agentDefinitionId)
      .eq('enabled', true)
      .maybeSingle()
    if (agentError) throw new Error(`Unable to resolve agent definition: ${agentError.message}`)
    if (!agentDefinition) return NextResponse.json({ error: 'Agent definition not found or disabled' }, { status: 404 })
    if (agentDefinition.agent_key !== PRODUCTION_AGENT_KEY || agentDefinition.version !== PRODUCTION_AGENT_VERSION) {
      return NextResponse.json({ error: `Only ${PRODUCTION_AGENT_KEY} v${PRODUCTION_AGENT_VERSION} is enabled for execution` }, { status: 400 })
    }

    if (String(datasetVersion.status).toUpperCase() !== 'AVAILABLE') {
      return NextResponse.json({ error: 'Dataset version is not profiling-ready. Validate the source and wait for the version to become AVAILABLE.' }, { status: 409 })
    }

    const { data: source, error: sourceError } = dataset.data_source_id
      ? await admin.schema('catalog').from('data_sources').select('id,project_id,status,source_type,connection_metadata').eq('id', dataset.data_source_id).eq('project_id', projectId).maybeSingle()
      : { data: null, error: null }
    if (sourceError) throw new Error(`Unable to resolve dataset source: ${sourceError.message}`)
    if (!source || String(source.status).toUpperCase() !== 'ACTIVE') {
      return NextResponse.json({ error: 'The dataset data source is not ACTIVE. Validate or activate the source before profiling.' }, { status: 409 })
    }

    const sourceIdentifier = typeof dataset.source_identifier === 'string' ? dataset.source_identifier.trim() : ''
    const sourceValidation = await validateDataSourceForProfiling(admin, source, sourceIdentifier)
    if (!sourceValidation.valid) {
      return NextResponse.json({
        error: `Profiling preflight failed: ${sourceValidation.errors.join(' ') || 'source validation failed.'}`,
        source_validation: sourceValidation,
      }, { status: 409 })
    }

    const { data: executionSourceRows, error: executionSourceError } = await admin
      .schema('profiling')
      .from('dataset_execution_sources')
      .select('id,active,source_type,source_uri,execution_config,updated_at')
      .eq('dataset_version_id', datasetVersionId)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (executionSourceError) throw new Error(`Unable to resolve profiling execution source: ${executionSourceError.message}`)
    if (!executionSourceRows?.[0]) {
      return NextResponse.json({ error: 'The dataset execution source is not active. Validate the source binding before profiling.' }, { status: 409 })
    }

    const now = new Date().toISOString()
    const runInsert = await admin.schema('agent').from('agent_runs').insert({
      agent_definition_id: agentDefinition.id,
      project_id: projectId,
      dataset_id: dataset.id,
      dataset_version_id: datasetVersionId,
      status: 'QUEUED',
      input: { ...input, idempotencyKey: rawIdempotencyKey || null },
    }).select('id').single()
    if (runInsert.error || !runInsert.data) throw new Error(`Unable to create agent run: ${runInsert.error?.message ?? 'unknown error'}`)
    agentRunId = runInsert.data.id
    const activeAgentRunId = runInsert.data.id

    const profileInsert = await admin.schema('profiling').from('profile_runs').insert({
      dataset_version_id: datasetVersionId,
      status: 'RUNNING',
      agent_run_id: activeAgentRunId,
      engine_name: PROFILING_ENGINE_NAME,
      engine_version: PROFILING_ENGINE_VERSION,
      configuration: {
        agent_definition_id: agentDefinition.id,
        agent_key: agentDefinition.agent_key,
        agent_version: agentDefinition.version,
        execution_mode: 'durable_queue_outbox',
        source_validation: sourceValidation,
        idempotency_key: rawIdempotencyKey || null,
      },
      started_at: now,
    }).select('id').single()
    if (profileInsert.error || !profileInsert.data) {
      await admin.schema('agent').from('agent_runs').update({
        status: 'FAILED',
        error_code: 'PROFILE_RUN_CREATION_FAILED',
        error_message: profileInsert.error?.message ?? 'Unable to create profiling run.',
        completed_at: new Date().toISOString(),
      }).eq('id', activeAgentRunId)
      throw new Error(`Unable to create profiling run: ${profileInsert.error?.message ?? 'unknown error'}`)
    }
    const profilingRunId = profileInsert.data.id

    try {
      const durableJob = await enqueueDurableJob({
        projectId,
        jobType: 'PROFILING',
        entityId: datasetVersionId,
        agentRunId: activeAgentRunId,
        idempotencyKey,
        payload: {
          userId: user.id,
          projectId,
          datasetVersionId,
          agentDefinitionId: agentDefinition.id,
          agentVersion: agentDefinition.version,
          agentRunId: activeAgentRunId,
          profilingRunId,
          requestInput: input,
        },
        maxAttempts: 3,
      })

      return NextResponse.json({
        accepted: true,
        reused: false,
        execution_completed: false,
        agentRunId: activeAgentRunId,
        profilingRunId,
        agentDefinitionId: agentDefinition.id,
        agentVersion: agentDefinition.version,
        durableJobId: durableJob.id,
        monitorUrl: `/monitoring?run=${encodeURIComponent(activeAgentRunId)}`,
      }, { status: 202 })
    } catch (queueError) {
      await admin.schema('profiling').from('profile_runs').update({
        status: 'FAILED',
        error_code: 'PROFILING_QUEUE_FAILED',
        error_message: errorMessage(queueError, 'Unable to queue profiling job.'),
        completed_at: new Date().toISOString(),
      }).eq('id', profilingRunId).eq('status', 'RUNNING')
      throw queueError
    }
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const message = errorMessage(error, 'Unable to start profiling job.')
    if (agentRunId) {
      const admin = createAdminClient()
      await admin.schema('agent').from('agent_runs').update({
        status: 'FAILED',
        error_code: 'PROFILING_START_FAILED',
        error_message: message,
        completed_at: new Date().toISOString(),
      }).eq('id', agentRunId).in('status', ['CREATED','QUEUED'])
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
