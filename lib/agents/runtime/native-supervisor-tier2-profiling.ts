import { createAdminClient } from '@/lib/supabase/admin'
import { executeProfilingExecutor } from '@/lib/agents/executors/profiling-executor'
import { beginResumableRunStep } from '@/lib/agents/resumable-run-step'
import type { ToolExecutionContext } from '@/lib/agents/types'
import {
  bindNativePlanToPinnedRuntime,
  executeNativeBoundRuntimePlan,
} from '@/lib/agents/runtime/native-autonomy-runtime'
import type { NativeBoundedPlan } from '@/lib/agents/runtime/native-autonomy-kernel'
import {
  finishNativeAgentLifecycle,
  startNativeAgentLifecycle,
  type NativeAgentLifecycle,
} from '@/lib/agents/runtime/native-agent-lifecycle'
import { hashNativeRuntimeValue } from '@/lib/agents/runtime/native-tool-contracts'
import { evaluateNativeSupervisorTrajectory } from '@/lib/agents/runtime/native-trajectory-evaluation'

const PROFILING_AGENT_KEY = 'profiling_agent'
const PROFILING_AGENT_VERSION = '2.0'
const TIER2_TOOL_KEY = 'persist_profile_snapshot'
const TIER2_APPROVED_TOOLS = [TIER2_TOOL_KEY] as const

export type NativeTier2ProfilingSnapshotResult = {
  supervisorRunId: string
  childRunId: string
  planHash: string
  status: 'SUCCEEDED' | 'FAILED' | 'WAITING_APPROVAL'
  completedStepIds: string[]
  code?: string
}

function bounded(value: unknown, max: number, label: string) {
  if (typeof value !== 'string') throw new Error(`${label} is required`)
  const normalized = value.trim()
  if (!normalized || normalized.length > max) throw new Error(`${label} must contain between 1 and ${max} characters`)
  return normalized
}

async function finalizeRun(input: {
  runId: string
  status: 'SUCCEEDED' | 'FAILED'
  output?: Record<string, unknown> | null
  errorCode?: string | null
  errorMessage?: string | null
}) {
  const admin = createAdminClient()
  const { error } = await admin.schema('agent').from('agent_runs').update({
    status: input.status,
    output: input.output ?? null,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage?.slice(0, 2000) ?? null,
    completed_at: new Date().toISOString(),
  }).eq('id', input.runId)
  if (error) throw new Error(`Unable to finalize agent run ${input.runId}: ${error.message}`)
}

export async function runNativeTier2ProfilingSnapshot(input: {
  projectId: string
  actorUserId: string
  goal: string
  profilingRunId: string
}): Promise<NativeTier2ProfilingSnapshotResult> {
  const projectId = bounded(input.projectId, 200, 'projectId')
  const actorUserId = bounded(input.actorUserId, 200, 'actorUserId')
  const goal = bounded(input.goal, 2000, 'goal')
  const profilingRunId = bounded(input.profilingRunId, 200, 'profilingRunId')
  void actorUserId

  const admin = createAdminClient()
  const [supervisorDefinitionResult, profilingDefinitionResult, profileRunResult] = await Promise.all([
    admin.schema('agent').from('agent_definitions')
      .select('id,agent_key,version,enabled')
      .eq('agent_key', 'native_supervisor_agent')
      .eq('version', '1.0')
      .eq('enabled', true)
      .maybeSingle(),
    admin.schema('agent').from('agent_definitions')
      .select('id,agent_key,version,enabled')
      .eq('agent_key', PROFILING_AGENT_KEY)
      .eq('version', PROFILING_AGENT_VERSION)
      .eq('enabled', true)
      .maybeSingle(),
    admin.schema('profiling').from('profile_runs')
      .select('id,project_id,status')
      .eq('id', profilingRunId)
      .eq('project_id', projectId)
      .maybeSingle(),
  ])

  if (supervisorDefinitionResult.error || !supervisorDefinitionResult.data) {
    throw new Error(`Native supervisor definition is unavailable: ${supervisorDefinitionResult.error?.message ?? 'not registered'}`)
  }
  if (profilingDefinitionResult.error || !profilingDefinitionResult.data) {
    throw new Error(`Profiling Agent ${PROFILING_AGENT_VERSION} is unavailable: ${profilingDefinitionResult.error?.message ?? 'not registered'}`)
  }
  if (profileRunResult.error || !profileRunResult.data) {
    throw new Error(`Profiling run is unavailable in the requested project: ${profileRunResult.error?.message ?? 'not found'}`)
  }
  if (!['RUNNING', 'SUCCEEDED', 'PARTIAL'].includes(String(profileRunResult.data.status).toUpperCase())) {
    throw new Error(`Profiling run ${profilingRunId} cannot be snapshotted from status ${profileRunResult.data.status}`)
  }

  const supervisorDefinition = supervisorDefinitionResult.data
  const profilingDefinition = profilingDefinitionResult.data
  const goalHash = hashNativeRuntimeValue({ goal })
  const toolInput = { profiling_run_id: profilingRunId }

  const { data: supervisorRun, error: supervisorRunError } = await admin.schema('agent').from('agent_runs').insert({
    agent_definition_id: supervisorDefinition.id,
    project_id: projectId,
    status: 'RUNNING',
    input: {
      goal_hash: goalHash,
      execution_mode: 'native_supervisor_tier2_profiling_snapshot_v1',
      approved_tool_key: TIER2_TOOL_KEY,
    },
    started_at: new Date().toISOString(),
  }).select('id').single()
  if (supervisorRunError || !supervisorRun) {
    throw new Error(`Unable to create Tier 2 supervisor run: ${supervisorRunError?.message ?? 'unknown error'}`)
  }

  let supervisorLifecycle: NativeAgentLifecycle | null = null
  let childLifecycle: NativeAgentLifecycle | null = null
  let childRunId: string | null = null
  let activeRunStepId: string | null = null
  let planHash: string | null = null

  try {
    supervisorLifecycle = await startNativeAgentLifecycle({
      agentRunId: supervisorRun.id,
      phase: 'PLANNING',
      summary: 'Tier 2 native supervisor runtime pinned before deterministic profiling snapshot planning.',
      evidenceRefs: [{ domain: 'project', id: projectId }],
    })

    const { data: childRun, error: childRunError } = await admin.schema('agent').from('agent_runs').insert({
      agent_definition_id: profilingDefinition.id,
      project_id: projectId,
      parent_run_id: supervisorRun.id,
      status: 'QUEUED',
      input: {
        profiling_run_id: profilingRunId,
        supervisor_goal_hash: goalHash,
        execution_mode: 'native_supervisor_tier2_profiling_snapshot_v1',
      },
    }).select('id').single()
    if (childRunError || !childRun) {
      throw new Error(`Unable to create Tier 2 profiling child run: ${childRunError?.message ?? 'unknown error'}`)
    }
    childRunId = childRun.id

    childLifecycle = await startNativeAgentLifecycle({
      agentRunId: childRun.id,
      phase: 'RUNTIME_READY',
      summary: 'Profiling child runtime pinned before Tier 2 plan binding.',
      evidenceRefs: [{ domain: 'profiling_run', id: profilingRunId }],
    })

    const stepId = 'profiling-persist-profile-snapshot'
    const plan: NativeBoundedPlan = {
      version: '1.0',
      goal,
      projectId,
      steps: [{
        id: stepId,
        agentKey: PROFILING_AGENT_KEY,
        toolKey: TIER2_TOOL_KEY,
        projectId,
        input: toolInput,
        expectedOutcome: 'Persist exactly one replay-safe immutable profiling snapshot for the governed profiling run.',
      }],
    }

    const boundPlan = await bindNativePlanToPinnedRuntime({
      plan,
      stepAgentRunIds: new Map([[stepId, childRun.id]]),
      policy: {
        allowTier2AutomaticExecution: true,
        approvedTier2Tools: TIER2_APPROVED_TOOLS,
      },
    })
    planHash = boundPlan.planHash

    const result = await executeNativeBoundRuntimePlan({
      supervisorAgentRunId: supervisorRun.id,
      boundPlan,
      initialCheckpointId: supervisorLifecycle.checkpointId,
      executeStep: async ({ step, binding }) => {
        if (step.id !== stepId || step.toolKey !== TIER2_TOOL_KEY || binding.agentRunId !== childRun.id) {
          throw new Error('Tier 2 supervisor step binding changed after validation')
        }

        const { error: startError } = await admin.schema('agent').from('agent_runs').update({
          status: 'RUNNING',
          started_at: new Date().toISOString(),
        }).eq('id', childRun.id).in('status', ['QUEUED', 'RUNNING', 'FAILED'])
        if (startError) throw new Error(`Unable to start Tier 2 profiling child run: ${startError.message}`)

        const runStep = await beginResumableRunStep(admin, {
          agentRunId: childRun.id,
          stepName: TIER2_TOOL_KEY,
          stepOrder: 1,
          input: {
            ...toolInput,
            plan_hash: boundPlan.planHash,
            tool_key: TIER2_TOOL_KEY,
          },
        })
        activeRunStepId = runStep.id
        if (runStep.alreadySucceeded) return runStep.output

        const context = {
          agentRunId: childRun.id,
          stepId: runStep.id,
          projectId,
          agentDefinitionId: profilingDefinition.id,
          agentVersion: PROFILING_AGENT_VERSION,
        } satisfies ToolExecutionContext

        try {
          const executed = await executeProfilingExecutor(TIER2_TOOL_KEY, toolInput, context)
          const { error: completeStepError } = await admin.schema('agent').from('agent_run_steps').update({
            status: 'SUCCEEDED',
            output: executed.output,
            completed_at: new Date().toISOString(),
          }).eq('id', runStep.id).eq('status', 'RUNNING')
          if (completeStepError) throw new Error(`Unable to complete Tier 2 profiling run step: ${completeStepError.message}`)
          return executed.output
        } catch (error) {
          await admin.schema('agent').from('agent_run_steps').update({
            status: 'FAILED',
            error_code: error instanceof Error && 'code' in error ? String((error as Error & { code?: unknown }).code ?? 'STEP_FAILED') : 'STEP_FAILED',
            error_message: error instanceof Error ? error.message.slice(0, 2000) : 'Tier 2 profiling step failed.',
            completed_at: new Date().toISOString(),
          }).eq('id', runStep.id).eq('status', 'RUNNING')
          throw error
        }
      },
      validateOutcome: async ({ output }) => {
        if (!output || typeof output !== 'object' || Array.isArray(output)) return { valid: false, code: 'TIER2_OUTPUT_INVALID' }
        const row = output as Record<string, unknown>
        const resultRow = row.result && typeof row.result === 'object' && !Array.isArray(row.result)
          ? row.result as Record<string, unknown>
          : null
        if (row.operation !== TIER2_TOOL_KEY || row.project_id !== projectId || !resultRow) {
          return { valid: false, code: 'TIER2_OUTPUT_ENVELOPE_MISMATCH' }
        }
        return resultRow.profiling_run_id === profilingRunId && typeof resultRow.profile_id === 'string'
          ? { valid: true, code: 'TIER2_PROFILING_SNAPSHOT_VERIFIED' }
          : { valid: false, code: 'TIER2_PROFILING_SNAPSHOT_MISMATCH' }
      },
    })

    if (result.status === 'SUCCEEDED') {
      const output = {
        plan_hash: boundPlan.planHash,
        completed_step_ids: result.completedStepIds,
        profiling_run_id: profilingRunId,
        tool_key: TIER2_TOOL_KEY,
        execution_mode: 'native_supervisor_tier2_profiling_snapshot_v1',
      }
      await finalizeRun({ runId: childRun.id, status: 'SUCCEEDED', output })
      await finishNativeAgentLifecycle({
        lifecycle: childLifecycle,
        phase: 'SUCCEEDED',
        summary: 'Tier 2 profiling snapshot child run completed successfully.',
        output,
        evidenceRefs: activeRunStepId ? [{ domain: 'agent_run_step', id: activeRunStepId }] : [],
      })
      await finalizeRun({ runId: supervisorRun.id, status: 'SUCCEEDED', output })
      await finishNativeAgentLifecycle({
        lifecycle: supervisorLifecycle,
        phase: 'SUCCEEDED',
        summary: 'Tier 2 native supervisor completed the preapproved profiling snapshot plan.',
        output,
      })
      await evaluateNativeSupervisorTrajectory(supervisorRun.id)
      return {
        supervisorRunId: supervisorRun.id,
        childRunId: childRun.id,
        planHash: boundPlan.planHash,
        status: 'SUCCEEDED',
        completedStepIds: result.completedStepIds,
      }
    }

    const terminalCode = result.status === 'WAITING_APPROVAL' ? 'UNEXPECTED_TIER2_APPROVAL_INTERRUPT' : result.code
    await finalizeRun({
      runId: childRun.id,
      status: 'FAILED',
      errorCode: terminalCode,
      errorMessage: `Tier 2 profiling snapshot stopped with ${terminalCode}.`,
    })
    await finishNativeAgentLifecycle({
      lifecycle: childLifecycle,
      phase: 'FAILED',
      summary: `Tier 2 profiling snapshot child run stopped with ${terminalCode}.`,
      evidenceRefs: activeRunStepId ? [{ domain: 'agent_run_step', id: activeRunStepId }] : [],
    })
    await finalizeRun({
      runId: supervisorRun.id,
      status: 'FAILED',
      output: { plan_hash: boundPlan.planHash, completed_step_ids: result.completedStepIds },
      errorCode: terminalCode,
      errorMessage: `Tier 2 native supervisor stopped with ${terminalCode}.`,
    })
    await finishNativeAgentLifecycle({
      lifecycle: supervisorLifecycle,
      phase: 'FAILED',
      summary: `Tier 2 native supervisor stopped with ${terminalCode}.`,
    })
    await evaluateNativeSupervisorTrajectory(supervisorRun.id)
    return {
      supervisorRunId: supervisorRun.id,
      childRunId: childRun.id,
      planHash: boundPlan.planHash,
      status: result.status,
      completedStepIds: result.completedStepIds,
      code: terminalCode,
    }
  } catch (error) {
    if (childRunId) {
      try {
        await finalizeRun({
          runId: childRunId,
          status: 'FAILED',
          errorCode: 'NATIVE_TIER2_SUPERVISOR_ABORTED',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        if (childLifecycle) {
          await finishNativeAgentLifecycle({
            lifecycle: childLifecycle,
            phase: 'FAILED',
            summary: 'Tier 2 profiling child run aborted before governed completion.',
          })
        }
      } catch {
        // Preserve the original failure.
      }
    }
    try {
      await finalizeRun({
        runId: supervisorRun.id,
        status: 'FAILED',
        errorCode: 'NATIVE_TIER2_SUPERVISOR_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      if (supervisorLifecycle) {
        await finishNativeAgentLifecycle({
          lifecycle: supervisorLifecycle,
          phase: 'FAILED',
          summary: 'Tier 2 native supervisor aborted before governed completion.',
          evidenceRefs: planHash ? [{ domain: 'native_plan_hash', id: planHash }] : [],
        })
      }
    } catch {
      // Preserve the original failure.
    }
    throw error
  }
}
