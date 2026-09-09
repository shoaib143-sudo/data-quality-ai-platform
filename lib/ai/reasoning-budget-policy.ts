export type ProjectReasoningBudget = {
  policyId: string
  maxOutputTokens: number | null
  maxRequestsPerMinute: number | null
  maxConcurrentExecutions: number | null
}

export interface ReasoningBudgetPolicyProvider {
  resolveProjectBudget(projectId: string): Promise<ProjectReasoningBudget | null>
}
