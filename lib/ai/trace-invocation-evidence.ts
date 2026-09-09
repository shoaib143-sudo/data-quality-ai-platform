export type TraceInvocationEvidence = {
  routeSource: string | null
  routeReason: string | null
  routingPolicyId: string | null
  routingPolicyReason: string | null
  providerRequestId: string | null
  requestedMaxOutputTokens: number | null
  providerHttpStatus: number | null
  totalTokens: number | null
}

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
    providerHttpStatus: httpStatus(source.provider_http_status),
    totalTokens: nonNegativeInteger(source.total_tokens),
  }
}

export function hasTraceInvocationEvidence(evidence: TraceInvocationEvidence) {
  return Object.values(evidence).some((value) => value != null)
}
