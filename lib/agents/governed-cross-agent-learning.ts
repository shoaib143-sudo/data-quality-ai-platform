import type { GovernedAgentKey } from './governed-agent-registry'
import type { GovernedSkillKey } from './governed-skill-registry'

export type CrossAgentPositiveCaseEvidence = {
  projectId: string
  candidateId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  useCaseKey: string
  reusableLesson: string
  reviewStatus: string
  productionEligible: boolean
}

export type GovernedCrossAgentLearningProposal = {
  contractVersion: '1.0'
  proposalType: 'CROSS_AGENT_PATTERN'
  proposalKey: string
  projectId: string
  patternKey: string
  title: string
  summary: string
  sourceCandidateIds: string[]
  sourceAgentKeys: GovernedAgentKey[]
  sourceSkillKeys: GovernedSkillKey[]
  reusableLessons: string[]
  status: 'PROPOSED'
  requiresDataGovernanceAdminReview: true
  mayAutoPromote: false
  mayAuthorizeAction: false
  mayModifyAgents: false
  mayExpandAuthority: false
  currentPolicyReevaluationRequired: true
}

function required(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function normalizedUnique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
}

export function crossAgentPatternKey(useCaseKeyInput: string) {
  const useCaseKey = required(useCaseKeyInput, 'useCaseKey')
  const parts = useCaseKey.split(':').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 3) {
    throw new Error('cross-agent learning requires a governed useCaseKey with agent, skill, and focus')
  }
  return parts.slice(2).join(':')
}

function proposalKey(patternKey: string, candidateIds: readonly string[]) {
  return `cross-agent:${patternKey}:${normalizedUnique(candidateIds).join(',')}`
}

/**
 * Detects conservative shared learning patterns across independently approved
 * positive cases. A proposal is context only until explicit Data Governance
 * Admin review. This function never modifies an agent, changes tool authority,
 * or grants action authority.
 */
export function buildGovernedCrossAgentLearningProposals(input: {
  projectId: string
  cases: readonly CrossAgentPositiveCaseEvidence[]
  minimumDistinctAgents?: number
  minimumCases?: number
}): GovernedCrossAgentLearningProposal[] {
  const projectId = required(input.projectId, 'projectId')
  const minimumDistinctAgents = input.minimumDistinctAgents ?? 2
  const minimumCases = input.minimumCases ?? 2

  if (!Number.isInteger(minimumDistinctAgents) || minimumDistinctAgents < 2) {
    throw new Error('minimumDistinctAgents must be an integer of at least 2')
  }
  if (!Number.isInteger(minimumCases) || minimumCases < 2) {
    throw new Error('minimumCases must be an integer of at least 2')
  }

  for (const evidence of input.cases) {
    if (required(evidence.projectId, 'case.projectId') !== projectId) {
      throw new Error('cross-project positive-case evidence is not allowed')
    }
    required(evidence.candidateId, 'case.candidateId')
    required(evidence.reusableLesson, 'case.reusableLesson')
  }

  const eligible = input.cases.filter((evidence) =>
    evidence.reviewStatus === 'APPROVED' && evidence.productionEligible === true
  )

  const grouped = new Map<string, CrossAgentPositiveCaseEvidence[]>()
  for (const evidence of eligible) {
    const key = crossAgentPatternKey(evidence.useCaseKey)
    const current = grouped.get(key) ?? []
    current.push(evidence)
    grouped.set(key, current)
  }

  const proposals: GovernedCrossAgentLearningProposal[] = []
  for (const [patternKey, evidence] of grouped) {
    const sourceCandidateIds = normalizedUnique(evidence.map((item) => item.candidateId))
    const sourceAgentKeys = [...new Set(evidence.map((item) => item.agentKey))].sort()
    const sourceSkillKeys = [...new Set(evidence.map((item) => item.skillKey))].sort()
    const reusableLessons = normalizedUnique(evidence.map((item) => item.reusableLesson))

    if (sourceCandidateIds.length < minimumCases || sourceAgentKeys.length < minimumDistinctAgents) {
      continue
    }

    proposals.push({
      contractVersion: '1.0',
      proposalType: 'CROSS_AGENT_PATTERN',
      proposalKey: proposalKey(patternKey, sourceCandidateIds),
      projectId,
      patternKey,
      title: `Cross-agent learning pattern: ${patternKey}`,
      summary: `${sourceAgentKeys.length} governed agents independently produced approved, production-eligible positive cases for ${patternKey}.`,
      sourceCandidateIds,
      sourceAgentKeys,
      sourceSkillKeys,
      reusableLessons,
      status: 'PROPOSED',
      requiresDataGovernanceAdminReview: true,
      mayAutoPromote: false,
      mayAuthorizeAction: false,
      mayModifyAgents: false,
      mayExpandAuthority: false,
      currentPolicyReevaluationRequired: true,
    })
  }

  return proposals.sort((left, right) => left.proposalKey.localeCompare(right.proposalKey))
}
