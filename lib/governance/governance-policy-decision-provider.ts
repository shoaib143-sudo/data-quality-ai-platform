import { createAdminClient } from '@/lib/supabase/admin'
import { createGovernanceTelemetryProvider } from '@/lib/ai/governance-telemetry-provider'
import { currentTelemetryTraceContext } from '@/lib/ai/telemetry-trace-context-store'
import { ObservablePolicyDecisionProvider } from './observable-policy-decision-provider'
import {
  GovernedPolicyDecisionProvider,
  type PolicyDecisionPersistence,
  type PolicyDecisionPolicyRecord,
  type PolicyDecisionVersionRecord,
} from './policy-decision-provider'

export function createGovernancePolicyDecisionProvider() {
  const supabase = createAdminClient()

  const persistence: PolicyDecisionPersistence = {
    async findPolicy(projectId, actionKey) {
      const { data, error } = await supabase.schema('governance').from('autonomy_policies')
        .select('id,project_id,action_key,enabled,execution_mode,min_confidence,max_auto_risk_level,reversible,allowed_target_types,authority_status,current_version_id')
        .eq('project_id', projectId)
        .eq('action_key', actionKey)
        .maybeSingle()
      if (error) throw new Error(`Unable to resolve governed autonomy policy: ${error.message}`)
      return (data ?? null) as PolicyDecisionPolicyRecord | null
    },

    async findPolicyVersion(projectId, policyId, versionId) {
      const { data, error } = await supabase.schema('governance').from('autonomy_policy_versions')
        .select('id,project_id,policy_id,version_number,semantic_hash,provenance')
        .eq('project_id', projectId)
        .eq('policy_id', policyId)
        .eq('id', versionId)
        .maybeSingle()
      if (error) throw new Error(`Unable to verify governed autonomy policy version: ${error.message}`)
      return (data ?? null) as PolicyDecisionVersionRecord | null
    },
  }

  const governed = new GovernedPolicyDecisionProvider(persistence)
  return new ObservablePolicyDecisionProvider(
    governed,
    createGovernanceTelemetryProvider(),
    currentTelemetryTraceContext,
  )
}
