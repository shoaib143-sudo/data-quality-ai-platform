import type { GovernedAgentKey } from './governed-agent-registry'
import type { GovernedSkillKey } from './governed-skill-registry'

export const PGCL_RUN_MODES = ['SUPERVISED', 'HANDSFREE'] as const
export type PgclRunMode = typeof PGCL_RUN_MODES[number]

export const PGCL_SIGNIFICANCE_SIGNALS = [
  'NEW_USE_CASE',
  'NOVEL_VERIFIED_STRATEGY',
  'FIRST_SUCCESS_AFTER_FAILURES',
  'MATERIAL_EFFICIENCY_GAIN',
  'REPEATED_SUCCESS_THRESHOLD',
  'HIGH_VALUE_GOVERNANCE_PRECEDENT',
  'BROADENED_APPLICABILITY',
] as const
export type PgclSignificanceSignal = typeof PGCL_SIGNIFICANCE_SIGNALS[number]

export const PGCL_ADMIN_DECISIONS = [
  'APPROVE_POSITIVE_CASE',
  'APPROVE_WITH_EDITS',
  'REJECT',
  'DEFER',
  'MARK_ONE_OFF',
] as const
export type PgclAdminDecision = typeof PGCL_ADMIN_DECISIONS[number]

export type SuccessfulGovernedRunLearningInput = {
  projectId: string
  agentRunId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  runMode: PgclRunMode
  executionSucceeded: boolean
  verificationSucceeded: boolean
  useCaseKey: string
  problemSignature: string
  resultSummary: string
  reusableLesson: string
  applicabilityConditions: readonly string[]
  exclusionConditions: readonly string[]
  evidenceRefs: readonly string[]
  verificationEvidenceRefs: readonly string[]
  significanceSignals: readonly PgclSignificanceSignal[]
}

export type ProactiveGovernedCaseLearningCandidate = {
  contractVersion: '1.0'
  learningType: 'POSITIVE_CASE'
  candidateKey: string
  projectId: string
  sourceAgentRunId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  runMode: PgclRunMode
  useCaseKey: string
  problemSignature: string
  resultSummary: string
  reusableLesson: string
  applicabilityConditions: string[]
  exclusionConditions: string[]
  evidenceRefs: string[]
  verificationEvidenceRefs: string[]
  significanceSignals: PgclSignificanceSignal[]
  requiresDataGovernanceAdminReview: true
  mayAutoPromote: false
  maySelfLearn: false
  allowedAdminDecisions: readonly PgclAdminDecision[]
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function normalizedTextList(values: readonly string[], label: string, required = false) {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
  if (required && normalized.length === 0) {
    throw new Error(`${label} requires at least one value`)
  }
  return normalized
}

function normalizedSignals(values: readonly PgclSignificanceSignal[]) {
  const allowed = new Set<string>(PGCL_SIGNIFICANCE_SIGNALS)
  const signals = [...new Set(values)]
  for (const signal of signals) {
    if (!allowed.has(signal)) throw new Error(`unsupported PGCL significance signal: ${signal}`)
  }
  return signals.sort()
}

function candidateKey(input: {
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  sourceAgentRunId: string
  useCaseKey: string
}) {
  return [
    'positive-case',
    input.agentKey,
    input.skillKey,
    input.useCaseKey,
    input.sourceAgentRunId,
  ].join(':')
}

/**
 * Converts a successful governed execution into a human-reviewable positive-case
 * learning proposal only when success is independently verified and the run is
 * materially reusable. Technical execution success alone is intentionally
 * insufficient.
 */
export function buildProactiveGovernedCaseLearningCandidate(
  input: SuccessfulGovernedRunLearningInput,
): ProactiveGovernedCaseLearningCandidate | null {
  if (!PGCL_RUN_MODES.includes(input.runMode)) {
    throw new Error('PGCL only accepts SUPERVISED or HANDSFREE runs')
  }

  if (!input.executionSucceeded || !input.verificationSucceeded) {
    return null
  }

  const significanceSignals = normalizedSignals(input.significanceSignals)
  if (significanceSignals.length === 0) {
    return null
  }

  const projectId = requiredText(input.projectId, 'projectId')
  const sourceAgentRunId = requiredText(input.agentRunId, 'agentRunId')
  const useCaseKey = requiredText(input.useCaseKey, 'useCaseKey')
  const problemSignature = requiredText(input.problemSignature, 'problemSignature')
  const resultSummary = requiredText(input.resultSummary, 'resultSummary')
  const reusableLesson = requiredText(input.reusableLesson, 'reusableLesson')
  const evidenceRefs = normalizedTextList(input.evidenceRefs, 'evidenceRefs', true)
  const verificationEvidenceRefs = normalizedTextList(
    input.verificationEvidenceRefs,
    'verificationEvidenceRefs',
    true,
  )

  return {
    contractVersion: '1.0',
    learningType: 'POSITIVE_CASE',
    candidateKey: candidateKey({
      agentKey: input.agentKey,
      skillKey: input.skillKey,
      sourceAgentRunId,
      useCaseKey,
    }),
    projectId,
    sourceAgentRunId,
    agentKey: input.agentKey,
    skillKey: input.skillKey,
    runMode: input.runMode,
    useCaseKey,
    problemSignature,
    resultSummary,
    reusableLesson,
    applicabilityConditions: normalizedTextList(input.applicabilityConditions, 'applicabilityConditions'),
    exclusionConditions: normalizedTextList(input.exclusionConditions, 'exclusionConditions'),
    evidenceRefs,
    verificationEvidenceRefs,
    significanceSignals,
    requiresDataGovernanceAdminReview: true,
    mayAutoPromote: false,
    maySelfLearn: false,
    allowedAdminDecisions: PGCL_ADMIN_DECISIONS,
  }
}
