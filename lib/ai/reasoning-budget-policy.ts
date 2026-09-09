import type { ReasoningRequest } from './reasoning-provider'

export type ProjectReasoningBudget = {
  policyId: string
  maxOutputTokens: number
}

export interface ReasoningBudgetPolicyProvider {
  resolveProjectBudget(projectId: string): Promise<ProjectReasoningBudget | null>
}

function positiveInteger(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

export function applyProjectOutputBudget(request: ReasoningRequest, budget: ProjectReasoningBudget | null) {
  if (!budget) {
    return {
      request,
      callerRequestedMaxOutputTokens: request.maxOutputTokens ?? null,
      governanceMaxOutputTokens: null,
      effectiveMaxOutputTokens: request.maxOutputTokens ?? null,
      budgetPolicyId: null,
    }
  }

  const governanceMaxOutputTokens = positiveInteger(budget.maxOutputTokens, 'budget.maxOutputTokens')
  const callerRequested = request.maxOutputTokens == null
    ? null
    : positiveInteger(request.maxOutputTokens, 'request.maxOutputTokens')
  const effectiveMaxOutputTokens = callerRequested == null
    ? governanceMaxOutputTokens
    : Math.min(callerRequested, governanceMaxOutputTokens)

  return {
    request: { ...request, maxOutputTokens: effectiveMaxOutputTokens },
    callerRequestedMaxOutputTokens: callerRequested,
    governanceMaxOutputTokens,
    effectiveMaxOutputTokens,
    budgetPolicyId: budget.policyId,
  }
}
