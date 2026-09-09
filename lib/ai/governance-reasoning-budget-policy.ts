import { createAdminClient } from '@/lib/supabase/admin'
import type { ReasoningBudgetPolicyProvider } from './reasoning-budget-policy'

export function createGovernanceReasoningBudgetPolicyProvider(): ReasoningBudgetPolicyProvider {
  const admin = createAdminClient()
  return {
    async resolveProjectBudget(projectId) {
      const normalizedProjectId = projectId.trim()
      if (!normalizedProjectId) throw new Error('projectId is required')

      const { data, error } = await admin.schema('governance').from('ai_resource_budget_policy_effective')
        .select('id,enabled,max_output_tokens_per_request')
        .eq('project_id', normalizedProjectId)
        .eq('scope_type', 'PROJECT')
        .eq('scope_key', 'PROJECT')
        .maybeSingle()

      if (error) throw new Error(`Unable to resolve project AI reasoning budget: ${error.message}`)
      if (!data || !data.enabled || data.max_output_tokens_per_request == null) return null

      const maxOutputTokens = Number(data.max_output_tokens_per_request)
      if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
        throw new Error('Canonical project max_output_tokens_per_request is invalid')
      }

      return { policyId: data.id, maxOutputTokens }
    },
  }
}
