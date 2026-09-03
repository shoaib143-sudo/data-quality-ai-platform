import { createAdminClient } from '@/lib/supabase/admin'
import { executeProfilingExecutor } from '@/lib/agents/executors/profiling-executor'
import { validateProfilingRun } from '@/lib/profiling/run-validation'
import { executeQualityAutomation } from '@/lib/data-quality/automation'
import { evaluateObservabilitySignals } from '@/lib/observability/evaluate'
import type { ToolExecutionContext } from '@/lib/agents/types'

const TERMINATED_ERROR_CODE = 'TERMINATED_BY_USER'

function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }

async function safeUpdate(query: PromiseLike<{ error: { message: string } | null }>, label: string) {
  try {
    const { error } = await query
    if (error) console.error(`[profiling-job] ${label}: ${error.message}`)
  } catch (error) {
    console.error(`[profiling-job] ${label}: ${errorMessage(error, 'unknown persistence error')}`)
  }
}

async function isRunCancelled(runId: string) {
  const admin = createAdminClient()
  const { data } = await admin.schema('agent').from('agent_runs').select('status').eq('id', runId).maybeSingle()
  return data?.status === 'CANCELLED'
}

async function preserveCancellation(agentRunId: string, profilingRunId: string, stepId?: string) {
  const admin = createAdminClient()
  const completedAt = new Date().toISOString()
  if (stepId) await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'FAILED', error_code: TERMINATED_ERROR_CODE, error_message: 'Execution terminated by user.', completed_at: completedAt }).eq('id', stepId).eq('status', 'RUNNING'), 'cancel current step')
  await safeUpdate(admin.schema('agent').from('agent_runs').update({ status: 'CANCELLED', error_code: TERMINATED_ERROR_CODE, error_message: 'Execution terminated by user.', completed_at: completedAt }).eq('id', agentRunId).in('status', ['QUEUED','RUNNING']), 'cancel agent run')
  await safeUpdate(admin.schema('profiling').from('profile_runs').update({ status: 'CANCELLED', error_code: TERMINATED_ERROR_CODE, error_message: 'Execution terminated by user.', completed_at: completedAt }).eq('id', profilingRunId).eq('status', 'RUNNING'), 'cancel profiling run')
}

export async function executePreparedProfilingJob(input: {
  userId: string
  projectId: string
  datasetVersionId: string
  agentDefinitionId: string
  agentVersion: string
  agentRunId: string
  profilingRunId: string
  requestInput: Record<string, unknown>
}) {
  const {
    userId,
    projectId,
    datasetVersionId,
    agentDefinitionId,
    agentVersion,
    agentRunId,
    profilingRunId,
    requestInput,
  } = input

  const admin = createAdminClient()
  let stepId: string | null = null
  try {
    const startedAt = new Date().toISOString()
    const { error: startError } = await admin.schema('agent').from('agent_runs').update({
      status: 'RUNNING',
      started_at: startedAt,
    }).eq('id', agentRunId).eq('status', 'QUEUED')
    if (startError) throw new Error(`Unable to start queued profiling job: ${startError.message}`)

    if (await isRunCancelled(agentRunId)) {
      await preserveCancellation(agentRunId, profilingRunId)
      return
    }

    const requiredTools = ['profile_dataset', 'execute_metrics', 'investigate_profile']
    const { data: toolRows, error: toolsError } = await admin.schema('agent').from('tool_definitions').select('*').eq('agent_definition_id', agentDefinitionId).eq('enabled', true).in('tool_key', requiredTools).order('version', { ascending: false })
    if (toolsError) throw new Error(`Unable to load profiling tools: ${toolsError.message}`)
    const toolMap = new Map<string, any>()
    for (const tool of toolRows ?? []) if (!toolMap.has(tool.tool_key)) toolMap.set(tool.tool_key, tool)
    for (const key of requiredTools) if (!toolMap.has(key)) throw new Error(`Required profiling tool is not configured: ${key}`)

    const profileTool = toolMap.get('profile_dataset')
    const metricTool = toolMap.get('execute_metrics')
    const investigationTool = toolMap.get('investigate_profile')

    const { data: profileStep, error: profileStepError } = await admin.schema('agent').from('agent_run_steps').insert({
      agent_run_id: agentRunId,
      step_name: profileTool.tool_key,
      step_order: 1,
      status: 'RUNNING',
      input: { ...requestInput, profilingRunId, tool_definition_id: profileTool.id, tool_version: profileTool.version },
      started_at: startedAt,
    }).select('id').single()
    if (profileStepError || !profileStep) throw new Error(`Unable to create profiling step: ${profileStepError?.message ?? 'unknown error'}`)
    stepId = profileStep.id
    const activeProfileStepId = profileStep.id

    const context = { agentRunId, stepId: activeProfileStepId, projectId, agentDefinitionId, agentVersion } satisfies ToolExecutionContext
    const profileResult = await executeProfilingExecutor('profile_dataset', { ...requestInput, datasetVersionId, profilingRunId }, context)
    if (await isRunCancelled(agentRunId)) { await preserveCancellation(agentRunId, profilingRunId, activeProfileStepId); return }
    await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: profileResult, completed_at: new Date().toISOString() }).eq('id', activeProfileStepId).eq('status', 'RUNNING'), 'complete profile step')

    const { data: metricStep, error: metricStepError } = await admin.schema('agent').from('agent_run_steps').insert({
      agent_run_id: agentRunId,
      step_name: metricTool.tool_key,
      step_order: 2,
      status: 'RUNNING',
      input: { ...requestInput, profilingRunId, tool_definition_id: metricTool.id, tool_version: metricTool.version },
      started_at: new Date().toISOString(),
    }).select('id').single()
    if (metricStepError || !metricStep) throw new Error(`Unable to create metric execution step: ${metricStepError?.message ?? 'unknown error'}`)
    stepId = metricStep.id
    const activeMetricStepId = metricStep.id

    const metricResult = await executeProfilingExecutor('execute_metrics', { ...requestInput, datasetVersionId, profilingRunId }, { ...context, stepId: activeMetricStepId })
    if (await isRunCancelled(agentRunId)) { await preserveCancellation(agentRunId, profilingRunId, activeMetricStepId); return }
    await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: metricResult, completed_at: new Date().toISOString() }).eq('id', activeMetricStepId).eq('status', 'RUNNING'), 'complete metric step')

    const { data: investigationStep, error: investigationStepError } = await admin.schema('agent').from('agent_run_steps').insert({
      agent_run_id: agentRunId,
      step_name: investigationTool.tool_key,
      step_order: 3,
      status: 'RUNNING',
      input: { ...requestInput, profilingRunId, tool_definition_id: investigationTool.id, tool_version: investigationTool.version },
      started_at: new Date().toISOString(),
    }).select('id').single()
    if (investigationStepError || !investigationStep) throw new Error(`Unable to create profiling investigation step: ${investigationStepError?.message ?? 'unknown error'}`)
    stepId = investigationStep.id
    const activeInvestigationStepId = investigationStep.id

    const investigationResult = await executeProfilingExecutor('investigate_profile', { ...requestInput, datasetVersionId, profilingRunId }, { ...context, stepId: activeInvestigationStepId })
    if (await isRunCancelled(agentRunId)) { await preserveCancellation(agentRunId, profilingRunId, activeInvestigationStepId); return }

    const validation = await validateProfilingRun(profilingRunId, userId)
    if (!validation.valid) throw new Error(`Profiling contract validation failed: ${validation.warnings.join(' ') || 'persisted results are incomplete.'}`)

    const completedAt = new Date().toISOString()
    await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: investigationResult, completed_at: completedAt }).eq('id', activeInvestigationStepId).eq('status', 'RUNNING'), 'complete investigation step')

    const result = {
      execution_completed: true,
      agent_run_id: agentRunId,
      profiling_run_id: profilingRunId,
      project_id: projectId,
      dataset_version_id: datasetVersionId,
      profile: profileResult,
      metrics: metricResult,
      investigation: investigationResult,
      validation,
    }
    const { error: finalRunError } = await admin.schema('agent').from('agent_runs').update({ status: 'SUCCEEDED', output: result, completed_at: completedAt }).eq('id', agentRunId).eq('status', 'RUNNING')
    if (finalRunError) throw new Error(`Unable to finalize agent run: ${finalRunError.message}`)

    try {
      await executeQualityAutomation({ datasetVersionId, profileRunId: profilingRunId, userId, parentRunId: agentRunId })
    } catch (error) {
      console.error(`[profiling-job] post-profile data quality automation failed: ${errorMessage(error, 'unknown error')}`)
    }

    try {
      await evaluateObservabilitySignals(datasetVersionId, profilingRunId)
    } catch (error) {
      console.error(`[profiling-job] post-profile observability evaluation failed: ${errorMessage(error, 'unknown error')}`)
    }
  } catch (error) {
    const message = errorMessage(error, 'Unknown profiling execution error')
    const completedAt = new Date().toISOString()
    let cancelled = false
    try { cancelled = await isRunCancelled(agentRunId) } catch {}
    if (cancelled) {
      await preserveCancellation(agentRunId, profilingRunId, stepId ?? undefined)
      return
    }
    if (stepId) await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'FAILED', error_code: 'PROFILING_EXECUTION_FAILED', error_message: message, completed_at: completedAt }).eq('id', stepId).eq('status', 'RUNNING'), 'fail current step')
    await safeUpdate(admin.schema('agent').from('agent_runs').update({ status: 'FAILED', error_code: 'PROFILING_EXECUTION_FAILED', error_message: message, completed_at: completedAt }).eq('id', agentRunId).in('status', ['QUEUED','RUNNING']), 'fail agent run')
    await safeUpdate(admin.schema('profiling').from('profile_runs').update({ status: 'FAILED', error_code: 'PROFILING_EXECUTION_FAILED', error_message: message, completed_at: completedAt }).eq('id', profilingRunId).eq('status', 'RUNNING'), 'fail profiling run')
  }
}
