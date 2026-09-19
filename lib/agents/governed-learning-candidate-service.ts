import { createAdminClient } from '@/lib/supabase/admin'
import type {
  GovernedLearningCandidateDraft,
  LearningCandidateStatus,
} from './governed-learning-candidates'

export async function persistGovernedLearningCandidate(input: {
  candidate: GovernedLearningCandidateDraft
  sourceAgentRunId?: string | null
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const candidate = input.candidate
  const { data, error } = await admin.schema('agent').rpc('create_learning_candidate', {
    p_project_id: candidate.projectId,
    p_candidate_key: candidate.candidateKey,
    p_candidate_type: candidate.candidateType,
    p_agent_key: candidate.agentKey,
    p_skill_key: candidate.skillKey,
    p_category: candidate.category,
    p_title: candidate.title,
    p_proposed_change: candidate.proposedChange,
    p_baseline_version: candidate.baselineVersion,
    p_candidate_version: candidate.candidateVersion,
    p_evidence_cutoff_at: candidate.evidenceCutoffAt,
    p_evidence_refs: candidate.evidenceRefs,
    p_source_agent_run_id: input.sourceAgentRunId ?? null,
    p_actor_user_id: input.actorUserId ?? null,
  })
  if (error || !data) {
    throw new Error(`Unable to persist governed learning candidate: ${error?.message ?? 'no candidate id returned'}`)
  }
  return String(data)
}

export async function transitionGovernedLearningCandidate(input: {
  projectId: string
  candidateId: string
  expectedStatus: LearningCandidateStatus
  targetStatus: 'EVIDENCE_READY' | 'REJECTED'
  reason: string
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('transition_learning_candidate', {
    p_project_id: input.projectId,
    p_candidate_id: input.candidateId,
    p_expected_status: input.expectedStatus,
    p_target_status: input.targetStatus,
    p_reason: input.reason,
    p_actor_user_id: input.actorUserId ?? null,
  })
  if (error || !data) {
    throw new Error(`Unable to transition governed learning candidate: ${error?.message ?? 'no candidate id returned'}`)
  }
  return String(data)
}
