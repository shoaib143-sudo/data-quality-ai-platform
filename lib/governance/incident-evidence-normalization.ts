export type NormalizedRootCause = {
  explanation: string
  confidence: number | null
  evidence: Record<string, unknown>
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function confidence(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null
}

/**
 * Normalizes root-cause evidence without promoting probabilistic analysis into
 * governance truth. Structured investigation payloads currently use `cause`,
 * while some providers emit summary/description/rationale or plain strings.
 */
export function normalizeRootCauseEvidence(value: unknown): NormalizedRootCause[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (typeof item === 'string') {
      const explanation = item.trim()
      return explanation ? [{ explanation, confidence: null, evidence: {} }] : []
    }

    const source = object(item)
    const explanation = text(source.cause)
      || text(source.summary)
      || text(source.description)
      || text(source.rationale)
    if (!explanation) return []

    return [{
      explanation,
      confidence: confidence(source.confidence),
      evidence: object(source.evidence),
    }]
  })
}

export function resolveLegacyVerificationProfileRunId(
  dedicatedProfileRunId: unknown,
  outcome: unknown,
): string | null {
  const dedicated = text(dedicatedProfileRunId)
  if (dedicated) return dedicated
  return text(object(outcome).verification_profile_run_id) || null
}
