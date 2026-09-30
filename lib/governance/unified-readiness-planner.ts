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

function meanMaturity(items: readonly ReadinessEvidence[]) {
  if (items.length === 0) return null
  return items.reduce((total, item) => total + Number(item.maturity), 0) / items.length
}

export function planMinimumQuestions(context: ReadinessContext, evidence: readonly ReadinessEvidence[]): PlannedQuestion[] {
  const questions: PlannedQuestion[] = []

  for (const capability of readinessCapabilitiesForContext(context)) {
    const current = activeEvidence(capability.id, evidence)
    const systemEvidence = current.filter(item => item.sourceType === 'SYSTEM')
    const humanEvidence = current.filter(item => item.sourceType === 'HUMAN')
    const hasSystem = systemEvidence.length > 0
    const hasHuman = humanEvidence.length > 0
    const staleOnly =
      evidence.some(item => item.capabilityId === capability.id && item.freshness === 'STALE')
      && !current.some(item => item.freshness === 'CURRENT')

    const systemMean = meanMaturity(systemEvidence)
    const humanMean = meanMaturity(humanEvidence)
    const contradiction = systemMean !== null && humanMean !== null && Math.abs(systemMean - humanMean) >= 1.5

    if (contradiction) {
      questions.push({
        capabilityId: capability.id,
        prompt: promptFor(capability),
        reason: 'CONTRADICTION_REVIEW',
        priority: 100,
      })
      continue
    }

    if (capability.evidenceMode === 'OBSERVABLE') {
      if (!hasSystem) {
        questions.push({
          capabilityId: capability.id,
          prompt: promptFor(capability),
          reason: staleOnly ? 'EVIDENCE_STALE' : 'EVIDENCE_MISSING',
          priority: 80,
        })
      }
      continue
    }

    if (capability.evidenceMode === 'CORROBORATABLE') {
      if (!hasHuman) {
        questions.push({
          capabilityId: capability.id,
          prompt: promptFor(capability),
          reason: 'HUMAN_CONTEXT_REQUIRED',
          priority: hasSystem ? 60 : 75,
        })
      }
      continue
    }

    if (capability.evidenceMode === 'EVIDENCE_REQUIRED') {
      if (!hasHuman || !current.some(item => item.sourceType === 'DOCUMENT')) {
        questions.push({
          capabilityId: capability.id,
          prompt: promptFor(capability),
          reason: 'EVIDENCE_MISSING',
          priority: 70,
        })
      }
      continue
    }

    if (!hasHuman) {
      questions.push({
        capabilityId: capability.id,
        prompt: promptFor(capability),
        reason: 'HUMAN_CONTEXT_REQUIRED',
        priority: 50,
      })
    }
  }

  return questions.sort((a, b) => b.priority - a.priority || a.capabilityId.localeCompare(b.capabilityId))
}
