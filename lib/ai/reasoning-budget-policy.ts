export type ReasoningBudgetScopeType = 'PROJECT' | 'AI_SYSTEM' | 'AGENT'

export type ReasoningAdmissionPolicy = {
  policyId: string
  scopeType: ReasoningBudgetScopeType
  scopeKey: string
  maxRequestsPerMinute: number | null
  maxConcurrentExecutions: number | null
  maxCostUsdPerRequest: number | null
  maxCostUsdPerDay: number | null
}

export type ProjectReasoningBudget = {
  /** Backward-compatible primary policy identity. Prefer policyIds for composed budgets. */
  policyId: string
  maxOutputTokens: number | null
  maxRequestsPerMinute: number | null
  maxConcurrentExecutions: number | null
  maxCostUsdPerRequest: number | null
  maxCostUsdPerDay: number | null
  policyIds?: string[]
  admissionPolicies?: ReasoningAdmissionPolicy[]
}

export type ReasoningBudgetContext = {
  projectId: string
  aiSystemId?: string | null
  agentDefinitionId?: string | null
}

export interface ReasoningBudgetPolicyProvider {
  resolveProjectBudget(projectId: string): Promise<ProjectReasoningBudget | null>
  /** ADR-008 composed scope resolution. Optional for backward-compatible test/provider implementations. */
  resolveBudget?(context: ReasoningBudgetContext): Promise<ProjectReasoningBudget | null>
}
