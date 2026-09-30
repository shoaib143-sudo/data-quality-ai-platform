import { readinessCapabilitiesForContext, type ReadinessCapability, type ReadinessContext } from './unified-readiness-framework.ts'
import type { ReadinessEvidence } from './unified-readiness-engine.ts'

export type QuestionPlanReason = 'HUMAN_CONTEXT_REQUIRED' | 'EVIDENCE_MISSING' | 'EVIDENCE_STALE' | 'CONTRADICTION_REVIEW'

export type PlannedQuestion = {
  capabilityId: string
  prompt: string
  reason: QuestionPlanReason
  priority: number
}

function activeEvidence(capabilityId: string, evidence: readonly ReadinessEvidence[]) {
  return evidence.filter(item => item.capabilityId === capabilityId && item.freshness !== 'EXPIRED' && item.reliability > 0)
}

function promptFor(capability: ReadinessCapability) {
  return capability.humanPrompt ?? `Provide evidence-backed context for: ${capability.label}.`
}

export function planMinimumQuestions(context: ReadinessContext, evidence: readonly ReadinessEvidence[]): PlannedQuestion[] {
  return readinessCapabilitiesForContext(context).flatMap(capability => {
    const current = activeEvidence(capability.id, evidence)
    const hasSystem = current.some(item => item.sourceType === 'SYSTEM')
    const hasHuman = current.some(item => item.sourceType === 'HUMAN')
    const staleOnly = evidence.some(item => item.capabilityId === capability.id && item.freshness === 'STALE') && !current.some(item => item.freshness === 'CURRENT')
    const systemMean = current.filter(x => x.sourceType === 'SYSTEM').map(x => x.maturity)
    const humanMean = current.filter(x => x.sourceType === 'HUMAN').map(x => x.maturity)
    const contradiction = systemMean.length && humanMean.length
      ? Math.abs(systemMean.reduce((a,b)=>a+b,0)/systemMean.length - humanMean.reduce((a,b)=>a+b,0)/humanMean.length) >= 1.5
      : false

    if (contradiction) return [{ capabilityId: capability.id, prompt: promptFor(capability), reason: 'CONTRADICTION_REVIEW' as const, priority: 100 }]
    if (capability.evidenceMode === 'OBSERVABLE') return hasSystem ? [] : [{ capabilityId: capability.id, prompt: promptFor(capability), reason: staleOnly ? 'EVIDENCE_STALE' as const : 'EVIDENCE_MISSING' as const, priority: 80 }]
    if (capability.evidenceMode === 'CORROBORATABLE') return hasHuman ? [] : [{ capabilityId: capability.id, prompt: promptFor(capability), reason: 'HUMAN_CONTEXT_REQUIRED' as const, priority: hasSystem ? 60 : 75 }]
    if (capability.evidenceMode === 'EVIDENCE_REQUIRED') return hasHuman && current.some(x => x.sourceType === 'DOCUMENT') ? [] : [{ capabilityId: capability.id, prompt: promptFor(capability), reason: 'EVIDENCE_MISSING' as const, priority: 70 }]
    return hasHuman ? [] : [{ capabilityId: capability.id, prompt: promptFor(capability), reason: 'HUMAN_CONTEXT_REQUIRED' as const, priority: 50 }]
  }).sort((a,b) => b.priority - a.priority || a.capabilityId.localeCompare(b.capabilityId))
}
