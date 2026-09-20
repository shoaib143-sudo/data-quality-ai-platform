import {
  evaluateGovernedSkillPromotion,
  type SkillBenchmarkEvidence,
} from './governed-skill-promotion-gate'
import type { GovernedLearningCandidateDraft } from './governed-learning-candidates'
import type { GovernedSkillImprovementProposal } from './governed-skill-improvement-proposals'

const PROHIBITED_ACTIONS = [
  'SELF_MODIFY_SKILL_REGISTRY',
  'EXPAND_TOOL_AUTHORITY',
  'CHANGE_MUTATION_BOUNDARY',
  'SELF_PROMOTE_TO_PRODUCTION',
] as const

function proposalFromCandidate(candidate: GovernedLearningCandidateDraft): GovernedSkillImprovementProposal {
  if (
    candidate.mayAutoApply !== false
    || candidate.maySelfPromote !== false
    || candidate.mayExpandToolAuthority !== false
    || candidate.mayChangeMutationBoundary !== false
    || candidate.requiresHumanReview !== true
  ) {
    throw new Error('learning candidate violates governed promotion boundaries')
  }

  return {
    proposalVersion: '1.0',
    status: 'PROPOSED',
    agentKey: candidate.agentKey,
    skillKey: candidate.skillKey,
    category: candidate.category,
    title: candidate.title,
    proposedChange: candidate.proposedChange,
    evidenceDimensions: [...candidate.evidenceDimensions],
    evidenceRefs: [...candidate.evidenceRefs],
    rationale: [...candidate.rationale],
    mayAutoApply: false,
    requiresHumanReview: true,
    requiredApproval: 'HUMAN_GOVERNANCE_REVIEW',
    prohibitedActions: PROHIBITED_ACTIONS,
  }
}

export type GovernedLearningBenchmarkResult = {
  gateVersion: '1.0'
  candidateKey: string
  candidateStatus: 'NOT_READY' | 'REVIEW_REQUIRED'
  reasons: string[]
  benchmarkId: string
  evaluatorId: string
  evaluatorType: SkillBenchmarkEvidence['evaluatorType']
  benchmarkObservedAt: string
  baselineVersion: string
  candidateVersion: string
  rollbackRef: string
  benchmarkEvidenceRefs: string[]
  automaticPromotionAllowed: false
  automaticAuthorityExpansionAllowed: false
  automaticMutationBoundaryChangeAllowed: false
  rollbackRequired: true
  currentAuthorizationRequiredAtRelease: true
  humanReviewRequired: true
}

export function evaluateGovernedLearningCandidateBenchmark(input: {
  candidate: GovernedLearningCandidateDraft
  benchmark: SkillBenchmarkEvidence
  rollbackRef: string
  minimumCaseCount?: number
  minimumCandidateScore?: number
}): GovernedLearningBenchmarkResult {
  const gate = evaluateGovernedSkillPromotion({
    proposal: proposalFromCandidate(input.candidate),
    currentVersion: input.candidate.baselineVersion,
    candidateVersion: input.candidate.candidateVersion,
    rollbackRef: input.rollbackRef,
    benchmark: input.benchmark,
    minimumCaseCount: input.minimumCaseCount,
    minimumCandidateScore: input.minimumCandidateScore,
    review: null,
  })

  if (gate.status !== 'NOT_READY' && gate.status !== 'ELIGIBLE_FOR_HUMAN_REVIEW') {
    throw new Error('benchmark-only learning gate must not approve or release a candidate')
  }

  return {
    gateVersion: gate.gateVersion,
    candidateKey: input.candidate.candidateKey,
    candidateStatus: gate.status === 'ELIGIBLE_FOR_HUMAN_REVIEW' ? 'REVIEW_REQUIRED' : 'NOT_READY',
    reasons: [...gate.reasons],
    benchmarkId: gate.benchmarkId,
    evaluatorId: gate.evaluatorId,
    evaluatorType: gate.evaluatorType,
    benchmarkObservedAt: gate.benchmarkObservedAt,
    baselineVersion: gate.currentVersion,
    candidateVersion: gate.candidateVersion,
    rollbackRef: gate.rollbackRef,
    benchmarkEvidenceRefs: [...gate.benchmarkEvidenceRefs],
    automaticPromotionAllowed: false,
    automaticAuthorityExpansionAllowed: false,
    automaticMutationBoundaryChangeAllowed: false,
    rollbackRequired: true,
    currentAuthorizationRequiredAtRelease: true,
    humanReviewRequired: true,
  }
}
