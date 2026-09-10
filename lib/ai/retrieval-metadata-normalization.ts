export type RetrievalAuthorityClass =
  | 'GOVERNED_DECISION'
  | 'AUTHORITATIVE_FACT'
  | 'OBSERVED_EVIDENCE'
  | 'DERIVED_INTELLIGENCE'
  | 'UNTRUSTED_INFERENCE'
  | 'UNKNOWN'

export type RetrievalTemporalStatus = 'VALID' | 'MISSING' | 'INVALID' | 'FUTURE'

export type RetrievalMetadataNormalization = {
  version: '1'
  authorityClass: RetrievalAuthorityClass
  authoritySource: string | null
  temporalStatus: RetrievalTemporalStatus
  temporalValue: string | null
  temporalSource: string | null
}

const AUTHORITY_KEYS = ['authority_class', 'authority_status', 'authority', 'evidence_authority'] as const
const TEMPORAL_KEYS = ['effective_at', 'observed_at', 'source_updated_at', 'updated_at', 'created_at'] as const

const AUTHORITY_ALIASES: Record<string, RetrievalAuthorityClass> = {
  GOVERNED_DECISION: 'GOVERNED_DECISION',
  APPROVED: 'GOVERNED_DECISION',
  GOVERNED: 'GOVERNED_DECISION',
  HUMAN_REVIEWED: 'GOVERNED_DECISION',
  AUTHORITATIVE_FACT: 'AUTHORITATIVE_FACT',
  AUTHORITATIVE: 'AUTHORITATIVE_FACT',
  CANONICAL: 'AUTHORITATIVE_FACT',
  OBSERVED_EVIDENCE: 'OBSERVED_EVIDENCE',
  SOURCE_OBSERVED: 'OBSERVED_EVIDENCE',
  OBSERVED: 'OBSERVED_EVIDENCE',
  VERIFIED: 'OBSERVED_EVIDENCE',
  DERIVED_INTELLIGENCE: 'DERIVED_INTELLIGENCE',
  DERIVED: 'DERIVED_INTELLIGENCE',
  AI_GENERATED: 'UNTRUSTED_INFERENCE',
  INFERRED: 'UNTRUSTED_INFERENCE',
  UNVERIFIED: 'UNTRUSTED_INFERENCE',
}

function normalizedToken(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return normalized || null
}

function normalizeAuthority(metadata: Record<string, unknown>) {
  for (const key of AUTHORITY_KEYS) {
    const token = normalizedToken(metadata[key])
    if (!token) continue
    return {
      authorityClass: AUTHORITY_ALIASES[token] ?? 'UNKNOWN' as RetrievalAuthorityClass,
      authoritySource: key,
    }
  }
  return { authorityClass: 'UNKNOWN' as const, authoritySource: null }
}

function normalizeTemporal(metadata: Record<string, unknown>, now: Date) {
  for (const key of TEMPORAL_KEYS) {
    const raw = metadata[key]
    if (raw == null || raw === '') continue
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      return { temporalStatus: 'INVALID' as const, temporalValue: null, temporalSource: key }
    }
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) {
      return { temporalStatus: 'INVALID' as const, temporalValue: null, temporalSource: key }
    }
    if (parsed.getTime() > now.getTime() + 5 * 60_000) {
      return { temporalStatus: 'FUTURE' as const, temporalValue: parsed.toISOString(), temporalSource: key }
    }
    return { temporalStatus: 'VALID' as const, temporalValue: parsed.toISOString(), temporalSource: key }
  }
  return { temporalStatus: 'MISSING' as const, temporalValue: null, temporalSource: null }
}

/**
 * Stable, non-authoritative projection over heterogeneous embedding metadata.
 * It never changes source metadata or ranking scores. Unknown/invalid values remain explicit
 * so downstream ranking cannot silently treat missing evidence as trusted or fresh.
 */
export function normalizeRetrievalMetadata(
  metadata: Record<string, unknown> | null | undefined,
  now = new Date(),
): RetrievalMetadataNormalization {
  const source = metadata ?? {}
  return {
    version: '1',
    ...normalizeAuthority(source),
    ...normalizeTemporal(source, now),
  }
}

export function withNormalizedRetrievalMetadata(
  metadata: Record<string, unknown> | null | undefined,
  now = new Date(),
): Record<string, unknown> {
  const source = metadata ?? {}
  return {
    ...source,
    retrieval_normalization: normalizeRetrievalMetadata(source, now),
  }
}
