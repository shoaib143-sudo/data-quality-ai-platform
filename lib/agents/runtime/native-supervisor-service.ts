import { createAdminClient } from '@/lib/supabase/admin'
import { executeGovernanceSpecialistAgent } from '@/lib/agents/governance-specialist-agent'
import {
  GOVERNANCE_SPECIALIST_AGENT_KEYS,
  type GovernanceSpecialistAgentKey,
} from '@/lib/agents/governed-agent-registry'
import {
  bindNativePlanToPinnedRuntime,
  executeNativeBoundRuntimePlan,
} from '@/lib/agents/runtime/native-autonomy-runtime'
import type { NativeBoundedPlan } from '@/lib/agents/runtime/native-autonomy-kernel'
import { startNativeAgentLifecycle } from '@/lib/agents/runtime/native-agent-lifecycle'
import { hashNativeRuntimeValue } from '@/lib/agents/runtime/native-tool-contracts'

export type NativeSupervisorWorkerRequest = {
  agentDefinitionId: string
  question?: string | null
}

export type NativeSupervisorRunResult = {
  supervisorRunId: string
  planHash: string
  childRunIds: string[]
  status: 'SUCCEEDED' | 'FAILED' | 'WAITING_APPROVAL'
  completedStepIds: string[]
  failedStepId?: string
  code?: string
}

const allowedSpecialists = new Set<string>(GOVERNANCE_SPECIALIST_AGENT_KEYS)

function boundedText(value: unknown, max: number, label: string) {
  if (typeof value !== 'string') throw new Error(`${label} is required`)
  const normalized = value.trim()
  if (!normalized || normalized.length > max) throw new Error(`${label} must contain between 1 and ${max} characters`)
  return normalized
}

function optionalQuestion(value: unknown) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error('worker question must be a string')
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > 1000) throw new Error('worker question must be 1000 characters or fewer')
  return normalized
}

async function updateSupervisorRun(input: {
  supervisorRunId: string
  status: 'SUCCEEDED' | 'FAILED'
  output?: Record<string, unknown>
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
  }).eq('id', input.supervisorRunId)
  if (error) throw new Error(`Unable to finalize native supervisor run: ${error.message}`)
}

export async function runNativeSpecialistSupervisor(input: {
  projectId: string
  actorUserId: string
  goal: string
  workers: NativeSupervisorWorkerRequest[]
}): Promise<NativeSupervisorRunResult> {
  const projectId = boundedText(input.projectId, 200, 'projectId')
  const actorUserId = boundedText(input.actorUserId, 200, 'actorUserId')
  const goal = boundedText(input.goal, 2000, 'goal')
  if (!Array.isArray(input.workers) || input.workers.length < 1 || input.workers.length > 6) {
    throw new Error('workers must contain between 1 and 6 specialist requests')
  }

  const workers = input.workers.map((worker) => ({
    agentDefinitionId: boundedText(worker.agentDefinitionId, 200, 'agentDefinitionId'),
    question: optionalQuestion(worker.question),
  }))

  const admin = createAdminClient()
  const [{ data: supervisorDefinition, error: supervisorError }, { data: workerDefinitions, error: workersError }] = await Promise.all([
    admin.schema('agent').from('agent_definitions')
      .select('id,agent_key,version,enabled')
      .eq('agent_key', 'native_supervisor_agent')
      .eq('version', '1.0')
      .eq('enabled', true)
      .maybeSingle(),
    admin.schema('agent').from('agent_definitions')
      .select('id,agent_key,version,enabled')
      .in('id', workers.map((worker) => worker.agentDefinitionId))
      .eq('enabled', true),
  ])

  if (supervisorError || !supervisorDefinition) {
    throw new Error(`Native supervisor definition is unavailable: ${supervisorError?.message ?? 'not registered'}`)
  }
  if (workersError) throw new Error(`Unable to resolve native supervisor workers: ${workersError.message}`)

  const workerById = new Map((workerDefinitions ?? []).map((definition) => [definition.id, definition]))
  const resolvedWorkers = workers.map((worker) => {
    const definition = workerById.get(worker.agentDefinitionId)
    if (!definition) throw new Error(`Worker definition ${worker.agentDefinitionId} is unavailable`)
    const agentKey = String(definition.agent_key)
    if (definition.version !== '1.0' || !allowedSpecialists.has(agentKey)) {
      throw new Error(`Worker definition ${worker.agentDefinitionId} is not an enabled governance specialist v1.0`)
    }
    return {
      ...worker,
      agentKey: agentKey as GovernanceSpecialistAgentKey,
    }
  })

  const goalHash = hashNativeRuntimeValue({ goal })
  const { data: supervisorRun, error: supervisorRunError } = await admin.schema('agent').from('agent_runs').insert({
    agent_definition_id: supervisorDefinition.id,
    project_id: projectId,
    status: 'RUNNING',
    input: {
      goal_hash: goalHash,
      worker_count: resolvedWorkers.length,
      execution_mode: 'native_supervisor_specialist_v1',
    },
    started_at: new Date().toISOString(),
  }).select('id').single()
  if (supervisorRunError || !supervisorRun) {
    throw new Error(`Unable to create native supervisor run: ${supervisorRunError?.message ?? 'unknown error'}`)
  }

  let lifecycle
  try {
    lifecycle = await startNativeAgentLifecycle({
      agentRunId: supervisorRun.id,
      phase: 'PLANNING',
      summary: 'Native supervisor runtime pinned before bounded specialist planning.',
      evidenceRefs: [{ domain: 'project', id: projectId }],
    })

    const childRunIds: string[] = []
    const stepAgentRunIds = new Map<string, string>()
    const steps: NativeBoundedPlan['steps'] = []

    for (let index = 0; index < resolvedWorkers.length; index += 1) {
      const worker = resolvedWorkers[index]
      const stepId = `specialist-${index + 1}-${worker.agentKey}`
      const { data: childRun, error: childRunError } = await admin.schema('agent').from('agent_runs').insert({
        agent_definition_id: worker.agentDefinitionId,
        project_id: projectId,
        parent_run_id: supervisorRun.id,
        status: 'QUEUED',
        input: {
          question: worker.question,
          supervisor_goal_hash: goalHash,
          execution_mode: 'native_supervisor_specialist_read_only',
        },
      }).select('id').single()
      if (childRunError || !childRun) {
        throw new Error(`Unable to create supervisor child run for ${worker.agentKey}: ${childRunError?.message ?? 'unknown error'}`)
      }

      childRunIds.push(childRun.id)
      stepAgentRunIds.set(stepId, childRun.id)
      steps.push({
        id: stepId,
        agentKey: worker.agentKey,
        toolKey: 'governance_specialist_investigate',
        projectId,
        input: {
          projectId,
          ...(worker.question ? { question: worker.question } : {}),
        },
        expectedOutcome: 'Governed read-only specialist investigation completes through the pinned native tool contract.',
      })
    }

    const plan: NativeBoundedPlan = {
      version: '1.0',
      goal,
      projectId,
      steps,
    }

    const boundPlan = await bindNativePlanToPinnedRuntime({
      plan,
      stepAgentRunIds,
      policy: {
        allowTier2AutomaticExecution: false,
        approvedTier2Tools: [],
      },
    })

    const result = await executeNativeBoundRuntimePlan({
      supervisorAgentRunId: supervisorRun.id,
      boundPlan,
      initialCheckpointId: lifecycle.checkpointId,
      executeStep: async ({ step, binding, attempt }) => {
        const worker = resolvedWorkers.find((candidate) => candidate.agentKey === step.agentKey && binding.agentRunId === stepAgentRunIds.get(step.id))
        if (!worker) throw new Error(`${step.id}: supervisor worker binding disappeared`)
        const executed = await executeGovernanceSpecialistAgent({
          projectId,
          agentDefinitionId: worker.agentDefinitionId,
          actorUserId,
          question: worker.question,
          existingAgentRunId: binding.agentRunId,
          nativeAttempt: attempt,
        })
        if (executed.runId !== binding.agentRunId) {
          throw new Error(`${step.id}: specialist executor returned an unexpected child run`)
        }
        return executed.output
      },
      validateOutcome: async ({ step, output }) => {
        if (!output || typeof output !== 'object' || Array.isArray(output)) {
          return { valid: false, code: 'SPECIALIST_OUTPUT_INVALID' }
        }
        const agent = (output as { agent?: unknown }).agent
        if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
          return { valid: false, code: 'SPECIALIST_AGENT_IDENTITY_MISSING' }
        }
        const agentKey = String((agent as { key?: unknown }).key ?? '')
        return agentKey === step.agentKey
          ? { valid: true, code: 'SPECIALIST_OUTPUT_VERIFIED' }
          : { valid: false, code: 'SPECIALIST_AGENT_IDENTITY_MISMATCH' }
      },
    })

    if (result.status === 'SUCCEEDED') {
      await updateSupervisorRun({
        supervisorRunId: supervisorRun.id,
        status: 'SUCCEEDED',
        output: {
          plan_hash: boundPlan.planHash,
          completed_step_ids: result.completedStepIds,
          child_run_ids: childRunIds,
          execution_mode: 'native_supervisor_specialist_v1',
        },
      })
      return {
        supervisorRunId: supervisorRun.id,
        planHash: boundPlan.planHash,
        childRunIds,
        status: 'SUCCEEDED',
        completedStepIds: result.completedStepIds,
      }
    }

    if (result.status === 'WAITING_APPROVAL') {
      return {
        supervisorRunId: supervisorRun.id,
        planHash: boundPlan.planHash,
        childRunIds,
        status: 'WAITING_APPROVAL',
        completedStepIds: result.completedStepIds,
        failedStepId: result.stepId,
      }
    }

    await updateSupervisorRun({
      supervisorRunId: supervisorRun.id,
      status: 'FAILED',
      output: {
        plan_hash: boundPlan.planHash,
        completed_step_ids: result.completedStepIds,
        child_run_ids: childRunIds,
        execution_mode: 'native_supervisor_specialist_v1',
      },
      errorCode: result.code,
      errorMessage: `Native supervisor stopped at ${result.stepId ?? 'plan'} with ${result.code}.`,
    })
    return {
      supervisorRunId: supervisorRun.id,
      planHash: boundPlan.planHash,
      childRunIds,
      status: 'FAILED',
      completedStepIds: result.completedStepIds,
      failedStepId: result.stepId,
      code: result.code,
    }
  } catch (error) {
    try {
      await updateSupervisorRun({
        supervisorRunId: supervisorRun.id,
        status: 'FAILED',
        errorCode: 'NATIVE_SUPERVISOR_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    } catch {
      // Preserve the original supervisor failure if terminal evidence persistence also fails.
    }
    throw error
  }
}
