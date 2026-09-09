import { createAdminClient } from '@/lib/supabase/admin'
import { GovernedResourceControlState, type ResourceControlPersistence } from './resource-control-command-center-state'

export function createGovernanceResourceControlState() {
  const supabase = createAdminClient()
  const persistence: ResourceControlPersistence = {
    async listEffectiveBudgets(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_resource_budget_policy_effective')
        .select('id,project_id,scope_type,scope_key,enabled,max_input_tokens_per_request,max_output_tokens_per_request,max_cost_usd_per_request,max_cost_usd_per_day,max_requests_per_minute,max_concurrent_executions,reviewer_user_id,reviewer_capability,review_note,created_at')
        .eq('project_id', projectId).order('created_at', { ascending: false })
      if (error) throw new Error(`Unable to read effective AI resource budgets: ${error.message}`)
      return data ?? []
    },
    async listEffectiveModelPricing(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_model_pricing_effective')
        .select('id,project_id,provider,model_id,pricing_version,currency,price_unit_tokens,input_price_per_million_tokens,output_price_per_million_tokens,effective_from,effective_to,source_reference,source_uri,reviewed_at,reviewer_capability,review_note')
        .eq('project_id', projectId).order('provider').order('model_id').order('currency')
      if (error) throw new Error(`Unable to read effective AI model pricing: ${error.message}`)
      return data ?? []
    },
    async listEffectiveExecutionControls(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_execution_control_effective')
        .select('id,project_id,scope_type,scope_key,control_action,effective_state,reason,actor_user_id,actor_capability,correlation_id,created_at')
        .eq('project_id', projectId).order('created_at', { ascending: false })
      if (error) throw new Error(`Unable to read effective AI execution controls: ${error.message}`)
      return data ?? []
    },
    async listExecutionControlEvents(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_execution_control_events')
        .select('id,project_id,scope_type,scope_key,control_action,reason,actor_user_id,actor_capability,correlation_id,created_at')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read AI execution-control events: ${error.message}`)
      return data ?? []
    },
    async listRecentBudgetAdmissions(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_resource_budget_request_admissions')
        .select('id,project_id,policy_version_id,correlation_id,admitted_at')
        .eq('project_id', projectId).order('admitted_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read AI resource budget admissions: ${error.message}`)
      return data ?? []
    },
    async listRecentBudgetConcurrencyLeases(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_resource_budget_concurrency_leases')
        .select('id,admission_id,project_id,policy_version_id,correlation_id,acquired_at,expires_at,released_at')
        .eq('project_id', projectId).order('acquired_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read AI resource budget concurrency leases: ${error.message}`)
      return data ?? []
    },
  }
  return new GovernedResourceControlState(persistence)
}
