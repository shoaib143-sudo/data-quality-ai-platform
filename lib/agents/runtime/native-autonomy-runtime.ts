import { createAdminClient } from '@/lib/supabase/admin'
import {
  certifyNativePinnedToolContract,
  validateNativeBoundedPlan,
  type NativeAutonomyPolicy,
  type NativeBoundedPlan,
  type NativeClosedLoopEvent,
  type NativeClosedLoopResult,
  type NativeStepValidationResult,
  type NativeToolSafetyCertification,
  type NativeValidatedPlan,
  type NativeValidatedStep,
} from '@/lib/agents/runtime/native-autonomy-kernel'
import {
  createNativeRuntimeCheckpoint,
  hashGovernedActionPayload,
  requestNativeRuntimeInterrupt,
  type NativeRuntimeEvidenceRef,
} from '@/lib/agents/runtime/native-agent-runtime-state'
import {
  executeNativeClosedLoopV2,
} from '@/lib/agents/runtime/native-recovery-v2'
import {
  getNativePinnedToolContract,
  hashNativeRuntimeValue,
  type NativePinnedToolContract,
} from '@/lib/agents/runtime/native-tool-contracts'

export type NativeStepRuntimeBinding = {
  stepId: string
  agentRunId: string
  agentKey: string
  manifestHash: string
  contractHash: string
  executorKey: string
}

export type NativeBoundRuntimePlan = {
  plan: NativeValidatedPlan
  planHash: string
  bindings: ReadonlyMap<string, NativeStepRuntimeBinding>
  policy: NativeAutonomyPolicy
}

async function loadRuntimeBinding(input: {
  plan: NativeBoundedPlan
  stepId: string
  agentKey: string
  toolKey: string
  agentRunId: string
}) {
  const contract = await getNativePinnedToolContract(input.agentRunId, input.toolKey)
  const certification = certifyNativePinnedToolContract(contract)
  const admin = createAdminClient()
  const [{ data: manifest, error: manifestError }, { data: run, error: runError }] = await Promise.all([
    admin
      .schema('agent')
      .from('agent_run_runtime_manifests')
      .select('agent_key,manifest_hash')
      .eq('agent_run_id', input.agentRunId)
      .maybeSingle(),
    admin
      .schema('agent')
      .from('agent_runs')
      .select('project_id')
      .eq('id', input.agentRunId)
      .maybeSingle(),
  ])

  if (manifestError || !manifest) throw new Error(`Unable to load pinned runtime identity for step ${input.stepId}: ${manifestError?.message ?? 'not found'}`)
  if (runError || !run) throw new Error(`Unable to load agent run scope for step ${input.stepId}: ${runError?.message ?? 'not found'}`)
  if (manifest.agent_key !== input.agentKey) throw new Error(`${input.stepId}: pinned agent ${manifest.agent_key} does not match planned agent ${input.agentKey}`)
  if (run.project_id !== input.plan.projectId) throw new Error(`${input.stepId}: agent run is outside the planned project scope`)
  if (!certification.executorKey || !certification.contractHash) throw new Error(`${input.stepId}: pinned runtime certification is incomplete`)

  return {
    certification,
    binding: {
      stepId: input.stepId,
      agentRunId: input.agentRunId,
      agentKey: manifest.agent_key,
      manifestHash: String(manifest.manifest_hash),
      contractHash: certification.contractHash,
      executorKey: certification.executorKey,
    } satisfies NativeStepRuntimeBinding,
  }
}

/**
 * Bind every planned step to an already-pinned agent runtime. This prevents the supervisor
 * from classifying safety from mutable current definitions or from a model-provided claim.
 */
export async function bindNativePlanToPinnedRuntime(input: {
  plan: NativeBoundedPlan
  stepAgentRunIds: ReadonlyMap<string, string>
  policy?: Partial<NativeAutonomyPolicy>
}): Promise<NativeBoundRuntimePlan> {
  const certifications = new Map<string, NativeToolSafetyCertification>()
  const bindings = new Map<string, NativeStepRuntimeBinding>()
  const policy: NativeAutonomyPolicy = {
    allowTier2AutomaticExecution: input.policy?.allowTier2AutomaticExecution ?? false,
    approvedTier2Tools: input.policy?.approvedTier2Tools ?? [],
  }

  for (const step of input.plan.steps) {
    const agentRunId = input.stepAgentRunIds.get(step.id)
    if (!agentRunId) throw new Error(`${step.id}: no pinned agent run binding was supplied`)
    const loaded = await loadRuntimeBinding({
      plan: input.plan,
      stepId: step.id,
      agentKey: step.agentKey,
      toolKey: step.toolKey,
      agentRunId,
    })

    const existing = certifications.get(step.toolKey)
    if (existing?.contractHash && existing.contractHash !== loaded.certification.contractHash) {
      throw new Error(`${step.toolKey}: multiple pinned contract hashes in one supervisor plan are not supported`)
    }
    certifications.set(step.toolKey, loaded.certification)
    bindings.set(step.id, loaded.binding)
  }

  const plan = validateNativeBoundedPlan({ plan: input.plan, certifications, policy })
  return {
    plan,
    planHash: hashNativeRuntimeValue(plan),
    bindings,
    policy,
  }
}

export async function recordNativeSupervisorEvent(input: {
  supervisorAgentRunId: string
  planHash: string
  event: NativeClosedLoopEvent
}) {
  const { event } = input
  const step = event.step
  const inputHash = step ? hashNativeRuntimeValue(step.input) : null
  const outputHash = event.output === undefined ? null : hashNativeRuntimeValue(event.output)
  const detailCode = event.code?.slice(0, 160) ?? event.recoveryDecision ?? null
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('record_supervisor_event_internal', {
    p_agent_run_id: input.supervisorAgentRunId,
    p_event_type: event.type,
    p_plan_hash: input.planHash,
    p_step_id: step?.id ?? null,
    p_step_order: event.stepOrder ?? null,
    p_agent_key: step?.agentKey ?? null,
    p_tool_key: step?.toolKey ?? null,
    p_contract_hash: step?.contractHash ?? null,
    p_input_hash: inputHash,
    p_output_hash: outputHash,
    p_execution_decision: step?.decision ?? null,
    p_risk_tier: step?.riskTier ?? null,
    p_attempt: event.attempt ?? null,
    p_detail_code: detailCode,
  })
  if (error || typeof data !== 'string') {
    throw new Error(`Unable to persist native supervisor event: ${error?.message ?? 'invalid event id'}`)
  }
  return data
}

function checkpointEvidence(planHash: string, extra: NativeRuntimeEvidenceRef[] = []): NativeRuntimeEvidenceRef[] {
  return [{ domain: 'native_supervisor_plan', id: planHash }, ...extra]
}

export async function executeNativeBoundRuntimePlan(input: {
  supervisorAgentRunId: string
  boundPlan: NativeBoundRuntimePlan
  executeStep(args: {
    step: NativeValidatedStep
    binding: NativeStepRuntimeBinding
    stepOrder: number
    attempt: number
  }): Promise<unknown>
  validateOutcome(args: {
    step: NativeValidatedStep
    binding: NativeStepRuntimeBinding
    stepOrder: number
    attempt: number
    output: unknown
  }): Promise<NativeStepValidationResult>
  executeCompensation?(args: {
    failedStep: NativeValidatedStep
    binding: NativeStepRuntimeBinding
    compensationToolKey: string
    contract: NativePinnedToolContract
    toolInput: Record<string, unknown>
    attempt: number
  }): Promise<unknown>
  buildCompensationInput?(args: {
    failedStep: NativeValidatedStep
    binding: NativeStepRuntimeBinding
    compensationToolKey: string
    error: unknown
    attempt: number
  }): Promise<Record<string, unknown>> | Record<string, unknown>
  approvalExpiresAt?: string | null
}): Promise<NativeClosedLoopResult> {
  const { supervisorAgentRunId, boundPlan } = input
  let lastCheckpointId: string | null = null

  const getBinding = (step: NativeValidatedStep) => {
    const binding = boundPlan.bindings.get(step.id)
    if (!binding) throw new Error(`${step.id}: runtime binding disappeared after validation`)
    if (step.contractHash !== binding.contractHash) throw new Error(`${step.id}: contract hash drift after validation`)
    if (step.executorKey !== binding.executorKey) throw new Error(`${step.id}: executor drift after validation`)
    return binding
  }

  const result = await executeNativeClosedLoopV2({
    context: {
      resolveAgentRunId: (step) => getBinding(step).agentRunId,
      policy: boundPlan.policy,
    },
    plan: boundPlan.plan,
    runtime: {
      executeStep: async ({ step, stepOrder, attempt }) => input.executeStep({
        step,
        binding: getBinding(step),
        stepOrder,
        attempt,
      }),
      validateOutcome: async ({ step, stepOrder, attempt, output }) => input.validateOutcome({
        step,
        binding: getBinding(step),
        stepOrder,
        attempt,
        output,
      }),
      executeCompensation: input.executeCompensation
        ? async ({ failedStep, compensationToolKey, contract, toolInput, attempt }) => input.executeCompensation!({
            failedStep,
            binding: getBinding(failedStep),
            compensationToolKey,
            contract,
            toolInput,
            attempt,
          })
        : undefined,
      buildCompensationInput: input.buildCompensationInput
        ? async ({ failedStep, compensationToolKey, error, attempt }) => input.buildCompensationInput!({
            failedStep,
            binding: getBinding(failedStep),
            compensationToolKey,
            error,
            attempt,
          })
        : undefined,
      requestApproval: async ({ step, stepOrder }) => {
        const payloadHash = hashGovernedActionPayload(step.input)
        return requestNativeRuntimeInterrupt({
          agentRunId: supervisorAgentRunId,
          type: 'HUMAN_APPROVAL',
          requestSummary: `Approval required for ${step.toolKey} at supervisor step ${step.id}.`,
          actionKey: step.toolKey,
          actionPayloadHash: payloadHash,
          idempotencyKey: `native-supervisor:${boundPlan.planHash}:${step.id}`,
          expiresAt: input.approvalExpiresAt ?? null,
          state: {
            version: '1.0',
            phase: 'WAITING_APPROVAL',
            step: { name: step.id, order: stepOrder, attempt: 1 },
            evidenceRefs: checkpointEvidence(boundPlan.planHash),
            pendingAction: {
              actionKey: step.toolKey,
              payloadHash,
              riskTier: `TIER_${step.riskTier}`,
              requiresHumanApproval: true,
            },
            userVisibleSummary: `Supervisor paused for approval of ${step.toolKey}.`,
          },
        })
      },
      onEvent: async (event) => {
        const eventId = await recordNativeSupervisorEvent({
          supervisorAgentRunId,
          planHash: boundPlan.planHash,
          event,
        })

        if (!['STEP_VALIDATED', 'PLAN_SUCCEEDED', 'PLAN_FAILED'].includes(event.type)) return
        const step = event.step
        const state = {
          version: '1.0' as const,
          phase: event.type,
          step: step && event.stepOrder
            ? { name: step.id, order: event.stepOrder, attempt: event.attempt ?? 1 }
            : undefined,
          evidenceRefs: checkpointEvidence(boundPlan.planHash, [{ domain: 'native_supervisor_event', id: eventId }]),
          userVisibleSummary: event.type === 'PLAN_SUCCEEDED'
            ? 'Native supervisor completed the validated plan.'
            : event.type === 'PLAN_FAILED'
              ? `Native supervisor stopped safely: ${event.code ?? 'execution failure'}.`
              : `Native supervisor validated step ${step?.id ?? ''}.`,
        }
        lastCheckpointId = await createNativeRuntimeCheckpoint({
          agentRunId: supervisorAgentRunId,
          kind: event.type === 'PLAN_SUCCEEDED' || event.type === 'PLAN_FAILED' ? 'TERMINAL' : 'STEP_BOUNDARY',
          parentCheckpointId: lastCheckpointId,
          state,
        })
      },
    },
  })

  return result
}
