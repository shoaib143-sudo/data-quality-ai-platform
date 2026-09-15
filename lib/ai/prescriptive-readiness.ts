import type { PredictiveCertificationResult } from './predictive-certification'

export const PRESCRIPTIVE_READINESS_VERSION = 'prescriptive-readiness-v1' as const

export type ObservedInterventionOutcome = {
  id: string
  projectId: string
  interventionKey: string
  persisted: boolean
  syntheticOrTest: boolean
  adjudicated: boolean
  observedOutcome: 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIAL' | 'ROLLED_BACK' | 'FAILED'
  observedAt: string
  evidenceAvailableAt: string
  evidenceRefs: string[]
}

export type PrescriptiveReadinessPolicy = {
  policyId: string
  policyVersion: string
  minimumObservedInterventionCases: number
  minimumDistinctInterventions: number
  minimumPositiveOutcomes: number
  minimumNegativeOutcomes: number
}

export type PrescriptiveReadinessReason =
  | 'ELIGIBLE_FOR_HUMAN_REVIEW'
  | 'PREDICTIVE_CERTIFICATION_NOT_ELIGIBLE'
  | 'INSUFFICIENT_INTERVENTION_SAMPLE'
  | 'INSUFFICIENT_INTERVENTION_DIVERSITY'
  | 'INSUFFICIENT_OUTCOME_CLASS_COVERAGE'

export type PrescriptiveReadinessResult = {
  version: typeof PRESCRIPTIVE_READINESS_VERSION
  projectId: string
  candidateModelVersionId: string
  status: 'ELIGIBLE_FOR_HUMAN_REVIEW' | 'NOT_READY'
  reasons: PrescriptiveReadinessReason[]
  evidenceCutoffAt: string
  observed: {
    eligibleInterventionCases: number
    distinctInterventions: number
    positiveOutcomes: number
    negativeOutcomes: number
  }
  policy: PrescriptiveReadinessPolicy
  evidenceRefs: string[]
  recommendationRankingEnabled: false
  recommendationGenerationEnabled: false
  causalEffectClaimed: false
  predictiveProbabilityExposed: false
  decisionAuthority: false
  executionAuthority: false
  autonomousActionAllowed: false
  humanReviewRequired: true
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function positiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

function timestamp(value: string, label: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`)
  return parsed
}

function assertNonAuthoritativePredictiveCertification(result: PredictiveCertificationResult) {
  if (
    result.predictiveProbabilityExposed !== false ||
    result.rowLevelPredictionsExposed !== false ||
    result.decisionAuthority !== false ||
    result.executionAuthority !== false ||
    result.promotionAuthority !== false ||
    result.automaticPromotionAllowed !== false ||
    result.humanReviewRequired !== true ||
    result.productionPredictionEnabled !== false
  ) {
    throw new Error('Prescriptive readiness requires non-authoritative predictive certification evidence')
  }
}

function isEligibleObservedIntervention(
  item: ObservedInterventionOutcome,
  projectId: string,
  cutoff: number,
) {
  if (item.projectId !== projectId) return false
  if (!item.persisted || item.syntheticOrTest || !item.adjudicated) return false
  if (!requiredText(item.id, 'intervention.id')) return false
  if (!requiredText(item.interventionKey, 'intervention.interventionKey')) return false
  const observedAt = timestamp(item.observedAt, 'intervention.observedAt')
  const evidenceAvailableAt = timestamp(item.evidenceAvailableAt, 'intervention.evidenceAvailableAt')
  if (observedAt > cutoff || evidenceAvailableAt > cutoff) return false
  return true
}

function outcomePolarity(outcome: ObservedInterventionOutcome['observedOutcome']) {
  if (outcome === 'EFFECTIVE') return 'POSITIVE' as const
  if (outcome === 'INEFFECTIVE' || outcome === 'FAILED' || outcome === 'ROLLED_BACK') return 'NEGATIVE' as const
  return 'NEUTRAL' as const
}

export function assessPrescriptiveReadiness(input: {
  projectId: string
  predictiveCertification: PredictiveCertificationResult
  interventionOutcomes: ObservedInterventionOutcome[]
  evidenceCutoffAt: string
  policy: PrescriptiveReadinessPolicy
}): PrescriptiveReadinessResult {
  const projectId = requiredText(input.projectId, 'projectId')
  if (input.predictiveCertification.projectId !== projectId) {
    throw new Error('predictiveCertification projectId must match projectId')
  }
  assertNonAuthoritativePredictiveCertification(input.predictiveCertification)

  const cutoff = timestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')
  const policy: PrescriptiveReadinessPolicy = {
    policyId: requiredText(input.policy.policyId, 'policyId'),
    policyVersion: requiredText(input.policy.policyVersion, 'policyVersion'),
    minimumObservedInterventionCases: positiveInteger(
      input.policy.minimumObservedInterventionCases,
      'minimumObservedInterventionCases',
    ),
    minimumDistinctInterventions: positiveInteger(input.policy.minimumDistinctInterventions, 'minimumDistinctInterventions'),
    minimumPositiveOutcomes: positiveInteger(input.policy.minimumPositiveOutcomes, 'minimumPositiveOutcomes'),
    minimumNegativeOutcomes: positiveInteger(input.policy.minimumNegativeOutcomes, 'minimumNegativeOutcomes'),
  }

  const eligible = input.interventionOutcomes.filter((item) => isEligibleObservedIntervention(item, projectId, cutoff))
  const uniqueById = new Map<string, ObservedInterventionOutcome>()
  for (const item of eligible) {
    if (uniqueById.has(item.id)) throw new Error(`duplicate intervention outcome id: ${item.id}`)
    uniqueById.set(item.id, item)
  }
  const cases = [...uniqueById.values()]
  const distinctInterventions = new Set(cases.map((item) => item.interventionKey)).size
  const positiveOutcomes = cases.filter((item) => outcomePolarity(item.observedOutcome) === 'POSITIVE').length
  const negativeOutcomes = cases.filter((item) => outcomePolarity(item.observedOutcome) === 'NEGATIVE').length

  const reasons: PrescriptiveReadinessReason[] = []
  if (input.predictiveCertification.status !== 'ELIGIBLE_FOR_REVIEW') {
    reasons.push('PREDICTIVE_CERTIFICATION_NOT_ELIGIBLE')
  }
  if (cases.length < policy.minimumObservedInterventionCases) reasons.push('INSUFFICIENT_INTERVENTION_SAMPLE')
  if (distinctInterventions < policy.minimumDistinctInterventions) reasons.push('INSUFFICIENT_INTERVENTION_DIVERSITY')
  if (positiveOutcomes < policy.minimumPositiveOutcomes || negativeOutcomes < policy.minimumNegativeOutcomes) {
    reasons.push('INSUFFICIENT_OUTCOME_CLASS_COVERAGE')
  }

  const status = reasons.length === 0 ? 'ELIGIBLE_FOR_HUMAN_REVIEW' : 'NOT_READY'
  const evidenceRefs = [
    ...input.predictiveCertification.evidenceRefs,
    ...cases.flatMap((item) => item.evidenceRefs),
  ]

  return {
    version: PRESCRIPTIVE_READINESS_VERSION,
    projectId,
    candidateModelVersionId: input.predictiveCertification.candidateModelVersionId,
    status,
    reasons: status === 'ELIGIBLE_FOR_HUMAN_REVIEW' ? ['ELIGIBLE_FOR_HUMAN_REVIEW'] : reasons,
    evidenceCutoffAt: input.evidenceCutoffAt,
    observed: {
      eligibleInterventionCases: cases.length,
      distinctInterventions,
      positiveOutcomes,
      negativeOutcomes,
    },
    policy,
    evidenceRefs: [...new Set(evidenceRefs)].sort(),
    recommendationRankingEnabled: false,
    recommendationGenerationEnabled: false,
    causalEffectClaimed: false,
    predictiveProbabilityExposed: false,
    decisionAuthority: false,
    executionAuthority: false,
    autonomousActionAllowed: false,
    humanReviewRequired: true,
  }
}
