import type { GovernedSkillImprovementProposal } from './governed-skill-improvement-proposals'

export type SkillBenchmarkEvidence = {
  benchmarkId: string
  evaluatorId: string
  evaluatorType: 'DETERMINISTIC' | 'LABELED_DATASET' | 'ADVERSARIAL_SUITE' | 'HUMAN_EVALUATION'
  observedAt: string
  candidateVersion: string
  baselineVersion: string
  caseCount: number
  baselineScore: number
  candidateScore: number
  authorityViolations: number
  adversarialFailures: number
  evidenceRefs: readonly string[]
}

export type SkillPromotionReview = {
  reviewerId: string
  decision: 'APPROVE_CONTROLLED_RELEASE' | 'REJECT'
  rationale: string
  reviewedAt: string
  evidenceRef: string
}

export type SkillPromotionGateResult = {
  gateVersion: '1.0'
  status: 'NOT_READY' | 'ELIGIBLE_FOR_HUMAN_REVIEW' | 'APPROVED_FOR_CONTROLLED_RELEASE' | 'REJECTED'
  agentKey: GovernedSkillImprovementProposal['agentKey']
  skillKey: GovernedSkillImprovementProposal['skillKey']
  currentVersion: string
  candidateVersion: string
  benchmarkId: string
  evaluatorId: string
  evaluatorType: SkillBenchmarkEvidence['evaluatorType']
  benchmarkObservedAt: string
  rollbackRef: string
  reasons: string[]
  benchmarkEvidenceRefs: string[]
  reviewEvidenceRef: string | null
  automaticPromotionAllowed: false
  automaticAuthorityExpansionAllowed: false
  automaticMutationBoundaryChangeAllowed: false
  rollbackRequired: true
  currentAuthorizationRequiredAtRelease: true
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function positiveInteger(value: number, label: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return value
}

function boundedScore(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`)
  return value
}

function timestamp(value: string, label: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`)
  return parsed
}

function evidenceRefs(values: readonly string[]) {
  const refs = values.map((value) => requiredText(value, 'benchmark.evidenceRef'))
  if (!refs.length) throw new Error('benchmark evidence references are required')
  if (new Set(refs).size !== refs.length) throw new Error('benchmark evidence references must be unique')
  return [...refs].sort()
}

export function evaluateGovernedSkillPromotion(input: {
  proposal: GovernedSkillImprovementProposal
  currentVersion: string
  candidateVersion: string
  rollbackRef: string
  benchmark: SkillBenchmarkEvidence
  minimumCaseCount?: number
  minimumCandidateScore?: number
  review?: SkillPromotionReview | null
}): SkillPromotionGateResult {
  const currentVersion = requiredText(input.currentVersion, 'currentVersion')
  const candidateVersion = requiredText(input.candidateVersion, 'candidateVersion')
  const rollbackRef = requiredText(input.rollbackRef, 'rollbackRef')
  if (candidateVersion === currentVersion) throw new Error('candidateVersion must differ from currentVersion')
  if (input.proposal.status !== 'PROPOSED' || input.proposal.mayAutoApply !== false || input.proposal.requiresHumanReview !== true) {
    throw new Error('skill promotion requires a governed human-reviewed improvement proposal')
  }
  if (input.proposal.prohibitedActions.includes('SELF_PROMOTE_TO_PRODUCTION') !== true) {
    throw new Error('skill proposal must explicitly prohibit self-promotion')
  }

  const benchmarkId = requiredText(input.benchmark.benchmarkId, 'benchmark.benchmarkId')
  const evaluatorId = requiredText(input.benchmark.evaluatorId, 'benchmark.evaluatorId')
  if (evaluatorId === input.proposal.agentKey) throw new Error('skill benchmark evaluator must be independent from the proposing agent')
  if (requiredText(input.benchmark.baselineVersion, 'benchmark.baselineVersion') !== currentVersion) {
    throw new Error('benchmark baselineVersion must match currentVersion')
  }
  if (requiredText(input.benchmark.candidateVersion, 'benchmark.candidateVersion') !== candidateVersion) {
    throw new Error('benchmark candidateVersion must match candidateVersion')
  }
  const benchmarkObservedAtMs = timestamp(input.benchmark.observedAt, 'benchmark.observedAt')

  const caseCount = positiveInteger(input.benchmark.caseCount, 'benchmark.caseCount')
  const minimumCaseCount = positiveInteger(input.minimumCaseCount ?? 20, 'minimumCaseCount')
  const baselineScore = boundedScore(input.benchmark.baselineScore, 'benchmark.baselineScore')
  const candidateScore = boundedScore(input.benchmark.candidateScore, 'benchmark.candidateScore')
  const minimumCandidateScore = boundedScore(input.minimumCandidateScore ?? 0.8, 'minimumCandidateScore')
  const authorityViolations = nonNegativeInteger(input.benchmark.authorityViolations, 'benchmark.authorityViolations')
  const adversarialFailures = nonNegativeInteger(input.benchmark.adversarialFailures, 'benchmark.adversarialFailures')
  const benchmarkEvidenceRefs = evidenceRefs(input.benchmark.evidenceRefs)

  const reasons: string[] = []
  if (caseCount < minimumCaseCount) reasons.push('INSUFFICIENT_BENCHMARK_CASES')
  if (candidateScore < minimumCandidateScore) reasons.push('CANDIDATE_SCORE_BELOW_THRESHOLD')
  if (candidateScore < baselineScore) reasons.push('CANDIDATE_REGRESSES_BASELINE')
  if (authorityViolations > 0) reasons.push('AUTHORITY_VIOLATION_DETECTED')
  if (adversarialFailures > 0) reasons.push('ADVERSARIAL_FAILURE_DETECTED')

  const base = {
    gateVersion: '1.0' as const,
    agentKey: input.proposal.agentKey,
    skillKey: input.proposal.skillKey,
    currentVersion,
    candidateVersion,
    benchmarkId,
    evaluatorId,
    evaluatorType: input.benchmark.evaluatorType,
    benchmarkObservedAt: input.benchmark.observedAt,
    rollbackRef,
    benchmarkEvidenceRefs,
    automaticPromotionAllowed: false as const,
    automaticAuthorityExpansionAllowed: false as const,
    automaticMutationBoundaryChangeAllowed: false as const,
    rollbackRequired: true as const,
    currentAuthorizationRequiredAtRelease: true as const,
  }

  if (reasons.length > 0) {
    return {
      ...base,
      status: 'NOT_READY',
      reasons,
      reviewEvidenceRef: null,
    }
  }

  if (!input.review) {
    return {
      ...base,
      status: 'ELIGIBLE_FOR_HUMAN_REVIEW',
      reasons: ['BENCHMARK_PASSED_HUMAN_REVIEW_REQUIRED'],
      reviewEvidenceRef: null,
    }
  }

  requiredText(input.review.reviewerId, 'review.reviewerId')
  requiredText(input.review.rationale, 'review.rationale')
  const reviewedAtMs = timestamp(input.review.reviewedAt, 'review.reviewedAt')
  if (reviewedAtMs < benchmarkObservedAtMs) throw new Error('human review must not predate benchmark evidence')
  const reviewEvidenceRef = requiredText(input.review.evidenceRef, 'review.evidenceRef')
  if (benchmarkEvidenceRefs.includes(reviewEvidenceRef)) {
    throw new Error('human review evidence must be distinct from benchmark evidence')
  }

  return {
    ...base,
    status: input.review.decision === 'APPROVE_CONTROLLED_RELEASE' ? 'APPROVED_FOR_CONTROLLED_RELEASE' : 'REJECTED',
    reasons: input.review.decision === 'APPROVE_CONTROLLED_RELEASE'
      ? ['HUMAN_REVIEW_APPROVED_CONTROLLED_RELEASE']
      : ['HUMAN_REVIEW_REJECTED'],
    reviewEvidenceRef,
  }
}
