import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ModelCostAccountingProvider,
  ModelCostAccountingRecord,
  ModelCostAccountingStatus,
} from './cost-accounting'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACCOUNTING_STATUSES = new Set<ModelCostAccountingStatus>(['PRICED', 'USAGE_UNAVAILABLE', 'PRICE_UNAVAILABLE'])

function requiredUuid(value: string, label: string) {
  const normalized = value.trim()
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a canonical UUID`)
  return normalized
}

function optionalUuid(value: string | null | undefined, label: string) {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a canonical UUID`)
  return normalized
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function observedTokenCount(value: number | undefined, label: string) {
  if (value == null) return null
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`)
  return value
}

function nullableText(value: unknown) {
  return value == null ? null : String(value)
}

function requiredStatus(value: unknown): ModelCostAccountingStatus {
  const status = String(value) as ModelCostAccountingStatus
  if (!ACCOUNTING_STATUSES.has(status)) throw new Error(`Canonical AI model cost accounting returned invalid status: ${String(value)}`)
  return status
}

function mapRecord(row: Record<string, unknown>): ModelCostAccountingRecord {
  return {
    id: String(row.id),
    invocationId: String(row.invocation_id),
    projectId: String(row.project_id),
    executionCorrelationId: nullableText(row.execution_correlation_id),
    providerRequestId: nullableText(row.provider_request_id),
    providerId: String(row.provider_id),
    modelName: String(row.model_name),
    inputTokens: row.input_tokens == null ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens == null ? null : Number(row.output_tokens),
    totalTokens: row.total_tokens == null ? null : Number(row.total_tokens),
    pricingVersionId: nullableText(row.pricing_version_id),
    currency: nullableText(row.currency),
    inputCost: nullableText(row.input_cost),
    outputCost: nullableText(row.output_cost),
    totalCost: nullableText(row.total_cost),
    accountingStatus: requiredStatus(row.accounting_status),
    observedAt: String(row.observed_at),
    recordedAt: String(row.recorded_at),
  }
}

function hasHardCostLimit(row: Record<string, unknown>) {
  return row.max_cost_usd_per_request != null || row.max_cost_usd_per_day != null
}

export function createGovernanceModelCostAccountingProvider(): ModelCostAccountingProvider {
  const admin = createAdminClient()
  return {
    async recordInvocation(input) {
      const invocationId = requiredUuid(input.invocationId, 'invocationId')
      const projectId = requiredUuid(input.projectId, 'projectId')
      const executionCorrelationId = optionalUuid(input.executionCorrelationId, 'executionCorrelationId')
      const providerId = requiredText(input.providerId, 'providerId')
      const modelName = requiredText(input.modelName, 'modelName')
      const observedAt = new Date(input.observedAt)
      if (Number.isNaN(observedAt.getTime())) throw new Error('observedAt must be a valid timestamp')

      const { data, error } = await admin.schema('governance').rpc('record_ai_model_cost_event', {
        p_invocation_id: invocationId,
        p_project_id: projectId,
        p_execution_correlation_id: executionCorrelationId,
        p_provider_request_id: input.providerRequestId?.trim().slice(0, 256) || null,
        p_provider_id: providerId,
        p_model_name: modelName,
        p_input_tokens: observedTokenCount(input.usage?.inputTokens, 'usage.inputTokens'),
        p_output_tokens: observedTokenCount(input.usage?.outputTokens, 'usage.outputTokens'),
        p_total_tokens: observedTokenCount(input.usage?.totalTokens, 'usage.totalTokens'),
        p_observed_at: observedAt.toISOString(),
      })

      if (error) throw new Error(`Unable to record canonical AI model cost evidence: ${error.message}`)
      if (!data) throw new Error('Canonical AI model cost accounting returned no evidence')
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
      if (!row) throw new Error('Canonical AI model cost accounting returned an empty result')
      const record = mapRecord(row)

      const { data: policyData, error: policyError } = await admin.schema('governance').from('ai_resource_budget_policy_effective')
        .select('id,enabled,max_cost_usd_per_request,max_cost_usd_per_day')
        .eq('project_id', projectId)
        .eq('scope_type', 'PROJECT')
        .eq('scope_key', 'PROJECT')
        .maybeSingle()
      if (policyError) throw new Error(`Unable to resolve governed runtime cost policy: ${policyError.message}`)
      const policy = policyData as Record<string, unknown> | null
      if (!policy || !policy.enabled || !hasHardCostLimit(policy)) return record

      const policyVersionId = requiredUuid(String(policy.id), 'runtime cost policy version')
      const { data: decisionData, error: decisionError } = await admin.schema('governance').rpc('evaluate_ai_project_runtime_cost', {
        p_project_id: projectId,
        p_cost_event_id: requiredUuid(record.id, 'cost evidence id'),
        p_policy_version_id: policyVersionId,
      })
      if (decisionError) throw new Error(`Unable to evaluate governed runtime cost: ${decisionError.message}`)
      const decision = (Array.isArray(decisionData) ? decisionData[0] : decisionData) as Record<string, unknown> | null
      if (!decision || typeof decision.allowed !== 'boolean' || typeof decision.reason !== 'string') {
        throw new Error('Governed runtime cost enforcement returned an invalid decision')
      }
      if (!decision.allowed) {
        const enforcementError = new Error(`Governed runtime cost enforcement denied result consumption: ${decision.reason}`)
        enforcementError.name = 'RuntimeCostEnforcementDeniedError'
        throw enforcementError
      }

      return record
    },
  }
}
