import { recordMonitorAttempt, recordMonitorPlan } from '@/lib/monitoring/execution-evidence'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeProfilingExecutor } from '@/lib/agents/executors/profiling-executor'
import { persistAgentRunResultArtifact } from '@/lib/agents/run-result-artifact'
import { validateProfilingRun } from '@/lib/profiling/run-validation'
import { recordProfileFailureAlert } from '@/lib/observability/evaluate'
import type { ToolExecutionContext } from '@/lib/agents/types'
import { syncProfileClassifications } from '@/lib/governance/classification'
import { tryReuseProfileEvidence } from '@/lib/profiling/evidence-reuse'

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

async function startOrRetryStep(admin: ReturnType<typeof createAdminClient>, input: {
  agentRunId: string
  stepName: string
  stepOrder: number
  stepInput: Record<string, unknown>
  startedAt: string
}) {
  const { data: existing, error: existingError } = await admin
    .schema('agent')
    .from('agent_run_steps')
    .select('id,agent_run_id,step_name,step_order,status,attempt,started_at,completed_at,error_code')
    .eq('agent_run_id', input.agentRunId)
    .eq('step_order', input.stepOrder)
    .maybeSingle()
  if (existingError) throw new Error(`Unable to resolve profiling step ${input.stepOrder}: ${existingError.message}`)

  if (existing) {
    await recordMonitorAttempt(existing)
    const { data, error } = await admin
      .schema('agent')
      .from('agent_run_steps')
      .update({
        step_name: input.stepName,
        status: 'RUNNING',
        attempt: Number(existing.attempt ?? 1) + 1,
        input: input.stepInput,
        output: null,
        started_at: input.startedAt,
        completed_at: null,
        error_code: null,
        error_message: null,
      })
      .eq('id', existing.id)
      .eq('attempt', existing.attempt)
      .eq('status', existing.status)
      .select('id')
      .single()
    if (error || !data) throw new Error(`Unable to restart profiling step ${input.stepOrder}: ${error?.message ?? 'unknown error'}`)
    return data
  }

  const { data, error } = await admin
    .schema('agent')
    .from('agent_run_steps')
    .insert({
      agent_run_id: input.agentRunId,
      step_name: input.stepName,
      step_order: input.stepOrder,
      status: 'RUNNING',
      input: input.stepInput,
      started_at: input.startedAt,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Unable to create profiling step ${input.stepOrder}: ${error?.message ?? 'unknown error'}`)
  return data
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

    await recordMonitorPlan({
      version: 1, runId: agentRunId,
      revision: [profileTool, metricTool, investigationTool].map(tool => `${tool.id}:${tool.version}`).join(':'),
      complete: true,
      steps: [profileTool, metricTool, investigationTool].map((tool, index) => ({
        id: `profiling-${index + 1}`, runId: agentRunId, order: index + 1,
        name: tool.tool_key, dependsOn: index ? [`profiling-${index}`] : [],
      })),
    })

    const profileStep = await startOrRetryStep(admin, {
      agentRunId,
      stepName: profileTool.tool_key,
      stepOrder: 1,
      stepInput: { ...requestInput, profilingRunId, tool_definition_id: profileTool.id, tool_version: profileTool.version },
      startedAt,
    })
    stepId = profileStep.id
    const activeProfileStepId = profileStep.id

    const context = { agentRunId, stepId: activeProfileStepId, projectId, agentDefinitionId, agentVersion } satisfies ToolExecutionContext
    const profileResult = await executeProfilingExecutor('profile_dataset', { ...requestInput, datasetVersionId, profilingRunId }, context)
    if (await isRunCancelled(agentRunId)) { await preserveCancellation(agentRunId, profilingRunId, activeProfileStepId); return }
    await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: profileResult, completed_at: new Date().toISOString() }).eq('id', activeProfileStepId).eq('status', 'RUNNING'), 'complete profile step')

    let reuseDecision = null
    try {
      reuseDecision = await tryReuseProfileEvidence({
        supabase: admin,
        userId,
        projectId,
        datasetVersionId,
        profilingRunId,
        engineName: 'profiling-engine',
        engineVersion: '1.1',
      })
    } catch (error) {
      console.error(`[profiling-job] evidence reuse planner failed safely: ${errorMessage(error, 'unknown reuse error')}`)
    }

    if (reuseDecision?.reused) {
      const reusedAt = new Date().toISOString()
      const reuseOutput = {
        execution_mode: 'REUSED',
        source_profile_run_id: reuseDecision.sourceProfileRunId,
        reason: reuseDecision.reason,
        content_hash_authority: reuseDecision.contentHashAuthority,
        profile_signature: reuseDecision.profileSignature,
      }
      const metricReuseStep = await startOrRetryStep(admin, {
        agentRunId,
        stepName: metricTool.tool_key,
        stepOrder: 2,
        stepInput: { ...requestInput, profilingRunId, tool_definition_id: metricTool.id, tool_version: metricTool.version, execution_mode: 'REUSED' },
        startedAt: reusedAt,
      })
      await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: reuseOutput, completed_at: reusedAt }).eq('id', metricReuseStep.id).eq('status', 'RUNNING'), 'complete reused metric step')
      const investigationReuseStep = await startOrRetryStep(admin, {
        agentRunId,
        stepName: investigationTool.tool_key,
        stepOrder: 3,
        stepInput: { ...requestInput, profilingRunId, tool_definition_id: investigationTool.id, tool_version: investigationTool.version, execution_mode: 'REUSED' },
        startedAt: reusedAt,
      })
      await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: reuseOutput, completed_at: reusedAt }).eq('id', investigationReuseStep.id).eq('status', 'RUNNING'), 'complete reused investigation step')

      const validation = await validateProfilingRun(profilingRunId, userId)
      if (!validation.valid) throw new Error(`Reused profiling contract validation failed: ${validation.warnings.join(' ') || 'persisted results are incomplete.'}`)
      try { await syncProfileClassifications(datasetVersionId, profilingRunId) } catch (error) {
        console.error(`[profiling-job] reused classification sync failed: ${errorMessage(error, 'unknown error')}`)
      }
      const result = {
        execution_completed: true,
        execution_mode: 'REUSED',
        agent_run_id: agentRunId,
        profiling_run_id: profilingRunId,
        project_id: projectId,
        dataset_version_id: datasetVersionId,
        profile: profileResult,
        reuse: reuseDecision,
        validation,
      }
      await persistAgentRunResultArtifact({
        agentRunId,
        output: result,
        name: 'Profiling agent result',
        completedAt: reusedAt,
      })
      return
    }

    const metricStartedAt = new Date().toISOString()
    const metricStep = await startOrRetryStep(admin, {
      agentRunId,
      stepName: metricTool.tool_key,
      stepOrder: 2,
      stepInput: { ...requestInput, profilingRunId, tool_definition_id: metricTool.id, tool_version: metricTool.version },
      startedAt: metricStartedAt,
    })
    stepId = metricStep.id
    const activeMetricStepId = metricStep.id

    const metricResult = await executeProfilingExecutor('execute_metrics', { ...requestInput, datasetVersionId, profilingRunId }, { ...context, stepId: activeMetricStepId })
    if (await isRunCancelled(agentRunId)) { await preserveCancellation(agentRunId, profilingRunId, activeMetricStepId); return }
    await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: metricResult, completed_at: new Date().toISOString() }).eq('id', activeMetricStepId).eq('status', 'RUNNING'), 'complete metric step')

    const investigationStartedAt = new Date().toISOString()
    const investigationStep = await startOrRetryStep(admin, {
      agentRunId,
      stepName: investigationTool.tool_key,
      stepOrder: 3,
      stepInput: { ...requestInput, profilingRunId, tool_definition_id: investigationTool.id, tool_version: investigationTool.version },
      startedAt: investigationStartedAt,
    })
    stepId = investigationStep.id
    const activeInvestigationStepId = investigationStep.id

    const investigationResult = await executeProfilingExecutor('investigate_profile', { ...requestInput, datasetVersionId, profilingRunId }, { ...context, stepId: activeInvestigationStepId })
    if (await isRunCancelled(agentRunId)) { await preserveCancellation(agentRunId, profilingRunId, activeInvestigationStepId); return }

    const validation = await validateProfilingRun(profilingRunId, userId)
    if (!validation.valid) throw new Error(`Profiling contract validation failed: ${validation.warnings.join(' ') || 'persisted results are incomplete.'}`)

    const completedAt = new Date().toISOString()
    await safeUpdate(admin.schema('agent').from('agent_run_steps').update({ status: 'SUCCEEDED', output: investigationResult, completed_at: completedAt }).eq('id', activeInvestigationStepId).eq('status', 'RUNNING'), 'complete investigation step')

    try {
      await syncProfileClassifications(datasetVersionId, profilingRunId)
    } catch (error) {
      console.error(`[profiling-job] classification sync failed: ${errorMessage(error, 'unknown error')}`)
    }

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
    await persistAgentRunResultArtifact({
      agentRunId,
      output: result,
      name: 'Profiling agent result',
      completedAt,
    })

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
    try {
      await recordProfileFailureAlert(datasetVersionId, profilingRunId, message)
    } catch (alertError) {
      console.error(`[profiling-job] unable to persist profiling failure alert: ${errorMessage(alertError, 'unknown error')}`)
    }
  }
}
