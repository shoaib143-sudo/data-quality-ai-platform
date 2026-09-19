export type AutonomyMode = 'OFF' | 'GUIDED' | 'GOVERNED_AUTO' | 'FULL_AUTONOMOUS'
export type RiskTier = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type AutonomyPolicy = {
  mode: AutonomyMode
  enabled: boolean
  policyVersion: string
  maximumRiskTier: RiskTier
  allowedAgentKeys: string[]
  allowedToolKeys: string[]
  allowedModelClasses: string[]
  allowedMutationClasses: string[]
  approvalRequiredActions: string[]
  autoRemediationEnabled: boolean
  autoRollbackEnabled: boolean
  maxExecutionBudget: number
  maxModelBudget: number
  maxRuntimeMs: number
  maxDatasetsChangedPerRun: number
  maxProjectsAffectedPerRun: number
  maxRemediationActionsPerHour: number
  maxConcurrentModelCalls: number
  emergencyStop: boolean
}

const riskRank: Record<RiskTier, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
}

export type PolicyDecisionInput = {
  riskTier: RiskTier
  actionKey: string
  agentKey?: string
  toolKey?: string
  modelClass?: string
  mutationClass?: string
  estimatedExecutionCost: number
  estimatedModelCost: number
}

export type PolicyDecision = {
  allowed: boolean
  requiresApproval: boolean
  reason: string
}

function uniqueNonBlank(values: string[]): boolean {
  return values.every(value => value.trim().length > 0) && new Set(values).size === values.length
}

export function validateAutonomyPolicy(policy: AutonomyPolicy): string[] {
  const errors: string[] = []
  if (!policy.policyVersion.trim()) errors.push('Policy version must not be blank.')
  if (!Number.isFinite(policy.maxExecutionBudget) || policy.maxExecutionBudget < 0) errors.push('Execution budget must be finite and >= 0.')
  if (!Number.isFinite(policy.maxModelBudget) || policy.maxModelBudget < 0) errors.push('Model budget must be finite and >= 0.')
  if (!Number.isFinite(policy.maxRuntimeMs) || policy.maxRuntimeMs <= 0) errors.push('Runtime limit must be finite and > 0.')
  if (!Number.isInteger(policy.maxDatasetsChangedPerRun) || policy.maxDatasetsChangedPerRun < 0) errors.push('Dataset blast-radius limit must be an integer >= 0.')
  if (!Number.isInteger(policy.maxProjectsAffectedPerRun) || policy.maxProjectsAffectedPerRun < 0) errors.push('Project blast-radius limit must be an integer >= 0.')
  if (!Number.isInteger(policy.maxRemediationActionsPerHour) || policy.maxRemediationActionsPerHour < 0) errors.push('Remediation rate limit must be an integer >= 0.')
  if (!Number.isInteger(policy.maxConcurrentModelCalls) || policy.maxConcurrentModelCalls < 1) errors.push('Concurrent model-call limit must be an integer >= 1.')
  if (!uniqueNonBlank(policy.allowedAgentKeys)) errors.push('Allowed agent keys must be unique and non-blank.')
  if (!uniqueNonBlank(policy.allowedToolKeys)) errors.push('Allowed tool keys must be unique and non-blank.')
  if (!uniqueNonBlank(policy.allowedModelClasses)) errors.push('Allowed model classes must be unique and non-blank.')
  if (!uniqueNonBlank(policy.allowedMutationClasses)) errors.push('Allowed mutation classes must be unique and non-blank.')
  if (!uniqueNonBlank(policy.approvalRequiredActions)) errors.push('Approval-required actions must be unique and non-blank.')
  return errors
}

export function evaluateAutonomyPolicy(policy: AutonomyPolicy, input: PolicyDecisionInput): PolicyDecision {
  const policyErrors = validateAutonomyPolicy(policy)
  if (policyErrors.length > 0) return { allowed: false, requiresApproval: false, reason: `Autonomy policy is invalid: ${policyErrors.join(' ')}` }
  if (!policy.enabled || policy.mode === 'OFF') return { allowed: false, requiresApproval: false, reason: 'Autonomy is disabled.' }
  if (policy.emergencyStop) return { allowed: false, requiresApproval: false, reason: 'Emergency stop is active.' }
  if (!input.actionKey.trim()) return { allowed: false, requiresApproval: false, reason: 'Action key is required.' }
  if (!Number.isFinite(input.estimatedExecutionCost) || input.estimatedExecutionCost < 0) return { allowed: false, requiresApproval: false, reason: 'Execution cost estimate is invalid.' }
  if (!Number.isFinite(input.estimatedModelCost) || input.estimatedModelCost < 0) return { allowed: false, requiresApproval: false, reason: 'Model cost estimate is invalid.' }
  if (riskRank[input.riskTier] > riskRank[policy.maximumRiskTier]) return { allowed: false, requiresApproval: false, reason: 'Risk tier exceeds policy maximum.' }
  if (input.estimatedExecutionCost > policy.maxExecutionBudget) return { allowed: false, requiresApproval: false, reason: 'Execution budget exceeded.' }
  if (input.estimatedModelCost > policy.maxModelBudget) return { allowed: false, requiresApproval: false, reason: 'Model budget exceeded.' }
  if (input.agentKey && !policy.allowedAgentKeys.includes(input.agentKey)) return { allowed: false, requiresApproval: false, reason: 'Agent is not permitted.' }
  if (input.toolKey && !policy.allowedToolKeys.includes(input.toolKey)) return { allowed: false, requiresApproval: false, reason: 'Tool is not permitted.' }
  if (input.modelClass && !policy.allowedModelClasses.includes(input.modelClass)) return { allowed: false, requiresApproval: false, reason: 'Model class is not permitted.' }
  if (input.mutationClass && !policy.allowedMutationClasses.includes(input.mutationClass)) return { allowed: false, requiresApproval: false, reason: 'Mutation class is not permitted.' }

  const explicitApproval = policy.approvalRequiredActions.includes(input.actionKey)
  const guidedApproval = policy.mode === 'GUIDED'
  return {
    allowed: true,
    requiresApproval: explicitApproval || guidedApproval,
    reason: explicitApproval || guidedApproval ? 'Action is permitted but requires approval.' : 'Action is permitted by the active autonomy policy.',
  }
}

export function validateBlastRadius(
  policy: AutonomyPolicy,
  input: { datasetsChanged: number; projectsAffected: number; remediationActionsThisHour: number },
): string[] {
  const errors: string[] = []
  if (!Number.isInteger(input.datasetsChanged) || input.datasetsChanged < 0) errors.push('Dataset blast-radius observation must be an integer >= 0.')
  if (!Number.isInteger(input.projectsAffected) || input.projectsAffected < 0) errors.push('Project blast-radius observation must be an integer >= 0.')
  if (!Number.isInteger(input.remediationActionsThisHour) || input.remediationActionsThisHour < 0) errors.push('Remediation-rate observation must be an integer >= 0.')
  if (errors.length > 0) return errors
  if (input.datasetsChanged > policy.maxDatasetsChangedPerRun) errors.push('Dataset blast-radius limit exceeded.')
  if (input.projectsAffected > policy.maxProjectsAffectedPerRun) errors.push('Project blast-radius limit exceeded.')
  if (input.remediationActionsThisHour > policy.maxRemediationActionsPerHour) errors.push('Remediation rate limit exceeded.')
  return errors
}
