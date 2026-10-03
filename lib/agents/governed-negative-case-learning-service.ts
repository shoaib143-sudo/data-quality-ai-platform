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


export async function recordNegativeLearningCaseRetrievals(input: {
  projectId: string
  consumerAgentRunId: string
  cases: Array<{
    candidateId: string
    learningCaseId: string
    relevance: number
  }>
}) {
  if (!input.cases.length) return 0
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const rows = input.cases.map((item) => ({
    project_id: input.projectId,
    candidate_id: item.candidateId,
    learning_case_id: item.learningCaseId,
    consumer_agent_run_id: input.consumerAgentRunId,
    relevance: Math.max(0, Math.min(1, item.relevance)),
    usage_status: 'RETRIEVED',
    updated_at: now,
  }))

  const { error } = await admin.schema('agent').from('negative_learning_case_usages')
    .upsert(rows, { onConflict: 'project_id,candidate_id,consumer_agent_run_id', ignoreDuplicates: true })
  if (error) throw new Error(`Unable to record negative learning case retrieval: ${error.message}`)
  return rows.length
}

export async function recordNegativeLearningCaseOutcome(input: {
  projectId: string
  candidateId: string
  consumerAgentRunId: string
  status: 'APPLIED' | 'SUCCEEDED' | 'FAILED' | 'DISMISSED'
  outcome?: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').from('negative_learning_case_usages')
    .update({
      usage_status: input.status,
      outcome: input.outcome ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq('project_id', input.projectId)
    .eq('candidate_id', input.candidateId)
    .eq('consumer_agent_run_id', input.consumerAgentRunId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Unable to record negative learning case outcome: ${error.message}`)
  if (!data) throw new Error('negative learning case usage was not found for outcome recording')
  return String(data.id)
}


export async function reconcileNegativeLearningCaseUsagesFromGovernedOutcome(input: {
  projectId: string
  consumerAgentRunId: string
  governedOutcomeId: string
  verificationState: 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE'
  outcomeType: 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIAL' | 'ROLLED_BACK' | 'REJECTED' | 'POLICY_BLOCKED' | 'FAILED' | 'UNKNOWN'
  effectiveness?: number | null
}) {
  if (input.verificationState !== 'VERIFIED') return 0

  const admin = createAdminClient()
  const { data: usages, error } = await admin.schema('agent')
    .from('negative_learning_case_usages')
    .select('candidate_id,outcome')
    .eq('project_id', input.projectId)
    .eq('consumer_agent_run_id', input.consumerAgentRunId)
    .eq('usage_status', 'APPLIED')

  if (error) throw new Error(`Unable to resolve applied negative-case usages: ${error.message}`)
  if (!usages?.length) return 0

  const terminalStatus =
    input.outcomeType === 'EFFECTIVE'
      ? 'SUCCEEDED' as const
      : ['INEFFECTIVE', 'ROLLED_BACK', 'REJECTED', 'POLICY_BLOCKED', 'FAILED'].includes(input.outcomeType)
        ? 'FAILED' as const
        : 'APPLIED' as const

  for (const usage of usages) {
    await recordNegativeLearningCaseOutcome({
      projectId: input.projectId,
      candidateId: String(usage.candidate_id),
      consumerAgentRunId: input.consumerAgentRunId,
      status: terminalStatus,
      outcome: {
        ...((usage.outcome && typeof usage.outcome === 'object' && !Array.isArray(usage.outcome))
          ? usage.outcome as Record<string, unknown>
          : {}),
        governed_outcome_id: input.governedOutcomeId,
        verification_state: input.verificationState,
        outcome_type: input.outcomeType,
        effectiveness: input.effectiveness ?? null,
        terminal_attribution: 'AUTHORITATIVE_GOVERNED_OUTCOME',
      },
    })
  }

  return usages.length
}
