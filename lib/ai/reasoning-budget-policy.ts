export type ProjectReasoningBudget = {
  policyId: string
  maxOutputTokens: number
}

export interface ReasoningBudgetPolicyProvider {
  resolveProjectBudget(projectId: string): Promise<ProjectReasoningBudget | null>
}
