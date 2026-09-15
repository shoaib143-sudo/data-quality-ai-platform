export const CONTINUOUS_LEARNING_GOVERNANCE_VERSION = 'continuous-learning-governance-v1' as const

export type LearningEvidence = {
  evidenceRef: string
  projectId: string
  verifiedAt: string
  effective: boolean
  verified: true
  synthetic: false
}

export type DriftObservation = {
  metricKey: string
  observedAt: string
  referenceValue: number
  currentValue: number
}

export type ModelChangePolicy = {
  policyId: string
  policyVersion: string
  minimumVerifiedLearningCases: number
  minimumEffectiveCases: number
  minimumIneffectiveCases: number
}

export type HumanOverride = {
  reviewerId: string
  reason: string
  recordedAt: string
}

export type ContinuousLearningGovernanceResult = {
  version: typeof CONTINUOUS_LEARNING_GOVERNANCE_VERSION
  projectId: string
  currentModelVersionId: string
  candidateModelVersionId: string
  status: 'ELIGIBLE_FOR_REVIEW' | 'NOT_READY'
  reasons: string[]
  policy: ModelChangePolicy
  verifiedLearningCaseCount: number
  effectiveCaseCount: number
  ineffectiveCaseCount: number
  evidenceRefs: string[]
  driftObservations: Array<DriftObservation & { absoluteDelta: number }>
  trainingDataHash: string
  reproducibilityRef: string
  evidenceCutoffAt: string
  automaticRetrainingAllowed: false
  automaticPromotionAllowed: false
  productionMutationAllowed: false
  memoryCanAuthorizeChange: false
  currentAuthorizationRequiredAtPromotion: true
  humanReviewRequired: true
  overrideCanBypassReadiness: false
  humanOverride: HumanOverride | null
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function timestamp(value: string, label: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`)
  return parsed
}

function positiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

export function assessContinuousLearningGovernance(input: {
  projectId: string
  currentModelVersionId: string
  candidateModelVersionId: string
  policy: ModelChangePolicy
  learningEvidence: LearningEvidence[]
  driftObservations?: DriftObservation[]
  trainingDataHash: string
  reproducibilityRef: string
  evidenceCutoffAt: string
  humanOverride?: HumanOverride | null
}): ContinuousLearningGovernanceResult {
  const projectId = requiredText(input.projectId, 'projectId')
  const currentModelVersionId = requiredText(input.currentModelVersionId, 'currentModelVersionId')
  const candidateModelVersionId = requiredText(input.candidateModelVersionId, 'candidateModelVersionId')
  if (currentModelVersionId === candidateModelVersionId) throw new Error('candidateModelVersionId must differ from currentModelVersionId')

  const policy: ModelChangePolicy = {
    policyId: requiredText(input.policy.policyId, 'policyId'),
    policyVersion: requiredText(input.policy.policyVersion, 'policyVersion'),
    minimumVerifiedLearningCases: positiveInteger(input.policy.minimumVerifiedLearningCases, 'minimumVerifiedLearningCases'),
    minimumEffectiveCases: positiveInteger(input.policy.minimumEffectiveCases, 'minimumEffectiveCases'),
    minimumIneffectiveCases: positiveInteger(input.policy.minimumIneffectiveCases, 'minimumIneffectiveCases'),
  }

  const trainingDataHash = requiredText(input.trainingDataHash, 'trainingDataHash')
  const reproducibilityRef = requiredText(input.reproducibilityRef, 'reproducibilityRef')
  const cutoff = timestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')

  const evidenceRefs = new Set<string>()
  let effectiveCaseCount = 0
  let ineffectiveCaseCount = 0
  for (const evidence of input.learningEvidence) {
    if (evidence.projectId !== projectId) throw new Error('learning evidence projectId must match projectId')
    if (evidence.verified !== true) throw new Error('continuous learning requires verified evidence')
    if (evidence.synthetic !== false) throw new Error('synthetic evidence is not eligible for continuous learning')
    if (timestamp(evidence.verifiedAt, 'learningEvidence.verifiedAt') > cutoff) {
      throw new Error('learning evidence must not be available after evidenceCutoffAt')
    }
    const ref = requiredText(evidence.evidenceRef, 'learningEvidence.evidenceRef')
    if (evidenceRefs.has(ref)) throw new Error(`duplicate learning evidence reference: ${ref}`)
    evidenceRefs.add(ref)
    if (evidence.effective) effectiveCaseCount += 1
    else ineffectiveCaseCount += 1
  }

  const driftObservations = (input.driftObservations ?? []).map((observation) => {
    requiredText(observation.metricKey, 'driftObservation.metricKey')
    if (timestamp(observation.observedAt, 'driftObservation.observedAt') > cutoff) {
      throw new Error('drift observation must not be available after evidenceCutoffAt')
    }
    if (!Number.isFinite(observation.referenceValue) || !Number.isFinite(observation.currentValue)) {
      throw new Error('drift observation values must be finite numbers')
    }
    return {
      ...observation,
      absoluteDelta: Number(Math.abs(observation.currentValue - observation.referenceValue).toFixed(12)),
    }
  }).sort((a, b) => a.metricKey.localeCompare(b.metricKey))

  let humanOverride: HumanOverride | null = null
  if (input.humanOverride) {
    humanOverride = {
      reviewerId: requiredText(input.humanOverride.reviewerId, 'humanOverride.reviewerId'),
      reason: requiredText(input.humanOverride.reason, 'humanOverride.reason'),
      recordedAt: input.humanOverride.recordedAt,
    }
    if (timestamp(humanOverride.recordedAt, 'humanOverride.recordedAt') > cutoff) {
      throw new Error('human override must not be recorded after evidenceCutoffAt')
    }
  }

  const verifiedLearningCaseCount = evidenceRefs.size
  const reasons: string[] = []
  if (verifiedLearningCaseCount < policy.minimumVerifiedLearningCases) reasons.push('INSUFFICIENT_VERIFIED_LEARNING_CASES')
  if (effectiveCaseCount < policy.minimumEffectiveCases || ineffectiveCaseCount < policy.minimumIneffectiveCases) {
    reasons.push('INSUFFICIENT_OUTCOME_CLASS_COVERAGE')
  }

  const status = reasons.length === 0 ? 'ELIGIBLE_FOR_REVIEW' : 'NOT_READY'

  return {
    version: CONTINUOUS_LEARNING_GOVERNANCE_VERSION,
    projectId,
    currentModelVersionId,
    candidateModelVersionId,
    status,
    reasons: status === 'ELIGIBLE_FOR_REVIEW' ? ['READY_FOR_HUMAN_MODEL_REVIEW'] : reasons,
    policy,
    verifiedLearningCaseCount,
    effectiveCaseCount,
    ineffectiveCaseCount,
    evidenceRefs: [...evidenceRefs].sort(),
    driftObservations,
    trainingDataHash,
    reproducibilityRef,
    evidenceCutoffAt: input.evidenceCutoffAt,
    automaticRetrainingAllowed: false,
    automaticPromotionAllowed: false,
    productionMutationAllowed: false,
    memoryCanAuthorizeChange: false,
    currentAuthorizationRequiredAtPromotion: true,
    humanReviewRequired: true,
    overrideCanBypassReadiness: false,
    humanOverride,
  }
}
