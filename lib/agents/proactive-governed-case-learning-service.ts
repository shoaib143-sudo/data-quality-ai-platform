import { createAdminClient } from '@/lib/supabase/admin'
import type {
  PgclAdminDecision,
  ProactiveGovernedCaseLearningCandidate,
} from './proactive-governed-case-learning'

export async function persistProactiveGovernedCaseLearningCandidate(input: {
  candidate: ProactiveGovernedCaseLearningCandidate
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const candidate = input.candidate

  const { data, error } = await admin.schema('agent').rpc('create_positive_learning_case', {
    p_project_id: candidate.projectId,
    p_candidate_key: candidate.candidateKey,
    p_agent_key: candidate.agentKey,
    p_skill_key: candidate.skillKey,
    p_source_agent_run_id: candidate.sourceAgentRunId,
    p_run_mode: candidate.runMode,
    p_use_case_key: candidate.useCaseKey,
    p_problem_signature: candidate.problemSignature,
    p_result_summary: candidate.resultSummary,
    p_reusable_lesson: candidate.reusableLesson,
    p_applicability_conditions: candidate.applicabilityConditions,
    p_exclusion_conditions: candidate.exclusionConditions,
    p_evidence_refs: candidate.evidenceRefs,
    p_verification_evidence_refs: candidate.verificationEvidenceRefs,
    p_significance_signals: candidate.significanceSignals,
    p_actor_user_id: input.actorUserId ?? null,
  })

  if (error || !data) {
    throw new Error(`Unable to persist proactive governed positive case: ${error?.message ?? 'no candidate id returned'}`)
  }
  return String(data)
}

export async function reviewProactiveGovernedCaseLearningCandidate(input: {
  projectId: string
  candidateId: string
  actorUserId: string
  decision: PgclAdminDecision
  reason: string
  edits?: Record<string, unknown>
}) {
  if (!input.actorUserId.trim()) {
    throw new Error('Data Governance Admin actorUserId is required')
  }
  if (!input.reason.trim()) {
    throw new Error('PGCL review reason is required')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('review_positive_learning_case', {
    p_project_id: input.projectId,
    p_candidate_id: input.candidateId,
    p_actor_user_id: input.actorUserId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
    p_edits: input.edits ?? {},
  })

  if (error || !data) {
    throw new Error(`Unable to review proactive governed positive case: ${error?.message ?? 'no candidate id returned'}`)
  }
  return String(data)
}
