import type { GovernedAgentKey } from './governed-agent-registry'
import type { GovernedSkillKey } from './governed-skill-registry'

export const PGCL_RUN_MODES = ['SUPERVISED', 'HANDSFREE'] as const
export type PgclRunMode = typeof PGCL_RUN_MODES[number]


export const PGCL_AGENT_DEFAULT_SKILL: Record<GovernedAgentKey, GovernedSkillKey> = {
  profiling_agent: 'profile_evidence_analysis',
  data_quality_agent: 'quality_rule_analysis',
  steward_agent: 'stewardship_gap_analysis',
  governance_analyst_agent: 'governance_evidence_synthesis',
  architect_agent: 'lineage_impact_analysis',
  investigator_agent: 'incident_root_cause_analysis',
  executive_agent: 'executive_materiality_analysis',
  support_agent: 'support_case_investigation',
}

export type PgclRunSnapshot = {
  id: string
  project_id: string
  status: string
  agent_definition_id: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
}

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

function pgclRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function pgclText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function pgclSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function firstPgclObservation(output: Record<string, unknown>) {
  const observations = Array.isArray(output.observations) ? output.observations : []
  for (const observation of observations) {
    if (typeof observation === 'string' && observation.trim()) return observation.trim().slice(0, 1000)
  }
  return ''
}

export function derivePgclRunIdentity(input: {
  run: PgclRunSnapshot
  agentKey: GovernedAgentKey
}) {
  const skillKey = PGCL_AGENT_DEFAULT_SKILL[input.agentKey]
  const output = pgclRecord(input.run.output)
  const specialist = pgclRecord(output.specialist)
  const focus = pgclText(specialist.focus) || pgclText(output.focus) || skillKey
  return {
    skillKey,
    focus,
    useCaseKey: `${input.agentKey}:${skillKey}:${pgclSlug(focus) || 'verified-run'}`,
  }
}

export function derivePgclCandidateFromVerifiedRun(input: {
  run: PgclRunSnapshot
  agentKey: GovernedAgentKey
  runMode: PgclRunMode
  verificationEvidenceRefs: readonly string[]
  priorPositiveCaseExists: boolean
}): ProactiveGovernedCaseLearningCandidate | null {
  if (input.run.status !== 'SUCCEEDED') return null

  const { skillKey, focus, useCaseKey } = derivePgclRunIdentity({
    run: input.run,
    agentKey: input.agentKey,
  })
  const runInput = pgclRecord(input.run.input)
  const output = pgclRecord(input.run.output)
  const question = pgclText(runInput.question) || pgclText(runInput.evidence_query)
  const resultSummary = firstPgclObservation(output)
    || `${input.agentKey} completed ${focus} with verified governed execution evidence.`

  return buildProactiveGovernedCaseLearningCandidate({
    projectId: input.run.project_id,
    agentRunId: input.run.id,
    agentKey: input.agentKey,
    skillKey,
    runMode: input.runMode,
    executionSucceeded: true,
    verificationSucceeded: input.verificationEvidenceRefs.length > 0,
    useCaseKey,
    problemSignature: question || focus,
    resultSummary,
    reusableLesson: `For ${focus}, reuse the verified evidence-collection and bounded analysis pattern demonstrated by this successful ${input.agentKey} run; re-evaluate all current authorization, policy, and asset-specific evidence before acting.`,
    applicabilityConditions: [
      `agent_key=${input.agentKey}`,
      `skill_key=${skillKey}`,
      `focus=${focus}`,
    ],
    exclusionConditions: [
      'current authorization or policy differs',
      'required verification evidence is unavailable',
      'the future case requires source/business data mutation',
    ],
    evidenceRefs: [`agent_run:${input.run.id}`],
    verificationEvidenceRefs: [...input.verificationEvidenceRefs],
    significanceSignals: [
      input.priorPositiveCaseExists ? 'REPEATED_SUCCESS_THRESHOLD' : 'NEW_USE_CASE',
    ],
  })
}

