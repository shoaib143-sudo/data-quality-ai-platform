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

export function evaluateAutonomyPolicy(policy: AutonomyPolicy, input: PolicyDecisionInput): PolicyDecision {
  if (!policy.enabled || policy.mode === 'OFF') return { allowed: false, requiresApproval: false, reason: 'Autonomy is disabled.' }
  if (policy.emergencyStop) return { allowed: false, requiresApproval: false, reason: 'Emergency stop is active.' }
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

export function validateBlastRadius(policy: AutonomyPolicy, input: { datasetsChanged: number; projectsAffected: number; remediationActionsThisHour: number }): string[] {
  const errors: string[] = []
  if (input.datasetsChanged > policy.maxDatasetsChangedPerRun) errors.push('Dataset blast-radius limit exceeded.')
  if (input.projectsAffected > policy.maxProjectsAffectedPerRun) errors.push('Project blast-radius limit exceeded.')
  if (input.remediationActionsThisHour > policy.maxRemediationActionsPerHour) errors.push('Remediation rate limit exceeded.')
  return errors
}
