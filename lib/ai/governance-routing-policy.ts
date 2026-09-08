import { createAdminClient } from '@/lib/supabase/admin'
import type { RoutingPolicy, RoutingPolicyContext, RoutingPolicyProvider } from './routing-policy'

export class GovernanceRoutingPolicyProvider implements RoutingPolicyProvider {
  readonly id = 'governance_ai_routing_policy'

  async resolve(context: RoutingPolicyContext): Promise<RoutingPolicy | null> {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .schema('governance')
      .rpc('resolve_ai_routing_policy', {
        p_project_id: context.projectId,
        p_task: context.task,
        p_sensitivity: context.sensitivity ?? 'ANY',
        p_risk: context.risk ?? 'ANY',
      })

    if (error) throw new Error(`Unable to resolve governed AI routing policy: ${error.message}`)
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.id) return null

    return {
      id: row.id,
      task: row.task,
      sensitivity: row.sensitivity,
      risk: row.risk,
      enabled: Boolean(row.enabled),
      allowedAiSystemIds: Array.isArray(row.allowed_ai_system_ids) ? row.allowed_ai_system_ids : [],
      minEvaluationScore: row.min_evaluation_score === null || row.min_evaluation_score === undefined
        ? null
        : Number(row.min_evaluation_score),
      minScoredCount: Number(row.min_scored_count ?? 0),
      allowEnvironmentFallback: Boolean(row.allow_environment_fallback),
    }
  }
}

export function createGovernanceRoutingPolicyProvider(): RoutingPolicyProvider {
  return new GovernanceRoutingPolicyProvider()
}
