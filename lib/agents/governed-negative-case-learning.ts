import type { GovernedAgentKey } from './governed-agent-registry'
import { PGCL_AGENT_DEFAULT_SKILL } from './proactive-governed-case-learning'
import { buildGovernedLearningCaseDraft, type GovernedLearningCaseDraft } from './governed-learning-case-registry'

export type FailedGovernedRunSnapshot = {
  id: string
  project_id: string
  status: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function deriveNegativeLearningCaseFromFailedRun(input: {
  run: FailedGovernedRunSnapshot
  agentKey: GovernedAgentKey
  runMode: 'SUPERVISED' | 'HANDSFREE'
  failureEvidenceRefs: readonly string[]
  verificationEvidenceRefs?: readonly string[]
}): GovernedLearningCaseDraft | null {
  if (!['FAILED', 'CANCELLED'].includes(input.run.status)) return null
  if (!input.failureEvidenceRefs.length) return null

  const runInput = record(input.run.input)
  const runOutput = record(input.run.output)
  const skillKey = PGCL_AGENT_DEFAULT_SKILL[input.agentKey]
  const problem = text(runInput.question) || text(runInput.evidence_query) || text(runInput.task) || skillKey
  const failureSummary =
    text(runOutput.error)
    || text(runOutput.failure_reason)
    || text(runOutput.message)
    || `${input.agentKey} ended with governed run status ${input.run.status}.`

  return buildGovernedLearningCaseDraft({
    caseType: 'NEGATIVE_CASE',
    projectId: input.run.project_id,
    sourceAgentRunId: input.run.id,
    agentKey: input.agentKey,
    skillKey,
    runMode: input.runMode,
    useCaseKey: `${input.agentKey}:${skillKey}:failure-pattern`,
    problemSignature: problem,
    summary: failureSummary,
    reusableLesson: `Avoid repeating the failed execution pattern from run ${input.run.id}; re-evaluate current evidence, authorization, tool contracts, and failure conditions before retrying.`,
    executionSucceeded: false,
    verificationSucceeded: false,
    evidenceRefs: [`agent_run:${input.run.id}`, ...input.failureEvidenceRefs],
    verificationEvidenceRefs: input.verificationEvidenceRefs ?? [],
  })
}
