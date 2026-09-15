import type { GovernedShadowEvaluationResult } from './governed-shadow-evaluation'

export const PREDICTIVE_CERTIFICATION_VERSION = 'predictive-certification-v1' as const

export type PredictiveCertificationReason =
  | 'ELIGIBLE_FOR_REVIEW'
  | 'INSUFFICIENT_SHADOW_SAMPLE'
  | 'INSUFFICIENT_CLASS_COVERAGE'
  | 'BRIER_SCORE_TOO_HIGH'
  | 'ACCURACY_TOO_LOW'

export type PredictiveCertificationPolicy = {
  policyId: string
  policyVersion: string
  minimumShadowCases: number
  minimumEffectiveCases: number
  minimumIneffectiveCases: number
  maximumBrierScore: number
  minimumAccuracy: number
}

export type PredictiveCertificationResult = {
  version: typeof PREDICTIVE_CERTIFICATION_VERSION
  projectId: string
  candidateModelVersionId: string
  status: 'ELIGIBLE_FOR_REVIEW' | 'NOT_READY'
  reasons: PredictiveCertificationReason[]
  observed: {
    sampleSize: number
    effectiveCount: number
    ineffectiveCount: number
    brierScore: number
    accuracy: number
  }
  policy: PredictiveCertificationPolicy
  evidenceRefs: string[]
  predictiveProbabilityExposed: false
  rowLevelPredictionsExposed: false
  decisionAuthority: false
  executionAuthority: false
  promotionAuthority: false
  automaticPromotionAllowed: false
  humanReviewRequired: true
  productionPredictionEnabled: false
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

function unitInterval(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`)
  return value
}

function assertNonAuthoritativeShadow(result: GovernedShadowEvaluationResult) {
  if (result.status !== 'EVALUATED') throw new Error('Shadow evaluation must be EVALUATED')
  if (
    result.predictiveProbabilityExposed !== false ||
    result.rowLevelPredictionsExposed !== false ||
    result.shadowDecisionAuthority !== false ||
    result.executionAuthority !== false ||
    result.promotionAuthority !== false ||
    result.historicalOutcomeOnly !== true
  ) {
    throw new Error('Predictive certification requires non-authoritative historical shadow evidence')
  }
}

export function certifyPredictiveReadiness(input: {
  projectId: string
  shadow: GovernedShadowEvaluationResult
  policy: PredictiveCertificationPolicy
}): PredictiveCertificationResult {
  const projectId = requiredText(input.projectId, 'projectId')
  if (input.shadow.projectId !== projectId) throw new Error('shadow projectId must match projectId')
  if (!input.shadow.candidateModelVersionId.trim()) throw new Error('candidateModelVersionId is required')

  assertNonAuthoritativeShadow(input.shadow)

  const policy: PredictiveCertificationPolicy = {
    policyId: requiredText(input.policy.policyId, 'policyId'),
    policyVersion: requiredText(input.policy.policyVersion, 'policyVersion'),
    minimumShadowCases: positiveInteger(input.policy.minimumShadowCases, 'minimumShadowCases'),
    minimumEffectiveCases: positiveInteger(input.policy.minimumEffectiveCases, 'minimumEffectiveCases'),
    minimumIneffectiveCases: positiveInteger(input.policy.minimumIneffectiveCases, 'minimumIneffectiveCases'),
    maximumBrierScore: unitInterval(input.policy.maximumBrierScore, 'maximumBrierScore'),
    minimumAccuracy: unitInterval(input.policy.minimumAccuracy, 'minimumAccuracy'),
  }

  const reasons: PredictiveCertificationReason[] = []
  if (input.shadow.sampleSize < policy.minimumShadowCases) reasons.push('INSUFFICIENT_SHADOW_SAMPLE')
  if (
    input.shadow.effectiveCount < policy.minimumEffectiveCases ||
    input.shadow.ineffectiveCount < policy.minimumIneffectiveCases
  ) reasons.push('INSUFFICIENT_CLASS_COVERAGE')
  if (input.shadow.brierScore > policy.maximumBrierScore) reasons.push('BRIER_SCORE_TOO_HIGH')
  if (input.shadow.accuracy < policy.minimumAccuracy) reasons.push('ACCURACY_TOO_LOW')

  const status = reasons.length === 0 ? 'ELIGIBLE_FOR_REVIEW' : 'NOT_READY'

  return {
    version: PREDICTIVE_CERTIFICATION_VERSION,
    projectId,
    candidateModelVersionId: input.shadow.candidateModelVersionId,
    status,
    reasons: status === 'ELIGIBLE_FOR_REVIEW' ? ['ELIGIBLE_FOR_REVIEW'] : reasons,
    observed: {
      sampleSize: input.shadow.sampleSize,
      effectiveCount: input.shadow.effectiveCount,
      ineffectiveCount: input.shadow.ineffectiveCount,
      brierScore: input.shadow.brierScore,
      accuracy: input.shadow.accuracy,
    },
    policy,
    evidenceRefs: [...new Set(input.shadow.evidenceRefs)].sort(),
    predictiveProbabilityExposed: false,
    rowLevelPredictionsExposed: false,
    decisionAuthority: false,
    executionAuthority: false,
    promotionAuthority: false,
    automaticPromotionAllowed: false,
    humanReviewRequired: true,
    productionPredictionEnabled: false,
  }
}
