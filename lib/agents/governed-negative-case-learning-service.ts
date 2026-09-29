import { createAdminClient } from '@/lib/supabase/admin'
import type { GovernedLearningCaseDraft } from './governed-learning-case-registry'

export const NEGATIVE_CASE_ADMIN_DECISIONS = [
  'APPROVE_NEGATIVE_CASE',
  'REJECT',
  'DEFER',
  'MARK_ONE_OFF',
] as const

export type NegativeCaseAdminDecision = typeof NEGATIVE_CASE_ADMIN_DECISIONS[number]

export async function persistGovernedNegativeLearningCase(input: {
  candidate: GovernedLearningCaseDraft
  actorUserId?: string | null
}) {
  if (input.candidate.candidateType !== 'NEGATIVE_CASE') {
    throw new Error('persistGovernedNegativeLearningCase requires NEGATIVE_CASE')
  }
  const candidate = input.candidate
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('create_negative_learning_case', {
    p_project_id: candidate.projectId,
    p_candidate_key: candidate.candidateKey,
    p_agent_key: candidate.agentKey,
    p_skill_key: candidate.skillKey,
    p_source_agent_run_id: candidate.sourceAgentRunId,
    p_run_mode: candidate.runMode,
    p_use_case_key: candidate.useCaseKey,
    p_problem_signature: candidate.problemSignature,
    p_failure_summary: candidate.summary,
    p_avoid_lesson: candidate.reusableLesson,
    p_evidence_refs: candidate.evidenceRefs,
    p_verification_evidence_refs: candidate.verificationEvidenceRefs,
    p_actor_user_id: input.actorUserId ?? null,
  })
  if (error || !data) {
    throw new Error(`Unable to persist governed negative case: ${error?.message ?? 'no candidate id returned'}`)
  }
  return String(data)
}

export async function reviewGovernedNegativeLearningCase(input: {
  projectId: string
  candidateId: string
  actorUserId: string
  decision: NegativeCaseAdminDecision
  reason: string
}) {
  if (!NEGATIVE_CASE_ADMIN_DECISIONS.includes(input.decision)) {
    throw new Error('unsupported negative-case admin decision')
  }
  if (!input.reason.trim()) throw new Error('negative-case review reason is required')
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('review_negative_learning_case', {
    p_project_id: input.projectId,
    p_candidate_id: input.candidateId,
    p_actor_user_id: input.actorUserId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
  })
  if (error || !data) {
    throw new Error(`Unable to review governed negative case: ${error?.message ?? 'no candidate id returned'}`)
  }
  return String(data)
}
