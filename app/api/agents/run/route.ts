import { after, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'
import { executePreparedProfilingJob } from '@/lib/agents/run-profiling-job'

const PRODUCTION_AGENT_KEY = 'profiling_agent'
const PRODUCTION_AGENT_VERSION = '2.0'
const PROFILING_ENGINE_NAME = 'profiling-engine'
const PROFILING_ENGINE_VERSION = '1.1'

function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }

export async function POST(request: Request) {
  let agentRunId: string | null = null
  try {
    const user = await requireUser()
    const admin = createAdminClient()
    const input = await request.json() as Record<string, unknown>
    const projectId = typeof (input.projectId ?? input.project_id) === 'string' ? String(input.projectId ?? input.project_id) : ''
    const datasetVersionId = typeof (input.datasetVersionId ?? input.dataset_version_id) === 'string' ? String(input.datasetVersionId ?? input.dataset_version_id) : ''
    const agentDefinitionId = typeof (input.agentDefinitionId ?? input.agent_definition_id) === 'string' ? String(input.agentDefinitionId ?? input.agent_definition_id) : ''
    if (!projectId || !datasetVersionId || !agentDefinitionId) {
      return NextResponse.json({ error: 'projectId, datasetVersionId and agentDefinitionId are required' }, { status: 400 })
    }

    const { data: project, error: projectError } = await admin.schema('app').from('projects').select('id,organization_id').eq('id', projectId).maybeSingle()
    if (projectError) throw new Error(`Unable to resolve project: ${projectError.message}`)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { data: membership, error: membershipError } = await admin.schema('app').from('organization_members').select('organization_id,user_id,role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (membershipError) throw new Error(`Unable to verify project membership: ${membershipError.message}`)
    if (!membership) return NextResponse.json({ error: 'You do not have access to run profiling for this project.' }, { status: 403 })

    const { data: agentDefinition, error: agentError } = await admin.schema('agent').from('agent_definitions').select('id,agent_key,version,enabled').eq('id', agentDefinitionId).eq('enabled', true).maybeSingle()
    if (agentError) throw new Error(`Unable to resolve agent definition: ${agentError.message}`)
    if (!agentDefinition) return NextResponse.json({ error: 'Agent definition not found or disabled' }, { status: 404 })
    if (agentDefinition.agent_key !== PRODUCTION_AGENT_KEY || agentDefinition.version !== PRODUCTION_AGENT_VERSION) {
      return NextResponse.json({ error: `Only ${PRODUCTION_AGENT_KEY} v${PRODUCTION_AGENT_VERSION} is enabled for execution` }, { status: 400 })
    }

    const { data: datasetVersion, error: datasetVersionError } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id,status').eq('id', datasetVersionId).maybeSingle()
    if (datasetVersionError) throw new Error(`Unable to resolve dataset version: ${datasetVersionError.message}`)
    if (!datasetVersion) return NextResponse.json({ error: 'Dataset version not found' }, { status: 404 })

    const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,project_id,data_source_id,source_identifier').eq('id', datasetVersion.dataset_id).eq('project_id', projectId).maybeSingle()
    if (datasetError) throw new Error(`Unable to verify dataset ownership: ${datasetError.message}`)
    if (!dataset) return NextResponse.json({ error: 'Dataset version not found for project' }, { status: 404 })
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
      input,
    }).select('id').single()
    if (runInsert.error || !runInsert.data) throw new Error(`Unable to create agent run: ${runInsert.error?.message ?? 'unknown error'}`)
    agentRunId = runInsert.data.id
    const activeAgentRunId = runInsert.data.id

    const profileInsert = await admin.schema('profiling').from('profile_runs').insert({
      dataset_version_id: datasetVersionId,
      status: 'RUNNING',
      agent_run_id: agentRunId,
      engine_name: PROFILING_ENGINE_NAME,
      engine_version: PROFILING_ENGINE_VERSION,
      configuration: {
        agent_definition_id: agentDefinition.id,
        agent_key: agentDefinition.agent_key,
        agent_version: agentDefinition.version,
        execution_mode: 'background_after_response',
        source_validation: sourceValidation,
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

    after(async () => {
      await executePreparedProfilingJob({
        userId: user.id,
        projectId,
        datasetVersionId,
        agentDefinitionId: agentDefinition.id,
        agentVersion: agentDefinition.version,
        agentRunId: activeAgentRunId,
        profilingRunId,
        requestInput: input,
      })
    })

    return NextResponse.json({
      accepted: true,
      execution_completed: false,
      agentRunId: activeAgentRunId,
      profilingRunId,
      agentDefinitionId: agentDefinition.id,
      agentVersion: agentDefinition.version,
      monitorUrl: `/monitoring?run=${encodeURIComponent(activeAgentRunId)}`,
    }, { status: 202 })
  } catch (error) {
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
