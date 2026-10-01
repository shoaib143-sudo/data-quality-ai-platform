import { createAdminClient } from '@/lib/supabase/admin'
import type {
  LearningEvaluationRuntimeBudgetProvider,
  LearningEvaluationRuntimeReservation,
  LearningEvaluationRuntimeEvent,
} from './learning-evaluation-runtime-budget'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requiredUuid(value: string, label: string) {
  const normalized = value.trim()
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a canonical UUID`)
  return normalized
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function finiteNonNegative(value: unknown, label: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`${label} must be a non-negative finite number`)
  return numeric
}

function positiveSafeInteger(value: unknown, label: string) {
  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error(`${label} must be a positive safe integer`)
  return numeric
}

function mapReservation(value: unknown): LearningEvaluationRuntimeReservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Learning runtime budget reservation returned invalid evidence')
  }
  const row = value as Record<string, unknown>
  return {
    reservationId: requiredUuid(String(row.reservationId ?? ''), 'reservationId'),
    pricingVersionId: requiredUuid(String(row.pricingVersionId ?? ''), 'pricingVersionId'),
    reservedCostUsd: finiteNonNegative(row.reservedCostUsd, 'reservedCostUsd'),
    reservedTokens: positiveSafeInteger(row.reservedTokens, 'reservedTokens'),
    latencyMsBudget: positiveSafeInteger(row.latencyMsBudget, 'latencyMsBudget'),
  }
}

function mapEvent(value: unknown): LearningEvaluationRuntimeEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Learning runtime budget event returned invalid evidence')
  }
  const row = value as Record<string, unknown>
  const status = String(row.status)
  if (!['RELEASED','RECONCILED','UNRESOLVED','EXCEEDED'].includes(status)) {
    throw new Error(`Learning runtime budget event returned invalid status: ${status}`)
  }
  return {
    eventId: requiredUuid(String(row.eventId ?? ''), 'eventId'),
    status: status as LearningEvaluationRuntimeEvent['status'],
    eventSequence: positiveSafeInteger(row.eventSequence, 'eventSequence'),
  }
}

export function createGovernanceLearningEvaluationRuntimeBudgetProvider(): LearningEvaluationRuntimeBudgetProvider {
  const admin = createAdminClient()

  return {
    async reserve(input) {
      const projectId = requiredUuid(input.projectId, 'projectId')
      const policyId = requiredUuid(input.policyId, 'policyId')
      const candidateId = requiredUuid(input.candidateId, 'candidateId')
      const invocationId = requiredUuid(input.invocationId, 'invocationId')
      const executionCorrelationId = requiredUuid(input.executionCorrelationId, 'executionCorrelationId')
      const providerId = requiredText(input.providerId, 'providerId')
      const modelName = requiredText(input.modelName, 'modelName')

      const { data: policyData, error: policyError } = await admin.schema('agent').from('learning_evaluation_policies')
        .select('id,project_id,candidate_id,per_run_cost_budget,per_run_token_budget,total_cost_budget,total_token_budget,latency_ms_budget')
        .eq('id', policyId)
        .eq('project_id', projectId)
        .eq('candidate_id', candidateId)
        .maybeSingle()
      if (policyError) throw new Error(`Unable to resolve learning runtime policy: ${policyError.message}`)
      if (!policyData) throw new Error('Learning evaluation runtime policy was not found for candidate')

      const perRunCost = finiteNonNegative(policyData.per_run_cost_budget, 'policy.perRunCost')
      const perRunTokens = positiveSafeInteger(policyData.per_run_token_budget, 'policy.perRunTokens')
      positiveSafeInteger(policyData.total_token_budget, 'policy.totalTokens')
      positiveSafeInteger(policyData.latency_ms_budget, 'policy.latencyMs')

      const { data: pricingData, error: pricingError } = await admin.schema('governance').from('ai_model_pricing_effective')
        .select('id,project_id,provider,model_id,currency,input_price_per_million_tokens,output_price_per_million_tokens')
        .eq('project_id', projectId)
        .eq('provider', providerId)
        .eq('model_id', modelName)
        .eq('currency', 'USD')
        .maybeSingle()
      if (pricingError) throw new Error(`Unable to resolve current learning runtime pricing authority: ${pricingError.message}`)
      if (!pricingData) {
        const error = new Error('Paid learning evaluation is blocked because current USD provider/model pricing authority is unavailable')
        error.name = 'LearningEvaluationPricingUnavailableError'
        throw error
      }

      const inputPrice = finiteNonNegative(pricingData.input_price_per_million_tokens, 'pricing.inputPricePerMillionTokens')
      const outputPrice = finiteNonNegative(pricingData.output_price_per_million_tokens, 'pricing.outputPricePerMillionTokens')
      const conservativePerRunCost = Math.max(inputPrice, outputPrice) * perRunTokens / 1_000_000
      if (conservativePerRunCost > perRunCost + Number.EPSILON) {
        const error = new Error('Locked learning evaluation per-run cost budget is below the conservative token-price ceiling')
        error.name = 'LearningEvaluationRuntimeBudgetUnsafeError'
        throw error
      }

      const { data, error } = await admin.schema('agent').rpc('reserve_learning_evaluation_runtime_budget', {
        p_project_id: projectId,
        p_policy_id: policyId,
        p_candidate_id: candidateId,
        p_variant: input.variant,
        p_invocation_id: invocationId,
        p_execution_correlation_id: executionCorrelationId,
        p_provider_id: providerId,
        p_model_name: modelName,
        p_pricing_version_id: requiredUuid(String(pricingData.id), 'pricingVersionId'),
      })
      if (error) throw new Error(`Learning evaluation runtime admission denied: ${error.message}`)
      return mapReservation(data)
    },

    async recordEvent(input) {
      const { data, error } = await admin.schema('agent').rpc('record_learning_evaluation_runtime_event', {
        p_project_id: requiredUuid(input.projectId, 'projectId'),
        p_policy_id: requiredUuid(input.policyId, 'policyId'),
        p_reservation_id: requiredUuid(input.reservationId, 'reservationId'),
        p_release_without_provider_call: input.releaseWithoutProviderCall,
        p_accounting_complete: input.accountingComplete,
        p_actual_cost_usd: input.actualCostUsd ?? null,
        p_actual_tokens: input.actualTokens ?? null,
        p_actual_latency_ms: input.actualLatencyMs ?? null,
        p_reason: requiredText(input.reason, 'reason'),
      })
      if (error) throw new Error(`Unable to persist learning runtime budget evidence: ${error.message}`)
      return mapEvent(data)
    },
  }
}
