import type { GovernedAgentKey } from './governed-agent-registry'
import type { GovernedSkillKey } from './governed-skill-registry'

export const GOVERNED_CASE_TYPES = ['POSITIVE_CASE', 'NEGATIVE_CASE'] as const
export type GovernedCaseType = typeof GOVERNED_CASE_TYPES[number]

export type GovernedLearningCaseDraft = {
  contractVersion: '1.0'
  candidateType: GovernedCaseType
  candidateKey: string
  projectId: string
  sourceAgentRunId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  runMode: 'SUPERVISED' | 'HANDSFREE'
  useCaseKey: string
  problemSignature: string
  summary: string
  reusableLesson: string
  evidenceRefs: string[]
  verificationEvidenceRefs: string[]
  requiresHumanReview: true
  mayAutoApply: false
  maySelfPromote: false
  mayExpandToolAuthority: false
  mayChangeMutationBoundary: false
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function normalizedRefs(values: readonly string[], label: string, required = true) {
  const refs = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
  if (required && refs.length === 0) throw new Error(`${label} requires at least one evidence reference`)
  return refs
}

export function buildGovernedLearningCaseDraft(input: {
  caseType: GovernedCaseType
  projectId: string
  sourceAgentRunId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  runMode: 'SUPERVISED' | 'HANDSFREE'
  useCaseKey: string
  problemSignature: string
  summary: string
  reusableLesson: string
  executionSucceeded: boolean
  verificationSucceeded: boolean
  evidenceRefs: readonly string[]
  verificationEvidenceRefs: readonly string[]
}): GovernedLearningCaseDraft {
  if (!GOVERNED_CASE_TYPES.includes(input.caseType)) {
    throw new Error('unsupported governed learning case type')
  }

  if (input.caseType === 'POSITIVE_CASE' && (!input.executionSucceeded || !input.verificationSucceeded)) {
    throw new Error('positive learning cases require successful execution and verification')
  }

  if (input.caseType === 'NEGATIVE_CASE' && input.executionSucceeded && input.verificationSucceeded) {
    throw new Error('negative learning cases require an execution or verification failure')
  }

  const projectId = requiredText(input.projectId, 'projectId')
  const sourceAgentRunId = requiredText(input.sourceAgentRunId, 'sourceAgentRunId')
  const useCaseKey = requiredText(input.useCaseKey, 'useCaseKey')
  const problemSignature = requiredText(input.problemSignature, 'problemSignature')
  const summary = requiredText(input.summary, 'summary')
  const reusableLesson = requiredText(input.reusableLesson, 'reusableLesson')
  const evidenceRefs = normalizedRefs(input.evidenceRefs, 'evidenceRefs')
  const verificationEvidenceRefs = normalizedRefs(
    input.verificationEvidenceRefs,
    'verificationEvidenceRefs',
    input.caseType === 'POSITIVE_CASE',
  )

  return {
    contractVersion: '1.0',
    candidateType: input.caseType,
    candidateKey: [
      input.caseType.toLowerCase(),
      input.agentKey,
      input.skillKey,
      useCaseKey,
      sourceAgentRunId,
    ].join(':'),
    projectId,
    sourceAgentRunId,
    agentKey: input.agentKey,
    skillKey: input.skillKey,
    runMode: input.runMode,
    useCaseKey,
    problemSignature,
    summary,
    reusableLesson,
    evidenceRefs,
    verificationEvidenceRefs,
    requiresHumanReview: true,
    mayAutoApply: false,
    maySelfPromote: false,
    mayExpandToolAuthority: false,
    mayChangeMutationBoundary: false,
  }
}
