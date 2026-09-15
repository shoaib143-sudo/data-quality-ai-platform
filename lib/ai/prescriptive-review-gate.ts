import type { PredictiveCertificationResult } from './predictive-certification'

export const PRESCRIPTIVE_REVIEW_GATE_VERSION = 'prescriptive-review-gate-v1' as const

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
  | 'NO_CANDIDATES'
  | 'READY_FOR_HUMAN_REVIEW'

export type PrescriptiveReviewGateResult = {
  version: typeof PRESCRIPTIVE_REVIEW_GATE_VERSION
  projectId: string
  candidateModelVersionId: string
  predictivePolicyId: string
  predictivePolicyVersion: string
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
}

function validateCandidate(candidate: PrescriptiveCandidate): PrescriptiveCandidate {
  const candidateId = requiredText(candidate.candidateId, 'candidateId')
  const actionKey = requiredText(candidate.actionKey, 'actionKey')
  const actionPolicyId = requiredText(candidate.actionPolicyId, 'actionPolicyId')
  const actionPolicyVersion = requiredText(candidate.actionPolicyVersion, 'actionPolicyVersion')
  const rationale = requiredText(candidate.rationale, 'rationale')
  if (candidate.requiresApproval !== true) throw new Error('Prescriptive candidates must require approval')

  const evidenceRefs = [...new Set(candidate.evidenceRefs.map((value) => requiredText(value, 'evidenceRef'))) ].sort()
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

export function buildPrescriptiveReviewGate(input: {
  projectId: string
  predictive: PredictiveCertificationResult
  candidates: PrescriptiveCandidate[]
}): PrescriptiveReviewGateResult {
  const projectId = requiredText(input.projectId, 'projectId')
  if (input.predictive.projectId !== projectId) throw new Error('predictive projectId must match projectId')
  assertPredictiveBoundary(input.predictive)

  const predictivePolicyId = requiredText(input.predictive.policy.policyId, 'predictive.policy.policyId')
  const predictivePolicyVersion = requiredText(input.predictive.policy.policyVersion, 'predictive.policy.policyVersion')
  const candidateModelVersionId = requiredText(input.predictive.candidateModelVersionId, 'candidateModelVersionId')

  if (input.predictive.status !== 'ELIGIBLE_FOR_REVIEW') {
    return {
      version: PRESCRIPTIVE_REVIEW_GATE_VERSION,
      projectId,
      candidateModelVersionId,
      predictivePolicyId,
      predictivePolicyVersion,
      status: 'NOT_READY',
      reasons: ['PREDICTIVE_NOT_ELIGIBLE'],
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

  if (input.candidates.length === 0) {
    return {
      version: PRESCRIPTIVE_REVIEW_GATE_VERSION,
      projectId,
      candidateModelVersionId,
      predictivePolicyId,
      predictivePolicyVersion,
      status: 'NOT_READY',
      reasons: ['NO_CANDIDATES'],
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

  const candidates = input.candidates.map(validateCandidate)
  const candidateIds = new Set<string>()
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.candidateId)) throw new Error(`duplicate prescriptive candidateId: ${candidate.candidateId}`)
    candidateIds.add(candidate.candidateId)
  }

  candidates.sort((a, b) => a.candidateId.localeCompare(b.candidateId))

  return {
    version: PRESCRIPTIVE_REVIEW_GATE_VERSION,
    projectId,
    candidateModelVersionId,
    predictivePolicyId,
    predictivePolicyVersion,
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
