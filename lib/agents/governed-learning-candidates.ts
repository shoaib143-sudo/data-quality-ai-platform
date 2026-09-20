import type { EvaluationScorecardMetric } from '../ai/evaluation-engine'
import type { GovernedAgentKey } from './governed-agent-registry'
import type { GovernedSkillKey } from './governed-skill-registry'
import {
  proposeGovernedSkillImprovementsFromScorecard,
  type GovernedSkillImprovementProposal,
  type SkillImprovementCategory,
} from './governed-skill-improvement-proposals'

export const LEARNING_CANDIDATE_STATUSES = [
  'PROPOSED',
  'EVIDENCE_READY',
  'BENCHMARKING',
  'NOT_READY',
  'REVIEW_REQUIRED',
  'APPROVED_FOR_CONTROLLED_RELEASE',
  'REJECTED',
  'CANARY',
  'VERIFIED',
  'ACTIVE',
  'ROLLED_BACK',
  'SUPERSEDED',
  'RETIRED',
] as const

export type LearningCandidateStatus = typeof LEARNING_CANDIDATE_STATUSES[number]
export type LearningCandidateType = 'SKILL_IMPROVEMENT'

export type GovernedLearningCandidateDraft = {
  contractVersion: '1.0'
  candidateType: LearningCandidateType
  candidateKey: string
  projectId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  category: SkillImprovementCategory
  title: string
  proposedChange: string
  baselineVersion: string
  candidateVersion: string
  evidenceCutoffAt: string
  evidenceDimensions: GovernedSkillImprovementProposal['evidenceDimensions']
  evidenceRefs: string[]
  rationale: string[]
  initialStatus: 'PROPOSED'
  mayAutoApply: false
  maySelfPromote: false
  mayExpandToolAuthority: false
  mayChangeMutationBoundary: false
  requiresHumanReview: true
  currentAuthorizationRequiredAtRelease: true
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function validTimestamp(value: string, label: string) {
  const normalized = requiredText(value, label)
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be a valid timestamp`)
  return normalized
}

function normalizedEvidenceRefs(values: readonly string[]) {
  const refs = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
  if (refs.length === 0) {
    throw new Error('governed learning candidates require persisted evaluation evidence')
  }
  return refs
}

function candidateKey(input: {
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  category: SkillImprovementCategory
  baselineVersion: string
  candidateVersion: string
  evidenceRefs: readonly string[]
}) {
  return [
    'skill-improvement',
    input.agentKey,
    input.skillKey,
    input.category,
    input.baselineVersion,
    input.candidateVersion,
    ...input.evidenceRefs,
  ].join(':')
}

export function buildGovernedLearningCandidateDraftsFromScorecard(input: {
  projectId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  metrics: readonly EvaluationScorecardMetric[]
  baselineVersion: string
  candidateVersion: string
  evidenceCutoffAt: string
}): GovernedLearningCandidateDraft[] {
  const projectId = requiredText(input.projectId, 'projectId')
  const baselineVersion = requiredText(input.baselineVersion, 'baselineVersion')
  const candidateVersion = requiredText(input.candidateVersion, 'candidateVersion')
  if (baselineVersion === candidateVersion) {
    throw new Error('candidateVersion must differ from baselineVersion')
  }
  const evidenceCutoffAt = validTimestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')

  const proposals = proposeGovernedSkillImprovementsFromScorecard({
    agentKey: input.agentKey,
    skillKey: input.skillKey,
    metrics: input.metrics,
  })

  return proposals.map((proposal) => {
    if (
      proposal.mayAutoApply !== false
      || proposal.requiresHumanReview !== true
      || !proposal.prohibitedActions.includes('SELF_PROMOTE_TO_PRODUCTION')
      || !proposal.prohibitedActions.includes('EXPAND_TOOL_AUTHORITY')
      || !proposal.prohibitedActions.includes('CHANGE_MUTATION_BOUNDARY')
    ) {
      throw new Error('governed improvement proposal violates the learning authority boundary')
    }

    const evidenceRefs = normalizedEvidenceRefs(proposal.evidenceRefs)
    return {
      contractVersion: '1.0' as const,
      candidateType: 'SKILL_IMPROVEMENT' as const,
      candidateKey: candidateKey({
        agentKey: proposal.agentKey,
        skillKey: proposal.skillKey,
        category: proposal.category,
        baselineVersion,
        candidateVersion,
        evidenceRefs,
      }),
      projectId,
      agentKey: proposal.agentKey,
      skillKey: proposal.skillKey,
      category: proposal.category,
      title: proposal.title,
      proposedChange: proposal.proposedChange,
      baselineVersion,
      candidateVersion,
      evidenceCutoffAt,
      evidenceDimensions: [...proposal.evidenceDimensions].sort(),
      evidenceRefs,
      rationale: [...proposal.rationale],
      initialStatus: 'PROPOSED' as const,
      mayAutoApply: false as const,
      maySelfPromote: false as const,
      mayExpandToolAuthority: false as const,
      mayChangeMutationBoundary: false as const,
      requiresHumanReview: true as const,
      currentAuthorizationRequiredAtRelease: true as const,
    }
  }).sort((left, right) => left.candidateKey.localeCompare(right.candidateKey))
}
