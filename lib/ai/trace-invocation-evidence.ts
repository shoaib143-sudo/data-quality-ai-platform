export type TraceBudgetAdmissionReason = 'ADMITTED' | 'ALREADY_ADMITTED' | 'POLICY_NOT_CURRENT' | 'POLICY_DISABLED' | 'RATE_LIMIT' | 'CONCURRENCY_LIMIT'

export type TraceInvocationEvidence = {
  routeSource: string | null
  routeReason: string | null
  routingPolicyId: string | null
  routingPolicyReason: string | null
  providerRequestId: string | null
  requestedMaxOutputTokens: number | null
  governanceMaxOutputTokens: number | null
  effectiveMaxOutputTokens: number | null
  resourceBudgetPolicyId: string | null
  resourceBudgetAdmissionReason: TraceBudgetAdmissionReason | null
  resourceBudgetAdmissionId: string | null
  resourceBudgetLeaseId: string | null
  resourceBudgetRequestCountLastMinute: number | null
  resourceBudgetActiveConcurrency: number | null
  providerHttpStatus: number | null
  totalTokens: number | null
}

const BUDGET_ADMISSION_REASONS = new Set<TraceBudgetAdmissionReason>([
  'ADMITTED',
  'ALREADY_ADMITTED',
  'POLICY_NOT_CURRENT',
  'POLICY_DISABLED',
  'RATE_LIMIT',
  'CONCURRENCY_LIMIT',
])

function boundedText(value: unknown, maxLength = 256) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function httpStatus(value: unknown) {
  const normalized = nonNegativeInteger(value)
  return normalized != null && normalized >= 100 && normalized <= 599 ? normalized : null
}

function admissionReason(value: unknown): TraceBudgetAdmissionReason | null {
  return typeof value === 'string' && BUDGET_ADMISSION_REASONS.has(value as TraceBudgetAdmissionReason)
    ? value as TraceBudgetAdmissionReason
    : null
}

export function projectTraceInvocationEvidence(attributes: unknown): TraceInvocationEvidence {
  const source = attributes && typeof attributes === 'object' && !Array.isArray(attributes)
    ? attributes as Record<string, unknown>
    : {}

  return {
    routeSource: boundedText(source.route_source),
    routeReason: boundedText(source.route_reason),
    routingPolicyId: boundedText(source.routing_policy_id),
    routingPolicyReason: boundedText(source.routing_policy_reason),
    providerRequestId: boundedText(source.provider_request_id),
    requestedMaxOutputTokens: nonNegativeInteger(source.requested_max_output_tokens),
    governanceMaxOutputTokens: nonNegativeInteger(source.governance_max_output_tokens),
    effectiveMaxOutputTokens: nonNegativeInteger(source.effective_max_output_tokens),
    resourceBudgetPolicyId: boundedText(source.resource_budget_policy_id),
    resourceBudgetAdmissionReason: admissionReason(source.resource_budget_admission_reason),
    resourceBudgetAdmissionId: boundedText(source.resource_budget_admission_id),
    resourceBudgetLeaseId: boundedText(source.resource_budget_lease_id),
    resourceBudgetRequestCountLastMinute: nonNegativeInteger(source.resource_budget_request_count_last_minute),
    resourceBudgetActiveConcurrency: nonNegativeInteger(source.resource_budget_active_concurrency),
    providerHttpStatus: httpStatus(source.provider_http_status),
    totalTokens: nonNegativeInteger(source.total_tokens),
  }
}

export function hasTraceInvocationEvidence(evidence: TraceInvocationEvidence) {
  return Object.values(evidence).some((value) => value != null)
}
