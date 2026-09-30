import type { ReadinessCapability, ReadinessCriticality } from './unified-readiness-framework.ts'

export type EvidenceFreshness = 'CURRENT' | 'STALE' | 'EXPIRED'
export type EvidenceSourceType = 'SYSTEM' | 'HUMAN' | 'DOCUMENT'

export type ReadinessEvidence = {
  capabilityId: string
  sourceType: EvidenceSourceType
  source: string
  maturity: 0 | 1 | 2 | 3 | 4 | 5
  observedAt: string
  freshness: EvidenceFreshness
  reliability: number
}

export type CapabilityReadiness = {
  capabilityId: string
  score: number | null
  confidence: number
  contradiction: boolean
  gate: 'CLEARED' | 'CONDITIONAL' | 'NOT_CLEARED' | 'UNKNOWN'
  evidenceCount: number
}

const freshnessFactor: Record<EvidenceFreshness, number> = { CURRENT: 1, STALE: 0.6, EXPIRED: 0 }

function clamp01(value: number) { return Math.max(0, Math.min(1, value)) }

function gateFor(score: number | null, confidence: number, criticality: ReadinessCriticality) {
  if (score === null || confidence < 0.25) return 'UNKNOWN' as const
  const criticalFloor = criticality === 'CRITICAL' ? 3 : criticality === 'HIGH' ? 2.5 : 2
  if (score < criticalFloor) return 'NOT_CLEARED' as const
  if (confidence < 0.6) return 'CONDITIONAL' as const
  return 'CLEARED' as const
}

export function evaluateCapability(capability: ReadinessCapability, evidence: readonly ReadinessEvidence[]): CapabilityReadiness {
  const relevant = evidence.filter(item => item.capabilityId === capability.id)
  const weighted = relevant.map(item => ({
    ...item,
    weight: clamp01(item.reliability) * freshnessFactor[item.freshness],
  })).filter(item => item.weight > 0)

  if (!weighted.length) {
    return { capabilityId: capability.id, score: null, confidence: 0, contradiction: false, gate: 'UNKNOWN', evidenceCount: relevant.length }
  }

  const weight = weighted.reduce((sum, item) => sum + item.weight, 0)
  const score = weighted.reduce((sum, item) => sum + item.maturity * item.weight, 0) / weight
  const system = weighted.filter(item => item.sourceType === 'SYSTEM')
  const human = weighted.filter(item => item.sourceType === 'HUMAN')
  const systemMean = system.length ? system.reduce((s, x) => s + x.maturity, 0) / system.length : null
  const humanMean = human.length ? human.reduce((s, x) => s + x.maturity, 0) / human.length : null
  const contradiction = systemMean !== null && humanMean !== null && Math.abs(systemMean - humanMean) >= 1.5
  const sourceDiversity = new Set(weighted.map(item => item.sourceType)).size / 3
  const confidence = clamp01((weight / Math.max(1, relevant.length)) * 0.7 + sourceDiversity * 0.3)

  return {
    capabilityId: capability.id,
    score: Math.round(score * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    contradiction,
    gate: gateFor(score, confidence, capability.criticality),
    evidenceCount: relevant.length,
  }
}

export function evaluateReadiness(capabilities: readonly ReadinessCapability[], evidence: readonly ReadinessEvidence[]) {
  const capabilitiesResult = capabilities.map(capability => evaluateCapability(capability, evidence))
  const known = capabilitiesResult.filter(result => result.score !== null)
  const aggregateScore = known.length
    ? Math.round((known.reduce((sum, result) => sum + (result.score ?? 0), 0) / known.length) * 20 * 10) / 10
    : null
  const criticalFailures = capabilitiesResult.filter(result => result.gate === 'NOT_CLEARED')
  const overallGate = criticalFailures.length
    ? 'NOT_CLEARED'
    : capabilitiesResult.some(result => result.gate === 'UNKNOWN' || result.gate === 'CONDITIONAL')
      ? 'CONDITIONAL'
      : 'CLEARED'

  return { aggregateScore, overallGate, criticalFailures, capabilities: capabilitiesResult }
}
