import type { SkillBenchmarkEvidence } from './governed-skill-promotion-gate'
import { evaluateGovernedSkillPromotion } from './governed-skill-promotion-gate'
import type { GovernedLearningCandidateDraft } from './governed-learning-candidates'

export type GovernedLearningBenchmarkDecision = {
  decisionVersion: '1.0'
  candidateKey: string
  status: 'NOT_READY' | 'REVIEW_REQUIRED'
  benchmarkId: string
  evaluatorId: string
  evaluatorType: SkillBenchmarkEvidence['evaluatorType']
  baselineVersion: string
  candidateVersion: string
  baselineScore: number
  candidateScore: number
  caseCount: number
  authorityViolations: number
  adversarialFailures: number
  evidenceRefs: string[]
  rollbackRef: string
  minimumCaseCount: number
  minimumCandidateScore: number
  reasons: string[]
  automaticPromotionAllowed: false
  automaticAuthorityExpansionAllowed: false
  automaticMutationBoundaryChangeAllowed: false
  humanReviewRequired: true
  currentAuthorizationRequiredAtRelease: true
}

export function evaluateGovernedLearningCandidateBenchmark(input: {
  candidate: GovernedLearningCandidateDraft
  benchmark: SkillBenchmarkEvidence
  rollbackRef: string
  minimumCaseCount?: number
  minimumCandidateScore?: number
}): GovernedLearningBenchmarkDecision {
  const proposal = {
    proposalVersion: '1.0' as const,
    status: 'PROPOSED' as const,
    agentKey: input.candidate.agentKey,
    skillKey: input.candidate.skillKey,
    category: input.candidate.category,
    title: input.candidate.title,
    proposedChange: input.candidate.proposedChange,
    evidenceDimensions: input.candidate.evidenceDimensions,
    evidenceRefs: input.candidate.evidenceRefs,
    rationale: input.candidate.rationale,
    mayAutoApply: false as const,
    requiresHumanReview: true as const,
    requiredApproval: 'HUMAN_GOVERNANCE_REVIEW' as const,
    prohibitedActions: [
      'SELF_MODIFY_SKILL_REGISTRY',
      'EXPAND_TOOL_AUTHORITY',
      'CHANGE_MUTATION_BOUNDARY',
      'SELF_PROMOTE_TO_PRODUCTION',
    ] as const,
  }

  const minimumCaseCount = input.minimumCaseCount ?? 20
  const minimumCandidateScore = input.minimumCandidateScore ?? 0.8

  const result = evaluateGovernedSkillPromotion({
    proposal,
    currentVersion: input.candidate.baselineVersion,
    candidateVersion: input.candidate.candidateVersion,
    rollbackRef: input.rollbackRef,
    benchmark: input.benchmark,
    minimumCaseCount,
    minimumCandidateScore,
  })

  if (result.status !== 'NOT_READY' && result.status !== 'ELIGIBLE_FOR_HUMAN_REVIEW') {
    throw new Error('benchmark-only learning evaluation must not approve or reject a governed candidate')
  }

  return {
    decisionVersion: '1.0',
    candidateKey: input.candidate.candidateKey,
    status: result.status === 'ELIGIBLE_FOR_HUMAN_REVIEW' ? 'REVIEW_REQUIRED' : 'NOT_READY',
    benchmarkId: result.benchmarkId,
    evaluatorId: result.evaluatorId,
    evaluatorType: result.evaluatorType,
    baselineVersion: result.currentVersion,
    candidateVersion: result.candidateVersion,
    baselineScore: input.benchmark.baselineScore,
    candidateScore: input.benchmark.candidateScore,
    caseCount: input.benchmark.caseCount,
    authorityViolations: input.benchmark.authorityViolations,
    adversarialFailures: input.benchmark.adversarialFailures,
    evidenceRefs: [...result.benchmarkEvidenceRefs],
    rollbackRef: result.rollbackRef,
    minimumCaseCount,
    minimumCandidateScore,
    reasons: [...result.reasons],
    automaticPromotionAllowed: false,
    automaticAuthorityExpansionAllowed: false,
    automaticMutationBoundaryChangeAllowed: false,
    humanReviewRequired: true,
    currentAuthorizationRequiredAtRelease: true,
  }
}
