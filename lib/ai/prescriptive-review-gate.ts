import type { PredictiveCertificationResult } from './predictive-certification'
import type { PrescriptiveReadinessResult } from './prescriptive-readiness'

export const PRESCRIPTIVE_REVIEW_GATE_VERSION = 'prescriptive-review-gate-v2' as const

export type PrescriptiveCandidate = {
  candidateId: string
  actionKey: string
  actionPolicyId: string
  actionPolicyVersion: string
  evidenceRefs: string[]
  rationale: string
  requiresApproval: true
}

export type PrescriptiveReviewReason =
  | 'PREDICTIVE_NOT_ELIGIBLE'
  | 'PRESCRIPTIVE_READINESS_NOT_ELIGIBLE'
  | 'NO_CANDIDATES'
  | 'READY_FOR_HUMAN_REVIEW'

export type PrescriptiveReviewGateResult = {
  version: typeof PRESCRIPTIVE_REVIEW_GATE_VERSION
  projectId: string
  candidateModelVersionId: string
  predictivePolicyId: string
  predictivePolicyVersion: string
  prescriptivePolicyId: string
  prescriptivePolicyVersion: string
  status: 'REVIEW_REQUIRED' | 'NOT_READY'
  reasons: PrescriptiveReviewReason[]
  candidates: PrescriptiveCandidate[]
  candidateRankingApplied: false
  expectedImpactClaimed: false
  causalEffectClaimed: false
  recommendationAuthority: false
  decisionAuthority: false
  executionAuthority: false
  promotionAuthority: false
  automaticActionAllowed: false
  currentAuthorizationRequiredAtExecution: true
  humanDecisionRequired: true
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function assertPredictiveBoundary(result: PredictiveCertificationResult) {
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
    throw new Error('Prescriptive review requires non-authoritative predictive certification evidence')
  }
  if (result.evidenceRefs.length === 0 || result.evidenceRefs.some((ref) => !ref.trim())) {
    throw new Error('Predictive certification evidenceRefs must contain provenance references')
  }
}

function assertReadinessBoundary(result: PrescriptiveReadinessResult) {
  if (
    result.recommendationRankingEnabled !== false ||
    result.recommendationGenerationEnabled !== false ||
    result.causalEffectClaimed !== false ||
    result.predictiveProbabilityExposed !== false ||
    result.decisionAuthority !== false ||
    result.executionAuthority !== false ||
    result.autonomousActionAllowed !== false ||
    result.humanReviewRequired !== true
  ) {
    throw new Error('Prescriptive review requires non-authoritative prescriptive readiness evidence')
  }
  if (result.evidenceRefs.length === 0 || result.evidenceRefs.some((ref) => !ref.trim())) {
    throw new Error('Prescriptive readiness evidenceRefs must contain provenance references')
  }
}

function validateCandidate(candidate: PrescriptiveCandidate): PrescriptiveCandidate {
  const candidateId = requiredText(candidate.candidateId, 'candidateId')
  const actionKey = requiredText(candidate.actionKey, 'actionKey')
  const actionPolicyId = requiredText(candidate.actionPolicyId, 'actionPolicyId')
  const actionPolicyVersion = requiredText(candidate.actionPolicyVersion, 'actionPolicyVersion')
  const rationale = requiredText(candidate.rationale, 'rationale')
  if (candidate.requiresApproval !== true) throw new Error('Prescriptive candidates must require approval')

  const evidenceRefs = [...new Set(candidate.evidenceRefs.map((value) => requiredText(value, 'evidenceRef')))].sort()
  if (evidenceRefs.length === 0) throw new Error('Prescriptive candidates require evidenceRefs')

  return {
    candidateId,
    actionKey,
    actionPolicyId,
    actionPolicyVersion,
    evidenceRefs,
    rationale,
    requiresApproval: true,
  }
}

function notReadyResult(input: {
  projectId: string
  candidateModelVersionId: string
  predictivePolicyId: string
  predictivePolicyVersion: string
  prescriptivePolicyId: string
  prescriptivePolicyVersion: string
  reason: Exclude<PrescriptiveReviewReason, 'READY_FOR_HUMAN_REVIEW'>
}): PrescriptiveReviewGateResult {
  return {
    version: PRESCRIPTIVE_REVIEW_GATE_VERSION,
    projectId: input.projectId,
    candidateModelVersionId: input.candidateModelVersionId,
    predictivePolicyId: input.predictivePolicyId,
    predictivePolicyVersion: input.predictivePolicyVersion,
    prescriptivePolicyId: input.prescriptivePolicyId,
    prescriptivePolicyVersion: input.prescriptivePolicyVersion,
    status: 'NOT_READY',
    reasons: [input.reason],
    candidates: [],
    candidateRankingApplied: false,
    expectedImpactClaimed: false,
    causalEffectClaimed: false,
    recommendationAuthority: false,
    decisionAuthority: false,
    executionAuthority: false,
    promotionAuthority: false,
    automaticActionAllowed: false,
    currentAuthorizationRequiredAtExecution: true,
    humanDecisionRequired: true,
  }
}

export function buildPrescriptiveReviewGate(input: {
  projectId: string
  predictive: PredictiveCertificationResult
  readiness: PrescriptiveReadinessResult
  candidates: PrescriptiveCandidate[]
}): PrescriptiveReviewGateResult {
  const projectId = requiredText(input.projectId, 'projectId')
  if (input.predictive.projectId !== projectId) throw new Error('predictive projectId must match projectId')
  if (input.readiness.projectId !== projectId) throw new Error('readiness projectId must match projectId')
  assertPredictiveBoundary(input.predictive)
  assertReadinessBoundary(input.readiness)

  const predictivePolicyId = requiredText(input.predictive.policy.policyId, 'predictive.policy.policyId')
  const predictivePolicyVersion = requiredText(input.predictive.policy.policyVersion, 'predictive.policy.policyVersion')
  const prescriptivePolicyId = requiredText(input.readiness.policy.policyId, 'readiness.policy.policyId')
  const prescriptivePolicyVersion = requiredText(input.readiness.policy.policyVersion, 'readiness.policy.policyVersion')
  const candidateModelVersionId = requiredText(input.predictive.candidateModelVersionId, 'candidateModelVersionId')

  if (input.readiness.candidateModelVersionId !== candidateModelVersionId) {
    throw new Error('readiness candidateModelVersionId must match predictive candidateModelVersionId')
  }

  const base = {
    projectId,
    candidateModelVersionId,
    predictivePolicyId,
    predictivePolicyVersion,
    prescriptivePolicyId,
    prescriptivePolicyVersion,
  }

  if (input.predictive.status !== 'ELIGIBLE_FOR_REVIEW') {
    return notReadyResult({ ...base, reason: 'PREDICTIVE_NOT_ELIGIBLE' })
  }

  if (input.readiness.status !== 'ELIGIBLE_FOR_HUMAN_REVIEW') {
    return notReadyResult({ ...base, reason: 'PRESCRIPTIVE_READINESS_NOT_ELIGIBLE' })
  }

  if (input.candidates.length === 0) {
    return notReadyResult({ ...base, reason: 'NO_CANDIDATES' })
  }

  const candidates = input.candidates.map(validateCandidate)
  const candidateIds = new Set<string>()
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.candidateId)) throw new Error(`duplicate prescriptive candidateId: ${candidate.candidateId}`)
    candidateIds.add(candidate.candidateId)
  }

  candidates.sort((a, b) => a.candidateId.localeCompare(b.candidateId))

  return {
    version: PRESCRIPTIVE_REVIEW_GATE_VERSION,
    ...base,
    status: 'REVIEW_REQUIRED',
    reasons: ['READY_FOR_HUMAN_REVIEW'],
    candidates,
    candidateRankingApplied: false,
    expectedImpactClaimed: false,
    causalEffectClaimed: false,
    recommendationAuthority: false,
    decisionAuthority: false,
    executionAuthority: false,
    promotionAuthority: false,
    automaticActionAllowed: false,
    currentAuthorizationRequiredAtExecution: true,
    humanDecisionRequired: true,
  }
}
