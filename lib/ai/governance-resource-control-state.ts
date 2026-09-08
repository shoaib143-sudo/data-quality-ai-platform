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
  }
  return new GovernedResourceControlState(persistence)
}
