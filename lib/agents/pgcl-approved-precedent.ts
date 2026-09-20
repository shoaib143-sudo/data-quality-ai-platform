import { retrieveGovernedLearningContext } from '@/lib/agents/governed-learning-context'
import {
  recordPositiveLearningCaseOutcome,
  recordPositiveLearningCaseRetrievals,
} from '@/lib/agents/proactive-governed-case-learning-service'

export type AppliedPgclPrecedent = {
  learningCaseId: string
  candidateId: string
  caseKey: string
  problemType: string
  reusableLesson: string
  relevance: number
  evidence: Record<string, unknown>
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function loadApprovedPgclPrecedents(input: {
  projectId: string
  agentDefinitionId: string
  agentRunId: string
  query: string
  limit?: number
}): Promise<AppliedPgclPrecedent[]> {
  const context = await retrieveGovernedLearningContext({
    projectId: input.projectId,
    agentDefinitionId: input.agentDefinitionId,
    query: input.query,
    limit: input.limit ?? 5,
  })

  const cases = context.approvedPositiveCases.flatMap((learningCase) => {
    const recommendation = record(learningCase.recommendation)
    const reusableLesson = text(recommendation.reusable_lesson)
    const candidateId = text(learningCase.candidate_id)
    if (!candidateId || !reusableLesson || learningCase.relevance <= 0) return []

    return [{
      learningCaseId: String(learningCase.id),
      candidateId,
      caseKey: String(learningCase.case_key),
      problemType: String(learningCase.problem_type),
      reusableLesson,
      relevance: Number(learningCase.relevance),
      evidence: record(learningCase.evidence),
    }]
  })

  await recordPositiveLearningCaseRetrievals({
    projectId: input.projectId,
    consumerAgentRunId: input.agentRunId,
    cases: cases.map((learningCase) => ({
      candidateId: learningCase.candidateId,
      learningCaseId: learningCase.learningCaseId,
      relevance: learningCase.relevance,
    })),
  })

  return cases
}

export async function markPgclPrecedentsApplied(input: {
  projectId: string
  agentRunId: string
  cases: readonly AppliedPgclPrecedent[]
  executionSurface: 'PROFILING_INVESTIGATION' | 'DATA_QUALITY_INVESTIGATION'
}) {
  for (const learningCase of input.cases) {
    await recordPositiveLearningCaseOutcome({
      projectId: input.projectId,
      candidateId: learningCase.candidateId,
      consumerAgentRunId: input.agentRunId,
      status: 'APPLIED',
      outcome: {
        attribution: 'CONTEXT_ONLY_EXECUTION',
        execution_surface: input.executionSurface,
        current_authorization_still_required: true,
        current_policy_still_required: true,
      },
    })
  }
}
