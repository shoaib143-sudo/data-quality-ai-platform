import type { ReadinessEvidence } from './unified-readiness-engine.ts'

export type ReadinessObservationInput = {
  capabilityId: string
  source: string
  maturity: 0|1|2|3|4|5
  reliability?: number
  observedAt?: string
  maxAgeDays?: number
  metadata?: Record<string, unknown>
}

export function normalizeSystemObservation(input: ReadinessObservationInput, now = new Date()): ReadinessEvidence {
  const observedAt = new Date(input.observedAt ?? now.toISOString())
  const ageMs = Math.max(0, now.getTime() - observedAt.getTime())
  const maxAgeMs = (input.maxAgeDays ?? 30) * 86_400_000
  const freshness = ageMs > maxAgeMs * 2 ? 'EXPIRED' : ageMs > maxAgeMs ? 'STALE' : 'CURRENT'
  return {
    capabilityId: input.capabilityId,
    sourceType: 'SYSTEM',
    source: input.source,
    maturity: input.maturity,
    observedAt: observedAt.toISOString(),
    freshness,
    reliability: input.reliability ?? 0.85,
  }
}

export const DATANEXUS_OBSERVATION_ADAPTERS = [
  { capabilityId:'URA-DISC-CATALOG-001', sources:['catalog','metadata','ownership','classification'] },
  { capabilityId:'URA-QUAL-DQ-001', sources:['profiling','data-quality','freshness'] },
  { capabilityId:'URA-SEM-GROUNDING-001', sources:['glossary','semantic-governance'] },
  { capabilityId:'URA-ACCESS-SLA-001', sources:['telemetry','freshness','availability'] },
  { capabilityId:'URA-GOV-POLICY-001', sources:['policy','resource-access','approvals'] },
  { capabilityId:'URA-TRUST-LINEAGE-001', sources:['dataset-lineage','field-lineage','agent-trace'] },
  { capabilityId:'URA-AIGOV-RISK-001', sources:['ai-capabilities','evaluation','agent-policy'] },
  { capabilityId:'URA-OBS-DRIFT-001', sources:['telemetry','drift','recovery'] },
] as const
