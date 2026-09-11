import { createAdminClient } from '@/lib/supabase/admin'

import {
  NATIVE_AUTONOMY_MAX_ATTEMPTS,
  certifyNativePinnedToolContract,
  getNativeDeterministicExecutionOrder,
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
  completeNativeToolInvocation,
  failNativeToolInvocation,
  getNativePinnedToolContract,
  hashNativeRuntimeValue,
  normalizeNativeToolContractInput,
  type NativePinnedToolContract,
} from './native-tool-contracts'

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

async function resolvePriorCompensation(input: {
  agentRunId: string
  compensationKey: string
  contract: NativePinnedToolContract
  inputHash: string
  idempotencyKey: string
}): Promise<NativeRecoveryV2Outcome | null> {
  const prior = await loadCompensationInvocationByIdempotency({
    agentRunId: input.agentRunId,
    toolKey: input.compensationKey,
    idempotencyKey: input.idempotencyKey,
  })
  if (!prior) return null
  if (prior.contract_hash !== input.contract.contract_hash) {
    return { decision: 'FAIL', code: 'COMPENSATION_REPLAY_CONTRACT_DRIFT' }
  }
  if (prior.input_hash !== input.inputHash) {
    return { decision: 'FAIL', code: 'COMPENSATION_REPLAY_INPUT_DRIFT' }
  }
  if (prior.status === 'SUCCEEDED') {
    const compensation = await verifyCompensationInvocation({
      agentRunId: input.agentRunId,
      invocationId: prior.id,
      toolKey: input.compensationKey,
      contractHash: input.contract.contract_hash,
      inputHash: input.inputHash,
    })
    return { decision: 'COMPENSATED', code: 'VERIFIED_COMPENSATION', compensation }
  }
  if (prior.status === 'RUNNING') return { decision: 'ESCALATE', code: 'COMPENSATION_ALREADY_IN_FLIGHT' }
  return { decision: 'ESCALATE', code: 'COMPENSATION_PREVIOUSLY_FAILED' }
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
  const compensationKey = compensationToolKey(input.failedContract)
  if (!compensationKey) return { decision: 'ESCALATE', code: 'NO_CERTIFIED_COMPENSATION' }
  if (!input.runtime.executeCompensation || !input.runtime.buildCompensationInput) {
    return { decision: 'ESCALATE', code: 'COMPENSATION_EXECUTOR_UNAVAILABLE' }
  }

  const contract = await getNativePinnedToolContract(input.agentRunId, compensationKey)
  const certification = certifyNativePinnedToolContract(contract)
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
  const prior = await resolvePriorCompensation({
    agentRunId: input.agentRunId,
    compensationKey,
    contract,
    inputHash,
    idempotencyKey,
  })
  if (prior) return prior

  let admission
  try {
    admission = await admitNativeToolInvocation({
      agentRunId: input.agentRunId,
      toolKey: compensationKey,
      expectedExecutor: compensationStep.executorKey ?? certification.executorKey ?? '',
      toolInput,
      idempotencyKey,
    })
  } catch (error) {
    const raced = await resolvePriorCompensation({
      agentRunId: input.agentRunId,
      compensationKey,
      contract,
      inputHash,
      idempotencyKey,
    })
    if (raced) return raced
    throw error
  }

  try {
    const output = await input.runtime.executeCompensation({
      failedStep: input.failedStep,
      compensationToolKey: compensationKey,
      contract: admission.contract,
      toolInput: admission.toolInput,
      attempt: input.attempt,
    })
    await completeNativeToolInvocation({
      invocationId: admission.invocationId,
      contract: admission.contract,
      output,
    })
    const compensation = await verifyCompensationInvocation({
      agentRunId: input.agentRunId,
      invocationId: admission.invocationId,
      toolKey: compensationKey,
      contractHash: admission.contract.contract_hash,
      inputHash,
    })
    return { decision: 'COMPENSATED', code: 'VERIFIED_COMPENSATION', compensation }
  } catch (error) {
    try {
      await failNativeToolInvocation({
        invocationId: admission.invocationId,
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

  if (certification.rollbackStrategy === 'COMPENSATION_TOOL') {
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

  if (certification.rollbackStrategy === 'ESCALATE_ONLY') {
    return {
      decision: 'ESCALATE',
      code: retryCertified ? 'ROLLBACK_ESCALATION_REQUIRED' : 'STEP_NOT_REPLAY_CERTIFIED',
    }
  }

  return {
    decision: 'FAIL',
    code: 'ROLLBACK_CONTRACT_MISSING',
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
  const ordered = getNativeDeterministicExecutionOrder(input.plan.steps)
  const completedStepIds: string[] = []
  await emit(input.runtime, { type: 'PLAN_STARTED' })

  for (let index = 0; index < ordered.length; index += 1) {
    const step = ordered[index]
    const stepOrder = index + 1

    if (step.decision === 'PROHIBITED') {
      await emit(input.runtime, { type: 'PLAN_FAILED', step, stepOrder, code: 'PROHIBITED_STEP' })
      return { status: 'FAILED', completedStepIds, stepId: step.id, code: 'PROHIBITED_STEP' }
    }
    if (step.requiresHumanApproval) {
      const interruptId = await input.runtime.requestApproval?.({ step, stepOrder })
      await emit(input.runtime, { type: 'APPROVAL_REQUIRED', step, stepOrder })
      return { status: 'WAITING_APPROVAL', completedStepIds, stepId: step.id, interruptId }
    }

    let attempt = 1
    while (attempt <= NATIVE_AUTONOMY_MAX_ATTEMPTS) {
      await emit(input.runtime, { type: 'STEP_STARTED', step, stepOrder, attempt })
      try {
        const output = await input.runtime.executeStep({ step, stepOrder, attempt })
        await emit(input.runtime, { type: 'STEP_EXECUTED', step, stepOrder, attempt, output })
        const validation = await input.runtime.validateOutcome({ step, stepOrder, attempt, output })
        if (validation.valid) {
          await emit(input.runtime, { type: 'STEP_VALIDATED', step, stepOrder, attempt, output, code: validation.code })
          completedStepIds.push(step.id)
          break
        }
        throw Object.assign(new Error(`Step ${step.id} outcome validation failed`), {
          code: validation.code ?? 'OUTCOME_VALIDATION_FAILED',
        })
      } catch (error) {
        const failedCode = errorCode(error)
        await emit(input.runtime, { type: 'STEP_FAILED', step, stepOrder, attempt, error, code: failedCode })

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

        await emit(input.runtime, {
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
        await emit(input.runtime, { type: 'PLAN_FAILED', step, stepOrder, attempt, error, code: terminalCode, recovery })
        return { status: 'FAILED', completedStepIds, stepId: step.id, code: terminalCode }
      }
    }
  }

  await emit(input.runtime, { type: 'PLAN_SUCCEEDED' })
  return { status: 'SUCCEEDED', completedStepIds }
}
