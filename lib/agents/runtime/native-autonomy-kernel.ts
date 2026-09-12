import {
  certifyNativeRollbackContract,
  type NativeRollbackStrategy,
} from './native-rollback-contract'
import {
  getGovernedAgentPolicy,
  isGovernedAgentKey,
  type GovernedAgentKey,
} from '../governed-agent-registry'

export const NATIVE_AUTONOMY_MAX_STEPS = 24
export const NATIVE_AUTONOMY_MAX_DEPENDENCIES_PER_STEP = 8
export const NATIVE_AUTONOMY_MAX_ATTEMPTS = 3
export const NATIVE_AUTONOMY_ALLOWED_AGENTS = [
  'profiling_agent',
  'data_quality_agent',
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
] as const satisfies readonly GovernedAgentKey[]

export type NativeExecutionDecision =
  | 'AUTO_TIER_0'
  | 'AUTO_TIER_1'
  | 'AUTO_TIER_2_PREAPPROVED'
  | 'APPROVAL_REQUIRED'
  | 'PROHIBITED'

export type NativePinnedToolContractSnapshot = {
  tool_key: string
  contract_hash: string
  execution_config: Record<string, unknown>
}

export type NativeToolSafetyCertification = {
  toolKey: string
  readOnly: boolean
  idempotent: boolean
  reversible: boolean
  compensatable: boolean
  destructive: boolean
  privileged: boolean
  governanceAuthorityChange: boolean
  replayCertified: boolean
  rollbackStrategy: NativeRollbackStrategy
  compensationToolKey?: string
  approvalRequired?: boolean
  prohibited?: boolean
  executorKey?: string
  contractHash?: string
}

export type NativePlanStep = {
  id: string
  agentKey: GovernedAgentKey
  toolKey: string
  projectId: string
  input: Record<string, unknown>
  dependsOn?: string[]
  expectedOutcome?: string
  idempotencyKey?: string
}

export type NativeBoundedPlan = {
  version: '1.0'
  goal: string
  projectId: string
  steps: NativePlanStep[]
}

export type NativeAutonomyPolicy = {
  allowTier2AutomaticExecution: boolean
  approvedTier2Tools?: readonly string[]
}

export type NativeValidatedStep = NativePlanStep & {
  decision: NativeExecutionDecision
  riskTier: 0 | 1 | 2 | 3
  requiresHumanApproval: boolean
  retryCertified: boolean
  contractHash?: string
  executorKey?: string
}

export type NativeValidatedPlan = Omit<NativeBoundedPlan, 'steps'> & {
  steps: NativeValidatedStep[]
}

export class NativePlanValidationError extends Error {
  readonly code = 'NATIVE_PLAN_VALIDATION_FAILED'
  readonly violations: string[]

  constructor(violations: string[]) {
    super(`Native plan validation failed: ${violations.slice(0, 12).join('; ')}`)
    this.name = 'NativePlanValidationError'
    this.violations = violations
  }
}

function boundedText(value: unknown, field: string, max: number, violations: string[]) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    violations.push(`${field} must contain between 1 and ${max} characters`)
  }
}

function contractFlag(config: Record<string, unknown>, toolKey: string, ...keys: string[]) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(config, key)) continue
    const value = config[key]
    if (typeof value !== 'boolean') {
      throw new NativePlanValidationError([`${toolKey}: execution_config.${key} must be boolean`])
    }
    return value
  }
  return false
}

/**
 * Safety classification is derived only from the immutable pinned tool contract.
 * Missing safety capabilities are false. Nothing is inferred from names, prompts,
 * historical model output, or prior successful execution.
 */
export function certifyNativePinnedToolContract(
  contract: NativePinnedToolContractSnapshot,
): NativeToolSafetyCertification {
  const violations: string[] = []
  boundedText(contract.tool_key, 'tool_key', 240, violations)
  if (!/^sha256:[0-9a-f]{64}$/.test(contract.contract_hash)) {
    violations.push(`${contract.tool_key}: invalid pinned contract hash`)
  }
  if (!contract.execution_config || typeof contract.execution_config !== 'object' || Array.isArray(contract.execution_config)) {
    violations.push(`${contract.tool_key}: execution_config must be an object`)
  }
  if (violations.length) throw new NativePlanValidationError(violations)

  const config = contract.execution_config
  const executor = config.executor
  if (typeof executor !== 'string' || !executor.trim()) {
    throw new NativePlanValidationError([`${contract.tool_key}: pinned executor is required`])
  }

  const readOnly = contractFlag(config, contract.tool_key, 'read_only', 'readOnly')
  const reversible = contractFlag(config, contract.tool_key, 'reversible')
  const compensatable = contractFlag(config, contract.tool_key, 'compensatable')
  let rollback
  try {
    rollback = certifyNativeRollbackContract({
      config,
      toolKey: contract.tool_key,
      readOnly,
      reversible,
      compensatable,
    })
  } catch (error) {
    throw new NativePlanValidationError([
      error instanceof Error ? error.message : `${contract.tool_key}: invalid rollback contract`,
    ])
  }

  const certification: NativeToolSafetyCertification = {
    toolKey: contract.tool_key,
    readOnly,
    idempotent: contractFlag(config, contract.tool_key, 'idempotent'),
    reversible,
    compensatable,
    destructive: contractFlag(config, contract.tool_key, 'destructive'),
    privileged: contractFlag(config, contract.tool_key, 'privileged'),
    governanceAuthorityChange: contractFlag(config, contract.tool_key, 'governance_authority_change', 'governanceAuthorityChange'),
    replayCertified: contractFlag(config, contract.tool_key, 'replay_certified', 'replayCertified'),
    rollbackStrategy: rollback.rollbackStrategy,
    compensationToolKey: rollback.compensationToolKey,
    approvalRequired: contractFlag(config, contract.tool_key, 'approval_required', 'requires_human_approval', 'approvalRequired'),
    prohibited: contractFlag(config, contract.tool_key, 'autonomy_prohibited', 'prohibited'),
    executorKey: executor.trim(),
    contractHash: contract.contract_hash,
  }

  if (certification.readOnly && (certification.destructive || certification.governanceAuthorityChange)) {
    throw new NativePlanValidationError([`${contract.tool_key}: read-only contract has contradictory mutation flags`])
  }
  if (certification.replayCertified && !certification.readOnly && !certification.idempotent) {
    throw new NativePlanValidationError([`${contract.tool_key}: replay certification requires read-only or idempotent execution`])
  }

  return certification
}

export function certifyNativePinnedToolContracts(
  contracts: ReadonlyMap<string, NativePinnedToolContractSnapshot>,
) {
  return new Map(Array.from(contracts.entries(), ([toolKey, contract]) => {
    if (toolKey !== contract.tool_key) {
      throw new NativePlanValidationError([`${toolKey}: pinned contract map key mismatch`])
    }
    return [toolKey, certifyNativePinnedToolContract(contract)] as const
  }))
}

function classifyExecution(
  certification: NativeToolSafetyCertification,
  policy: NativeAutonomyPolicy,
): { decision: NativeExecutionDecision; riskTier: 0 | 1 | 2 | 3 } {
  if (certification.prohibited) return { decision: 'PROHIBITED', riskTier: 3 }

  if (
    certification.approvalRequired
    || certification.governanceAuthorityChange
    || certification.destructive
    || certification.privileged
  ) {
    return { decision: 'APPROVAL_REQUIRED', riskTier: 3 }
  }

  if (certification.readOnly) return { decision: 'AUTO_TIER_0', riskTier: 0 }

  if (
    certification.idempotent
    && certification.replayCertified
    && certification.rollbackStrategy === 'COMPENSATION_TOOL'
    && certification.compensatable
  ) {
    return { decision: 'AUTO_TIER_1', riskTier: 1 }
  }

  const tier2Approved = policy.allowTier2AutomaticExecution
    && (policy.approvedTier2Tools ?? []).includes(certification.toolKey)
    && certification.idempotent
    && certification.replayCertified

  if (tier2Approved) return { decision: 'AUTO_TIER_2_PREAPPROVED', riskTier: 2 }

  return { decision: 'APPROVAL_REQUIRED', riskTier: 3 }
}

function validateTopology(steps: NativePlanStep[], violations: string[]) {
  const ids = new Set<string>()
  for (const step of steps) {
    boundedText(step.id, 'step.id', 160, violations)
    if (ids.has(step.id)) violations.push(`duplicate step id: ${step.id}`)
    ids.add(step.id)
    if ((step.dependsOn?.length ?? 0) > NATIVE_AUTONOMY_MAX_DEPENDENCIES_PER_STEP) {
      violations.push(`${step.id} exceeds dependency limit`)
    }
  }

  for (const step of steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!ids.has(dependency)) violations.push(`${step.id} depends on unknown step ${dependency}`)
      if (dependency === step.id) violations.push(`${step.id} cannot depend on itself`)
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byId = new Map(steps.map((step) => [step.id, step]))

  const visit = (id: string) => {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      violations.push(`dependency cycle detected at ${id}`)
      return
    }
    visiting.add(id)
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }

  for (const step of steps) visit(step.id)
}

export function getNativeDeterministicExecutionOrder<T extends NativePlanStep>(steps: readonly T[]) {
  const byId = new Map(steps.map((step, index) => [step.id, { step, index }]))
  const completed = new Set<string>()
  const ordered: T[] = []

  while (ordered.length < steps.length) {
    const ready = steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => !completed.has(step.id))
      .filter(({ step }) => (step.dependsOn ?? []).every((dependency) => completed.has(dependency)))
      .sort((left, right) => left.index - right.index)

    if (!ready.length) throw new NativePlanValidationError(['plan has unresolved or cyclic dependencies'])
    const next = ready[0].step
    if (!byId.has(next.id)) throw new NativePlanValidationError([`unknown step ${next.id}`])
    ordered.push(next)
    completed.add(next.id)
  }

  return ordered
}

export function validateNativeBoundedPlan(input: {
  plan: NativeBoundedPlan
  certifications: ReadonlyMap<string, NativeToolSafetyCertification>
  policy?: Partial<NativeAutonomyPolicy>
}): NativeValidatedPlan {
  const { plan, certifications } = input
  const policy: NativeAutonomyPolicy = {
    allowTier2AutomaticExecution: input.policy?.allowTier2AutomaticExecution ?? false,
    approvedTier2Tools: input.policy?.approvedTier2Tools ?? [],
  }
  const violations: string[] = []

  if (plan.version !== '1.0') violations.push('unsupported plan version')
  boundedText(plan.goal, 'goal', 2000, violations)
  boundedText(plan.projectId, 'projectId', 200, violations)
  if (!Array.isArray(plan.steps) || plan.steps.length < 1) violations.push('plan must contain at least one step')
  if (plan.steps.length > NATIVE_AUTONOMY_MAX_STEPS) violations.push(`plan exceeds ${NATIVE_AUTONOMY_MAX_STEPS} steps`)

  validateTopology(plan.steps, violations)

  const validatedSteps: NativeValidatedStep[] = []
  for (const step of plan.steps) {
    if (!isGovernedAgentKey(step.agentKey)) {
      violations.push(`${step.id}: unknown governed agent ${String(step.agentKey)}`)
      continue
    }
    if (step.projectId !== plan.projectId) violations.push(`${step.id}: project scope does not match plan project`)
    if (!step.input || typeof step.input !== 'object' || Array.isArray(step.input)) violations.push(`${step.id}: input must be an object`)

    const agentPolicy = getGovernedAgentPolicy(step.agentKey)
    if (!agentPolicy.toolAllowlist.includes(step.toolKey)) {
      violations.push(`${step.id}: tool ${step.toolKey} is not allowed for ${step.agentKey}`)
      continue
    }

    const certification = certifications.get(step.toolKey)
    if (!certification) {
      violations.push(`${step.id}: tool ${step.toolKey} has no safety certification`)
      continue
    }
    if (certification.toolKey !== step.toolKey) violations.push(`${step.id}: certification key mismatch`)

    const classification = classifyExecution(certification, policy)
    validatedSteps.push({
      ...step,
      ...classification,
      requiresHumanApproval: classification.decision === 'APPROVAL_REQUIRED',
      retryCertified: certification.readOnly || Boolean(certification.idempotent && certification.replayCertified),
      contractHash: certification.contractHash,
      executorKey: certification.executorKey,
    })
  }

  if (violations.length) throw new NativePlanValidationError(violations)
  return { ...plan, steps: validatedSteps }
}

export type NativePlanner = (input: {
  goal: string
  projectId: string
  maxSteps: number
  allowedAgents: readonly GovernedAgentKey[]
}) => Promise<NativeBoundedPlan>

export async function prepareNativeAutonomousExecution(input: {
  goal: string
  projectId: string
  planner: NativePlanner
  certifications: ReadonlyMap<string, NativeToolSafetyCertification>
  policy?: Partial<NativeAutonomyPolicy>
}): Promise<NativeValidatedPlan> {
  const candidate = await input.planner({
    goal: input.goal,
    projectId: input.projectId,
    maxSteps: NATIVE_AUTONOMY_MAX_STEPS,
    allowedAgents: NATIVE_AUTONOMY_ALLOWED_AGENTS,
  })

  if (candidate.goal !== input.goal) throw new NativePlanValidationError(['planner changed the requested goal'])
  if (candidate.projectId !== input.projectId) throw new NativePlanValidationError(['planner changed the project scope'])

  return validateNativeBoundedPlan({
    plan: candidate,
    certifications: input.certifications,
    policy: input.policy,
  })
}

export type NativeStepValidationResult = {
  valid: boolean
  code?: string
}

export type NativeRecoveryDecision = 'RETRY' | 'COMPENSATED' | 'ESCALATE' | 'FAIL'

export type NativeClosedLoopEvent = {
  type:
    | 'PLAN_STARTED'
    | 'STEP_STARTED'
    | 'STEP_EXECUTED'
    | 'STEP_VALIDATED'
    | 'STEP_FAILED'
    | 'RECOVERY_DECIDED'
    | 'APPROVAL_REQUIRED'
    | 'PLAN_SUCCEEDED'
    | 'PLAN_FAILED'
  step?: NativeValidatedStep
  stepOrder?: number
  attempt?: number
  output?: unknown
  error?: unknown
  code?: string
  recoveryDecision?: NativeRecoveryDecision
}

export type NativeClosedLoopRuntime = {
  executeStep(input: { step: NativeValidatedStep; stepOrder: number; attempt: number }): Promise<unknown>
  validateOutcome(input: { step: NativeValidatedStep; stepOrder: number; attempt: number; output: unknown }): Promise<NativeStepValidationResult>
  recover?(input: { step: NativeValidatedStep; stepOrder: number; attempt: number; error: unknown }): Promise<NativeRecoveryDecision>
  requestApproval?(input: { step: NativeValidatedStep; stepOrder: number }): Promise<string>
  onEvent?(event: NativeClosedLoopEvent): Promise<void>
}

export type NativeClosedLoopResult =
  | { status: 'SUCCEEDED'; completedStepIds: string[] }
  | { status: 'WAITING_APPROVAL'; completedStepIds: string[]; stepId: string; interruptId?: string }
  | { status: 'FAILED'; completedStepIds: string[]; stepId?: string; code: string }

async function emit(runtime: NativeClosedLoopRuntime, event: NativeClosedLoopEvent) {
  await runtime.onEvent?.(event)
}

/**
 * Generic deterministic execution loop. It never invents authority. The plan must already
 * be validated, approval-required steps pause, prohibited steps fail closed, and automatic
 * retries are allowed only for retry-certified steps within the bounded attempt ceiling.
 */
export async function executeNativeClosedLoop(input: {
  plan: NativeValidatedPlan
  runtime: NativeClosedLoopRuntime
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
        const errorCode = typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: unknown }).code ?? 'STEP_FAILED')
          : 'STEP_FAILED'
        await emit(input.runtime, { type: 'STEP_FAILED', step, stepOrder, attempt, error, code: errorCode })

        const recoveryDecision = await input.runtime.recover?.({ step, stepOrder, attempt, error }) ?? 'FAIL'
        await emit(input.runtime, {
          type: 'RECOVERY_DECIDED',
          step,
          stepOrder,
          attempt,
          error,
          code: errorCode,
          recoveryDecision,
        })

        if (
          recoveryDecision === 'RETRY'
          && step.retryCertified
          && attempt < NATIVE_AUTONOMY_MAX_ATTEMPTS
        ) {
          attempt += 1
          continue
        }

        const terminalCode = recoveryDecision === 'COMPENSATED'
          ? 'STEP_FAILED_COMPENSATED'
          : recoveryDecision === 'ESCALATE'
            ? 'RECOVERY_ESCALATION_REQUIRED'
            : recoveryDecision === 'RETRY' && !step.retryCertified
              ? 'UNSAFE_RETRY_BLOCKED'
              : errorCode
        await emit(input.runtime, { type: 'PLAN_FAILED', step, stepOrder, attempt, error, code: terminalCode })
        return { status: 'FAILED', completedStepIds, stepId: step.id, code: terminalCode }
      }
    }
  }

  await emit(input.runtime, { type: 'PLAN_SUCCEEDED' })
  return { status: 'SUCCEEDED', completedStepIds }
}
