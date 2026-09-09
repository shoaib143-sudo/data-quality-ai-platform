import { createAdminClient } from '@/lib/supabase/admin'
import type { ReasoningBudgetPolicyProvider } from './reasoning-budget-policy'

function optionalPositiveInteger(value: unknown, label: string) {
  if (value == null) return null
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized) || normalized <= 0) throw new Error(`${label} is invalid`)
  return normalized
}

export function createGovernanceReasoningBudgetPolicyProvider(): ReasoningBudgetPolicyProvider {
  const admin = createAdminClient()
  return {
    async resolveProjectBudget(projectId) {
      const normalizedProjectId = projectId.trim()
      if (!normalizedProjectId) throw new Error('projectId is required')

      const { data, error } = await admin.schema('governance').from('ai_resource_budget_policy_effective')
        .select('id,enabled,max_output_tokens_per_request,max_requests_per_minute,max_concurrent_executions')
        .eq('project_id', normalizedProjectId)
        .eq('scope_type', 'PROJECT')
        .eq('scope_key', 'PROJECT')
        .maybeSingle()

      if (error) throw new Error(`Unable to resolve project AI reasoning budget: ${error.message}`)
      if (!data || !data.enabled) return null

      return {
        policyId: data.id,
        maxOutputTokens: optionalPositiveInteger(data.max_output_tokens_per_request, 'Canonical project max_output_tokens_per_request'),
        maxRequestsPerMinute: optionalPositiveInteger(data.max_requests_per_minute, 'Canonical project max_requests_per_minute'),
        maxConcurrentExecutions: optionalPositiveInteger(data.max_concurrent_executions, 'Canonical project max_concurrent_executions'),
      }
    },
  }
}
