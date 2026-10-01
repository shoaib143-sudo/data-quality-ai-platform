import { createAdminClient } from '@/lib/supabase/admin'
import type { LearningExperimentBudgetAdmission } from './learning-experiment-budget'

export function createGovernanceLearningExperimentBudgetAdmission(): LearningExperimentBudgetAdmission {
  const admin = createAdminClient()
  return {
    async reserve(input) {
      const { data, error } = await admin.schema('agent').rpc('reserve_learning_experiment_budget', {
        p_project_id: input.projectId, p_policy_id: input.policyId, p_candidate_id: input.candidateId,
        p_run_id: input.runId, p_invocation_id: input.invocationId, p_agent_key: input.agentKey, p_mode: input.mode,
        p_reserved_tokens: input.reservedTokens, p_reserved_cost: input.reservedCostUsd,
        p_provider_id: input.providerId, p_model_name: input.modelName, p_pricing_version_id: input.pricingVersionId,
      })
      if (error) throw new Error(`Learning budget reservation failed: ${error.message}`)
      if (!data || typeof data.admitted !== 'boolean' || typeof data.reason !== 'string') throw new Error('Invalid learning budget reservation evidence')
      return { admitted: data.admitted, reason: data.reason, reservationId: data.reservation_id ?? null, deadlineAt: data.deadline_at ?? null }
    },
    async reconcile(input) {
      const { data, error } = await admin.schema('agent').rpc('reconcile_learning_experiment_budget', {
        p_project_id: input.projectId, p_reservation_id: input.reservationId,
        p_observed_tokens: input.observedTokens, p_observed_cost: input.observedCostUsd, p_accounting_complete: input.accountingComplete,
        p_cost_event_id: input.costEventId,
      })
      if (error) throw new Error(`Learning budget reconciliation failed: ${error.message}`)
      if (!data || !['ACCOUNTED', 'UNKNOWN', 'EXCEEDED'].includes(data.status)) throw new Error('Invalid learning budget reconciliation evidence')
      return { status: data.status, reason: data.reason }
    },
  }
}
