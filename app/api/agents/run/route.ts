import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { executeProfilingExecutor } from '@/lib/agents/executors/profiling-executor'
import type { ToolExecutionContext } from '@/lib/agents/types'

const PRODUCTION_AGENT_KEY = 'profiling_agent'
const PRODUCTION_AGENT_VERSION = '2.0'
const TERMINATED_ERROR_CODE = 'TERMINATED_BY_USER'

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

async function safeUpdate(query: PromiseLike<{ error: { message: string } | null }>, label: string) {
  try {
    const { error } = await query
    if (error) console.error(`[agent-run] ${label}: ${error.message}`)
  } catch (error) {
    console.error(`[agent-run] ${label}: ${errorMessage(error, 'unknown persistence error')}`)
  }
}

async function isRunCancelled(admin: ReturnType<typeof createAdminClient>, runId: string) {
  const { data } = await admin.schema('agent').from('agent_runs').select('status').eq('id', runId).maybeSingle()
  return data?.status === 'CANCELLED'
}

async function preserveCancellation(admin: ReturnType<typeof createAdminClient>, agentRunId: string, profilingRunId: string, stepId?: string) {
  const completedAt = new Date().toISOString()
  if (stepId) await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'CANCELLED', error_code: TERMINATED_ERROR_CODE, error_message: 'Execution terminated by user.', completed_at: completedAt }).eq('id', stepId).eq('status', 'RUNNING'), 'cancel current step')
  await safeUpdate(admin.schema('agent').from('agent_runs').update({ status: 'CANCELLED', error_code: TERMINATED_ERROR_CODE, error_message: 'Execution terminated by user.', completed_at: completedAt }).eq('id', agentRunId).eq('status', 'RUNNING'), 'cancel agent run')
  await safeUpdate(admin.schema('profiling').from('profile_runs').update({ status: 'CANCELLED', error_code: TERMINATED_ERROR_CODE, error_message: 'Execution terminated by user.', completed_at: completedAt }).eq('id', profilingRunId).eq('status', 'RUNNING'), 'cancel profiling run')
}

export async function POST(request: Request) {
  let agentRunId: string | null = null
  let profilingRunId: string | null = null
  let stepId: string | null = null
  try {
    const user = await requireUser()
    const supabase = await createClient()
    const admin = createAdminClient()
    const input = await request.json()
    const projectId = input?.projectId ?? input?.project_id
    const datasetVersionId = input?.datasetVersionId ?? input?.dataset_version_id
    const agentDefinitionId = input?.agentDefinitionId ?? input?.agent_definition_id
    if (!projectId || !datasetVersionId || !agentDefinitionId) return NextResponse.json({ error: 'projectId, datasetVersionId and agentDefinitionId are required' }, { status: 400 })

    const { data: project } = await admin.schema('app').from('projects').select('id,organization_id').eq('id', projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('id').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: agentDefinition, error: agentError } = await supabase.schema('agent').from('agent_definitions').select('*').eq('id', agentDefinitionId).eq('enabled', true).maybeSingle()
    if (agentError || !agentDefinition) return NextResponse.json({ error: 'Agent definition not found or disabled' }, { status: 404 })
    if (agentDefinition.agent_key !== PRODUCTION_AGENT_KEY || agentDefinition.version !== PRODUCTION_AGENT_VERSION) return NextResponse.json({ error: `Only ${PRODUCTION_AGENT_KEY} v${PRODUCTION_AGENT_VERSION} is enabled for execution` }, { status: 400 })

    const { data: datasetVersion, error: datasetVersionError } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id', datasetVersionId).maybeSingle()
    if (datasetVersionError) throw new Error(`Unable to resolve dataset version: ${datasetVersionError.message}`)
    if (!datasetVersion) return NextResponse.json({ error: 'Dataset version not found' }, { status: 404 })
    const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,project_id').eq('id', datasetVersion.dataset_id).eq('project_id', projectId).maybeSingle()
    if (datasetError) throw new Error(`Unable to verify dataset ownership: ${datasetError.message}`)
    if (!dataset) return NextResponse.json({ error: 'Dataset version not found for project' }, { status: 404 })

    const now = new Date().toISOString()
    const runInsert = await admin.schema('agent').from('agent_runs').insert({ agent_definition_id: agentDefinition.id, project_id: projectId, dataset_version_id: datasetVersionId, status: 'RUNNING', input, started_at: now }).select('id').single()
    if (runInsert.error || !runInsert.data) throw new Error(`Unable to create agent run: ${runInsert.error?.message ?? 'unknown error'}`)
    agentRunId = runInsert.data.id

    const profileInsert = await admin.schema('profiling').from('profile_runs').insert({ dataset_version_id: datasetVersionId, status: 'RUNNING', started_at: now }).select('id').single()
    if (profileInsert.error || !profileInsert.data) throw new Error(`Unable to create profiling run: ${profileInsert.error?.message ?? 'unknown error'}`)
    profilingRunId = profileInsert.data.id

    const requiredTools = ['profile_dataset', 'execute_metrics', 'investigate_profile']
    const tools = await supabase.schema('agent').from('tool_definitions').select('*').eq('agent_definition_id', agentDefinition.id).eq('enabled', true).in('tool_key', requiredTools).order('version', { ascending: false })
    if (tools.error) throw new Error(`Unable to load profiling tools: ${tools.error.message}`)
    const toolMap = new Map<string, any>()
    for (const tool of tools.data ?? []) if (!toolMap.has(tool.tool_key)) toolMap.set(tool.tool_key, tool)
    for (const key of requiredTools) if (!toolMap.has(key)) throw new Error(`Required profiling tool is not configured: ${key}`)
    const profileTool = toolMap.get('profile_dataset')
    const metricTool = toolMap.get('execute_metrics')
    const investigationTool = toolMap.get('investigate_profile')

    const profileStep = await admin.schema('agent').from('agent_run_steps').insert({ agent_run_id: agentRunId, step_name: profileTool.tool_key, step_order: 1, status: 'RUNNING', input: { ...input, profilingRunId, tool_definition_id: profileTool.id, tool_version: profileTool.version }, started_at: now }).select('id').single()
    if (profileStep.error || !profileStep.data) throw new Error(`Unable to create profiling step: ${profileStep.error?.message ?? 'unknown error'}`)
    stepId = profileStep.data.id
    if (!agentRunId || !profilingRunId || !stepId) throw new Error('Profiling run state was not initialized correctly')
    const activeAgentRunId = agentRunId
    const activeProfilingRunId = profilingRunId
    const activeProfileStepId = stepId
    if (await isRunCancelled(admin, activeAgentRunId)) { await preserveCancellation(admin, activeAgentRunId, activeProfilingRunId, activeProfileStepId); return NextResponse.json({ execution_completed: false, terminated: true, agentRunId: activeAgentRunId, profilingRunId: activeProfilingRunId }, { status: 409 }) }

    const context = { agentRunId: activeAgentRunId, stepId: activeProfileStepId, projectId, agentDefinitionId: agentDefinition.id, agentVersion: agentDefinition.version } satisfies ToolExecutionContext
    const profileResult = await executeProfilingExecutor('profile_dataset', { ...input, profilingRunId: activeProfilingRunId }, context)
    if (await isRunCancelled(admin, activeAgentRunId)) { await preserveCancellation(admin, activeAgentRunId, activeProfilingRunId, activeProfileStepId); return NextResponse.json({ execution_completed: false, terminated: true, agentRunId: activeAgentRunId, profilingRunId: activeProfilingRunId }, { status: 409 }) }
    await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: profileResult, completed_at: new Date().toISOString() }).eq('id', activeProfileStepId).eq('status', 'RUNNING'), 'complete profile step')

    const metricStep = await admin.schema('agent').from('agent_run_steps').insert({ agent_run_id: activeAgentRunId, step_name: metricTool.tool_key, step_order: 2, status: 'RUNNING', input: { ...input, profilingRunId: activeProfilingRunId, tool_definition_id: metricTool.id, tool_version: metricTool.version }, started_at: new Date().toISOString() }).select('id').single()
    if (metricStep.error || !metricStep.data) throw new Error(`Unable to create metric execution step: ${metricStep.error?.message ?? 'unknown error'}`)
    stepId = metricStep.data.id
    if (!stepId) throw new Error('Metric execution step was not initialized correctly')
    const activeMetricStepId = stepId
    if (await isRunCancelled(admin, activeAgentRunId)) { await preserveCancellation(admin, activeAgentRunId, activeProfilingRunId, activeMetricStepId); return NextResponse.json({ execution_completed: false, terminated: true, agentRunId: activeAgentRunId, profilingRunId: activeProfilingRunId }, { status: 409 }) }
    const metricResult = await executeProfilingExecutor('execute_metrics', { ...input, profilingRunId: activeProfilingRunId }, { ...context, stepId: activeMetricStepId })
    if (await isRunCancelled(admin, activeAgentRunId)) { await preserveCancellation(admin, activeAgentRunId, activeProfilingRunId, activeMetricStepId); return NextResponse.json({ execution_completed: false, terminated: true, agentRunId: activeAgentRunId, profilingRunId: activeProfilingRunId }, { status: 409 }) }
    await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: metricResult, completed_at: new Date().toISOString() }).eq('id', activeMetricStepId).eq('status', 'RUNNING'), 'complete metric step')

    const investigationStep = await admin.schema('agent').from('agent_run_steps').insert({ agent_run_id: activeAgentRunId, step_name: investigationTool.tool_key, step_order: 3, status: 'RUNNING', input: { ...input, profilingRunId: activeProfilingRunId, tool_definition_id: investigationTool.id, tool_version: investigationTool.version }, started_at: new Date().toISOString() }).select('id').single()
    if (investigationStep.error || !investigationStep.data) throw new Error(`Unable to create profiling investigation step: ${investigationStep.error?.message ?? 'unknown error'}`)
    stepId = investigationStep.data.id
    if (!stepId) throw new Error('Profiling investigation step was not initialized correctly')
    const activeInvestigationStepId = stepId
    if (await isRunCancelled(admin, activeAgentRunId)) { await preserveCancellation(admin, activeAgentRunId, activeProfilingRunId, activeInvestigationStepId); return NextResponse.json({ execution_completed: false, terminated: true, agentRunId: activeAgentRunId, profilingRunId: activeProfilingRunId }, { status: 409 }) }
    const investigationResult = await executeProfilingExecutor('investigate_profile', { ...input, profilingRunId: activeProfilingRunId }, { ...context, stepId: activeInvestigationStepId })
    if (await isRunCancelled(admin, activeAgentRunId)) { await preserveCancellation(admin, activeAgentRunId, activeProfilingRunId, activeInvestigationStepId); return NextResponse.json({ execution_completed: false, terminated: true, agentRunId: activeAgentRunId, profilingRunId: activeProfilingRunId }, { status: 409 }) }

    const completedAt = new Date().toISOString()
    await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: investigationResult, completed_at: completedAt }).eq('id', activeInvestigationStepId).eq('status', 'RUNNING'), 'complete investigation step')
    const result = { execution_completed: true, agent_run_id: activeAgentRunId, profiling_run_id: activeProfilingRunId, project_id: projectId, dataset_version_id: datasetVersion.id, profile: profileResult, metrics: metricResult, investigation: investigationResult }
    const { error: finalRunError } = await admin.schema('agent').from('agent_runs').update({ status: 'SUCCEEDED', output: result, completed_at: completedAt }).eq('id', activeAgentRunId).eq('status', 'RUNNING')
    if (finalRunError) throw new Error(`Unable to finalize agent run: ${finalRunError.message}`)
    return NextResponse.json({ agentRunId: activeAgentRunId, profilingRunId: activeProfilingRunId, stepId: activeInvestigationStepId, agentDefinitionId: agentDefinition.id, agentVersion: agentDefinition.version, result })
  } catch (error) {
    const message = errorMessage(error, 'Unknown execution error')
    const admin = createAdminClient()
    const completedAt = new Date().toISOString()
    let cancelled = false
    if (agentRunId) { try { cancelled = await isRunCancelled(admin, agentRunId) } catch { cancelled = false } }
    if (cancelled) {
      if (agentRunId && profilingRunId) await preserveCancellation(admin, agentRunId, profilingRunId, stepId ?? undefined)
      return NextResponse.json({ execution_completed: false, terminated: true, agentRunId, profilingRunId }, { status: 409 })
    }
    if (stepId) await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'FAILED', error_code: 'PROFILING_EXECUTION_FAILED', error_message: message, completed_at: completedAt }).eq('id', stepId).eq('status', 'RUNNING'), 'fail current step')
    if (agentRunId) await safeUpdate(admin.schema('agent').from('agent_runs').update({ status: 'FAILED', error_code: 'PROFILING_EXECUTION_FAILED', error_message: message, completed_at: completedAt }).eq('id', agentRunId).eq('status', 'RUNNING'), 'fail agent run')
    if (profilingRunId) await safeUpdate(admin.schema('profiling').from('profile_runs').update({ status: 'FAILED', error_code: 'PROFILING_EXECUTION_FAILED', error_message: message, completed_at: completedAt }).eq('id', profilingRunId).eq('status', 'RUNNING'), 'fail profiling run')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
