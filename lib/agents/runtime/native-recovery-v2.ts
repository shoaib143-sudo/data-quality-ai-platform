import { createAdminClient } from '@/lib/supabase/admin'

import {
  NATIVE_AUTONOMY_MAX_ATTEMPTS,
  certifyNativePinnedToolContract,
  validateNativeBoundedPlan,
  type NativeAutonomyPolicy,
  type NativeClosedLoopEvent,
  type NativeClosedLoopResult,
  type NativeStepValidationResult,
  type NativeValidatedPlan,
  type NativeValidatedStep,
} from './native-autonomy-kernel'
import {
  admitNativeToolInvocation,
  getNativePinnedToolContract,
  hashNativeRuntimeValue,
  normalizeNativeToolContractInput,
  type NativePinnedToolContract,
} from './native-tool-contracts'
import {
  claimNativeCompensationInvocation,
  completeNativeCompensationInvocation,
  createNativeCompensationExecutionOwner,
  executeWithNativeCompensationLease,
  failNativeCompensationInvocation,
} from './native-compensation-invocations'

export type NativeVerifiedCompensation = {
  invocationId: string
  toolKey: string
  contractHash: string
  outputHash: string
}

export type NativeRecoveryV2Outcome =
  | { decision: 'RETRY'; code: 'CERTIFIED_RETRY' }
  | { decision: 'COMPENSATED'; code: 'VERIFIED_COMPENSATION'; compensation: NativeVerifiedCompensation }
  | { decision: 'ESCALATE'; code: string }
  | { decision: 'FAIL'; code: string }

export type NativeRecoveryV2Runtime = {
  executeStep(input: { step: NativeValidatedStep; stepOrder: number; attempt: number }): Promise<unknown>
  validateOutcome(input: { step: NativeValidatedStep; stepOrder: number; attempt: number; output: unknown }): Promise<NativeStepValidationResult>
  executeCompensation?(input: {
    failedStep: NativeValidatedStep
    compensationToolKey: string
    contract: NativePinnedToolContract
    toolInput: Record<string, unknown>
    attempt: number
    idempotencyKey: string
  }): Promise<unknown>
  buildCompensationInput?(input: {
    failedStep: NativeValidatedStep
    compensationToolKey: string
    error: unknown
    attempt: number
  }): Promise<Record<string, unknown>> | Record<string, unknown>
  requestApproval?(input: { step: NativeValidatedStep; stepOrder: number }): Promise<string>
  onEvent?(event: NativeClosedLoopEvent & { recovery?: NativeRecoveryV2Outcome }): Promise<void>
}

export type NativeRecoveryV2Context = {
  agentRunId?: string
  resolveAgentRunId?: (step: NativeValidatedStep) => string
  policy?: Partial<NativeAutonomyPolicy>
}

function resolveAgentRunId(context: NativeRecoveryV2Context, step: NativeValidatedStep) {
  const value = context.resolveAgentRunId?.(step) ?? context.agentRunId
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${step.id}: Recovery V2 has no pinned child agent run binding`)
  }
  return value.trim()
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code ?? 'STEP_FAILED')
    : 'STEP_FAILED'
}

function stringList(config: Record<string, unknown>, key: string) {
  const value = config[key]
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim())) {
    throw new Error(`Native recovery configuration ${key} must be an array of non-empty strings`)
  }
  return value.map((item) => String(item).trim())
}

function compensationToolKey(contract: NativePinnedToolContract) {
  const value = contract.execution_config.compensation_tool_key
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${contract.tool_key}: compensation_tool_key must be a non-empty string`)
  }
  return value.trim()
}

function replayCertifiedFromPinnedContract(contract: NativePinnedToolContract) {
  const certification = certifyNativePinnedToolContract(contract)
  return {
    certification,
    retryCertified: certification.readOnly || Boolean(certification.idempotent && certification.replayCertified),
  }
}

async function verifyCompensationInvocation(input: {
  agentRunId: string
  invocationId: string
  toolKey: string
  contractHash: string
  inputHash: string
}): Promise<NativeVerifiedCompensation> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_tool_invocations')
    .select('id,agent_run_id,tool_key,contract_hash,input_hash,status,output_hash')
    .eq('id', input.invocationId)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`Unable to verify compensation invocation: ${error?.message ?? 'not found'}`)
  }
  if (data.agent_run_id !== input.agentRunId) throw new Error('Compensation invocation belongs to another agent run')
  if (data.tool_key !== input.toolKey) throw new Error('Compensation invocation tool does not match the admitted tool')
  if (data.contract_hash !== input.contractHash) throw new Error('Compensation invocation contract hash does not match the pinned contract')
  if (data.input_hash !== input.inputHash) throw new Error('Compensation invocation input hash does not match the governed recovery input')
  if (data.status !== 'SUCCEEDED') throw new Error(`Compensation invocation is not successful: ${data.status}`)
  if (typeof data.output_hash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(data.output_hash)) {
    throw new Error('Compensation invocation has no verified output hash')
  }

  return {
    invocationId: data.id,
    toolKey: data.tool_key,
    contractHash: data.contract_hash,
    outputHash: data.output_hash,
  }
}

async function loadCompensationInvocationByIdempotency(input: {
  agentRunId: string
  toolKey: string
  idempotencyKey: string
}) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_tool_invocations')
    .select('id,contract_hash,input_hash,status')
    .eq('agent_run_id', input.agentRunId)
    .eq('tool_key', input.toolKey)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()
  if (error) throw new Error(`Unable to inspect prior compensation invocation: ${error.message}`)
  return data
}

type PriorCompensationResolution =
  | { outcome: NativeRecoveryV2Outcome }
  | { invocationId: string }
  | null

async function resolvePriorCompensation(input: {
  agentRunId: string
  compensationKey: string
  contract: NativePinnedToolContract
  inputHash: string
  idempotencyKey: string
}): Promise<PriorCompensationResolution> {
  const prior = await loadCompensationInvocationByIdempotency({
    agentRunId: input.agentRunId,
    toolKey: input.compensationKey,
    idempotencyKey: input.idempotencyKey,
  })
  if (!prior) return null
  if (prior.contract_hash !== input.contract.contract_hash) {
    return { outcome: { decision: 'FAIL', code: 'COMPENSATION_REPLAY_CONTRACT_DRIFT' } }
  }
  if (prior.input_hash !== input.inputHash) {
    return { outcome: { decision: 'FAIL', code: 'COMPENSATION_REPLAY_INPUT_DRIFT' } }
  }
  if (prior.status === 'SUCCEEDED') {
    const compensation = await verifyCompensationInvocation({
      agentRunId: input.agentRunId,
      invocationId: prior.id,
      toolKey: input.compensationKey,
      contractHash: input.contract.contract_hash,
      inputHash: input.inputHash,
    })
    return { outcome: { decision: 'COMPENSATED', code: 'VERIFIED_COMPENSATION', compensation } }
  }
  if (prior.status === 'ADMITTED') return { invocationId: prior.id }
  return { outcome: { decision: 'ESCALATE', code: 'COMPENSATION_PREVIOUSLY_FAILED' } }
}

function claimRejectionOutcome(reason: string): NativeRecoveryV2Outcome {
  switch (reason) {
    case 'ACTIVE_LEASE': return { decision: 'ESCALATE', code: 'COMPENSATION_ALREADY_IN_FLIGHT' }
    case 'CONTRACT_DRIFT': return { decision: 'FAIL', code: 'COMPENSATION_REPLAY_CONTRACT_DRIFT' }
    case 'UNSAFE_REPLAY': return { decision: 'ESCALATE', code: 'COMPENSATION_NOT_REPLAY_SAFE' }
    default: return { decision: 'ESCALATE', code: 'COMPENSATION_TERMINAL_RACE' }
  }
}

async function executeVerifiedCompensation(input: {
  context: NativeRecoveryV2Context
  runtime: NativeRecoveryV2Runtime
  agentRunId: string
  failedStep: NativeValidatedStep
  failedContract: NativePinnedToolContract
  error: unknown
  attempt: number
}): Promise<NativeRecoveryV2Outcome> {
  const failedCertification = certifyNativePinnedToolContract(input.failedContract)
  if (failedCertification.rollbackStrategy !== 'COMPENSATION_TOOL') {
    return { decision: 'ESCALATE', code: 'NO_CERTIFIED_COMPENSATION' }
  }

  const compensationKey = compensationToolKey(input.failedContract)
  if (!compensationKey || failedCertification.compensationToolKey !== compensationKey) {
    return { decision: 'ESCALATE', code: 'NO_CERTIFIED_COMPENSATION' }
  }
  if (!input.runtime.executeCompensation || !input.runtime.buildCompensationInput) {
    return { decision: 'ESCALATE', code: 'COMPENSATION_EXECUTOR_UNAVAILABLE' }
  }

  const contract = await getNativePinnedToolContract(input.agentRunId, compensationKey)
  const certification = certifyNativePinnedToolContract(contract)
  if (!certification.idempotent || !certification.replayCertified) {
    return { decision: 'ESCALATE', code: 'COMPENSATION_NOT_REPLAY_SAFE' }
  }

  const rawToolInput = await input.runtime.buildCompensationInput({
    failedStep: input.failedStep,
    compensationToolKey: compensationKey,
    error: input.error,
    attempt: input.attempt,
  })
  const toolInput = normalizeNativeToolContractInput(contract, rawToolInput)

  const validated = validateNativeBoundedPlan({
    plan: {
      version: '1.0',
      goal: `Compensate failed step ${input.failedStep.id}`,
      projectId: input.failedStep.projectId,
      steps: [{
        id: `compensate:${input.failedStep.id}:${input.attempt}`,
        agentKey: input.failedStep.agentKey,
        toolKey: compensationKey,
        projectId: input.failedStep.projectId,
        input: toolInput,
      }],
    },
    certifications: new Map([[compensationKey, certification]]),
    policy: input.context.policy,
  })
  const compensationStep = validated.steps[0]
  if (compensationStep.decision === 'PROHIBITED') return { decision: 'FAIL', code: 'COMPENSATION_PROHIBITED' }
  if (compensationStep.requiresHumanApproval) return { decision: 'ESCALATE', code: 'COMPENSATION_REQUIRES_APPROVAL' }

  const idempotencyKey = `recovery:${input.failedStep.id}:${input.attempt}:${compensationKey}`
  const inputHash = hashNativeRuntimeValue(toolInput)
  let invocationId: string | null = null

  const prior = await resolvePriorCompensation({
    agentRunId: input.agentRunId,
    compensationKey,
    contract,
    inputHash,
    idempotencyKey,
  })
  if (prior && 'outcome' in prior) return prior.outcome
  if (prior && 'invocationId' in prior) invocationId = prior.invocationId

  if (!invocationId) {
    try {
      const admission = await admitNativeToolInvocation({
        agentRunId: input.agentRunId,
        toolKey: compensationKey,
        expectedExecutor: compensationStep.executorKey ?? certification.executorKey ?? '',
        toolInput,
        idempotencyKey,
      })
      invocationId = admission.invocationId
    } catch (error) {
      const raced = await resolvePriorCompensation({
        agentRunId: input.agentRunId,
        compensationKey,
        contract,
        inputHash,
        idempotencyKey,
      })
      if (raced && 'outcome' in raced) return raced.outcome
      if (raced && 'invocationId' in raced) invocationId = raced.invocationId
      else throw error
    }
  }

  const executionOwner = createNativeCompensationExecutionOwner()
  const claim = await claimNativeCompensationInvocation({
    invocationId,
    agentRunId: input.agentRunId,
    failedToolKey: input.failedContract.tool_key,
    compensationToolKey: compensationKey,
    contract,
    inputHash,
    idempotencyKey,
    executionOwner,
  })

  if (!claim.claimed) {
    if (claim.reason === 'TERMINAL') {
      const terminal = await resolvePriorCompensation({
        agentRunId: input.agentRunId,
        compensationKey,
        contract,
        inputHash,
        idempotencyKey,
      })
      if (terminal && 'outcome' in terminal) return terminal.outcome
    }
    return claimRejectionOutcome(claim.reason)
  }

  try {
    const output = await executeWithNativeCompensationLease({
      lease: claim.lease,
      execute: () => input.runtime.executeCompensation!({
        failedStep: input.failedStep,
        compensationToolKey: compensationKey,
        contract,
        toolInput,
        attempt: input.attempt,
        idempotencyKey,
      }),
    })
    await completeNativeCompensationInvocation({
      lease: claim.lease,
      contract,
      output,
    })
    const compensation = await verifyCompensationInvocation({
      agentRunId: input.agentRunId,
      invocationId,
      toolKey: compensationKey,
      contractHash: contract.contract_hash,
      inputHash,
    })
    return { decision: 'COMPENSATED', code: 'VERIFIED_COMPENSATION', compensation }
  } catch (error) {
    try {
      await failNativeCompensationInvocation({
        lease: claim.lease,
        errorCode: 'RECOVERY_COMPENSATION_FAILED',
        error,
      })
    } catch {
      return { decision: 'FAIL', code: 'COMPENSATION_EVIDENCE_FAILED' }
    }
    return { decision: 'ESCALATE', code: 'COMPENSATION_FAILED' }
  }
}

export async function recoverNativeStepV2(input: {
  context: NativeRecoveryV2Context
  runtime: NativeRecoveryV2Runtime
  step: NativeValidatedStep
  attempt: number
  error: unknown
}): Promise<NativeRecoveryV2Outcome> {
  const agentRunId = resolveAgentRunId(input.context, input.step)
  const contract = await getNativePinnedToolContract(agentRunId, input.step.toolKey)
  if (!input.step.contractHash) return { decision: 'FAIL', code: 'FAILED_STEP_CONTRACT_HASH_MISSING' }
  if (contract.contract_hash !== input.step.contractHash) {
    return { decision: 'FAIL', code: 'FAILED_STEP_CONTRACT_DRIFT' }
  }

  const { certification, retryCertified } = replayCertifiedFromPinnedContract(contract)
  if (input.step.executorKey && certification.executorKey !== input.step.executorKey) {
    return { decision: 'FAIL', code: 'FAILED_STEP_EXECUTOR_DRIFT' }
  }

  const code = errorCode(input.error)
  const retryableCodes = stringList(contract.execution_config, 'retryable_error_codes')
  if (
    retryCertified
    && input.attempt < NATIVE_AUTONOMY_MAX_ATTEMPTS
    && retryableCodes.includes(code)
  ) {
    return { decision: 'RETRY', code: 'CERTIFIED_RETRY' }
  }

  if (contract.execution_config.compensation_tool_key) {
    return executeVerifiedCompensation({
      context: input.context,
      runtime: input.runtime,
      agentRunId,
      failedStep: input.step,
      failedContract: contract,
      error: input.error,
      attempt: input.attempt,
    })
  }

  return {
    decision: 'ESCALATE',
    code: retryCertified ? 'ERROR_NOT_CERTIFIED_FOR_RETRY' : 'STEP_NOT_REPLAY_CERTIFIED',
  }
}

async function emit(runtime: NativeRecoveryV2Runtime, event: NativeClosedLoopEvent & { recovery?: NativeRecoveryV2Outcome }) {
  await runtime.onEvent?.(event)
}

/**
 * Recovery V2 is the governed closed-loop entry point. It does not accept a caller-supplied
 * COMPENSATED string. Compensation is only reported after this module admits, executes,
 * completes, and re-reads a SUCCEEDED native tool invocation with verified input/output hashes.
 */
export async function executeNativeClosedLoopV2(input: {
  context: NativeRecoveryV2Context
  plan: NativeValidatedPlan
  runtime: NativeRecoveryV2Runtime
}): Promise<NativeClosedLoopResult> {
  const steps = input.plan.steps
  const pending = new Set(steps.map((step) => step.id))
  const completed = new Set<string>()
  const completedStepIds: string[] = []
  const originalIndex = new Map(steps.map((step, index) => [step.id, index]))
  await emit(input.runtime, { type: 'PLAN_STARTED' })

  while (pending.size) {
    const ready = steps
      .filter((step) => pending.has(step.id))
      .filter((step) => (step.dependsOn ?? []).every((dependency) => completed.has(dependency)))
      .sort((left, right) => (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0))

    if (!ready.length) {
      await emit(input.runtime, { type: 'PLAN_FAILED', code: 'UNRESOLVED_DEPENDENCIES' })
      return { status: 'FAILED', completedStepIds, code: 'UNRESOLVED_DEPENDENCIES' }
    }

    const prohibited = ready.find((step) => step.decision === 'PROHIBITED')
    if (prohibited) {
      const stepOrder = (originalIndex.get(prohibited.id) ?? 0) + 1
      await emit(input.runtime, { type: 'PLAN_FAILED', step: prohibited, stepOrder, code: 'PROHIBITED_STEP' })
      return { status: 'FAILED', completedStepIds, stepId: prohibited.id, code: 'PROHIBITED_STEP' }
    }

    const approval = ready.find((step) => step.requiresHumanApproval)
    if (approval) {
      const stepOrder = (originalIndex.get(approval.id) ?? 0) + 1
      const interruptId = await input.runtime.requestApproval?.({ step: approval, stepOrder })
      await emit(input.runtime, { type: 'APPROVAL_REQUIRED', step: approval, stepOrder })
      return { status: 'WAITING_APPROVAL', completedStepIds, stepId: approval.id, interruptId }
    }

    const waveResults = await Promise.all(ready.map(async (step) => {
      const stepOrder = (originalIndex.get(step.id) ?? 0) + 1
      const events: Array<NativeClosedLoopEvent & { recovery?: NativeRecoveryV2Outcome }> = []
      const record = async (event: NativeClosedLoopEvent & { recovery?: NativeRecoveryV2Outcome }) => {
        events.push(event)
      }

      let attempt = 1
      while (attempt <= NATIVE_AUTONOMY_MAX_ATTEMPTS) {
        await record({ type: 'STEP_STARTED', step, stepOrder, attempt })
        try {
          const output = await input.runtime.executeStep({ step, stepOrder, attempt })
          await record({ type: 'STEP_EXECUTED', step, stepOrder, attempt, output })
          const validation = await input.runtime.validateOutcome({ step, stepOrder, attempt, output })
          if (validation.valid) {
            await record({ type: 'STEP_VALIDATED', step, stepOrder, attempt, output, code: validation.code })
            return { step, events, success: true as const }
          }
          throw Object.assign(new Error(`Step ${step.id} outcome validation failed`), {
            code: validation.code ?? 'OUTCOME_VALIDATION_FAILED',
          })
        } catch (error) {
          const failedCode = errorCode(error)
          await record({ type: 'STEP_FAILED', step, stepOrder, attempt, error, code: failedCode })

          let recovery: NativeRecoveryV2Outcome
          try {
            recovery = await recoverNativeStepV2({
              context: input.context,
              runtime: input.runtime,
              step,
              attempt,
              error,
            })
          } catch {
            recovery = { decision: 'FAIL', code: 'RECOVERY_ENGINE_FAILED' }
          }

          await record({
            type: 'RECOVERY_DECIDED',
            step,
            stepOrder,
            attempt,
            error,
            code: recovery.code,
            recoveryDecision: recovery.decision,
            recovery,
          })

          if (recovery.decision === 'RETRY') {
            attempt += 1
            continue
          }

          const terminalCode = recovery.decision === 'COMPENSATED'
            ? 'STEP_FAILED_VERIFIED_COMPENSATION'
            : recovery.code
          await record({ type: 'PLAN_FAILED', step, stepOrder, attempt, error, code: terminalCode, recovery })
          return { step, events, success: false as const, code: terminalCode }
        }
      }

      const terminalCode = 'ATTEMPT_LIMIT_EXHAUSTED'
      await record({ type: 'PLAN_FAILED', step, stepOrder, attempt: NATIVE_AUTONOMY_MAX_ATTEMPTS, code: terminalCode })
      return { step, events, success: false as const, code: terminalCode }
    }))

    let firstFailure: { step: NativeValidatedStep; code: string } | null = null
    for (const result of waveResults) {
      for (const event of result.events) await emit(input.runtime, event)
      if (result.success) {
        pending.delete(result.step.id)
        completed.add(result.step.id)
        completedStepIds.push(result.step.id)
      } else if (!firstFailure) {
        firstFailure = { step: result.step, code: result.code }
      }
    }

    if (firstFailure) {
      return {
        status: 'FAILED',
        completedStepIds,
        stepId: firstFailure.step.id,
        code: firstFailure.code,
      }
    }
  }

  await emit(input.runtime, { type: 'PLAN_SUCCEEDED' })
  return { status: 'SUCCEEDED', completedStepIds }
}
