import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export type GovernedOutcomeVerificationState = 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE'
export type GovernedOutcomeType = 'EFFECTIVE' | 'INEFFECTIVE' | 'PARTIAL' | 'ROLLED_BACK' | 'REJECTED' | 'POLICY_BLOCKED' | 'FAILED' | 'UNKNOWN'

export type RecordGovernedActionOutcomeInput = {
  projectId: string
  autonomyActionId: string
  verificationKey: string
  recommendationType: string
  recommendationVersion: string
  recommendation: Record<string, unknown>
  evidenceContext?: Record<string, unknown>
  beforeEvidence?: Record<string, unknown>
  afterEvidence?: Record<string, unknown>
  verificationState: GovernedOutcomeVerificationState
  outcomeType: GovernedOutcomeType
  effectiveness?: number | null
  verificationAgentRunId?: string | null
  actorUserId?: string | null
  decisionReason?: string | null
  runtimeEvidence?: Record<string, unknown>
}

function clampEffectiveness(value: number | null | undefined) {
  if (value == null) return null
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('effectiveness must be between 0 and 1')
  return value
}

/**
 * Records canonical outcome evidence for a governed autonomy action.
 * The database derives policy/approval/execution authority from the action row;
 * callers cannot promote memory by asserting those states themselves.
 */
export async function recordGovernedActionOutcome(input: RecordGovernedActionOutcomeInput) {
  const admin = createAdminClient()
  const { data: outcomeId, error } = await admin.schema('governance').rpc('record_governed_action_outcome', {
    p_project_id: input.projectId,
    p_autonomy_action_id: input.autonomyActionId,
    p_verification_key: input.verificationKey.trim(),
    p_recommendation_type: input.recommendationType.trim(),
    p_recommendation_version: input.recommendationVersion.trim(),
    p_recommendation: input.recommendation,
    p_evidence_context: input.evidenceContext ?? {},
    p_before_evidence: input.beforeEvidence ?? {},
    p_after_evidence: input.afterEvidence ?? {},
    p_verification_state: input.verificationState,
    p_outcome_type: input.outcomeType,
    p_effectiveness: clampEffectiveness(input.effectiveness),
    p_verification_agent_run_id: input.verificationAgentRunId ?? null,
    p_actor_user_id: input.actorUserId ?? null,
    p_decision_reason: input.decisionReason ?? null,
    p_runtime_evidence: input.runtimeEvidence ?? {},
  })
  if (error || !outcomeId) throw new Error(`Unable to record governed action outcome: ${error?.message ?? 'no outcome id returned'}`)

  const { data: outcome, error: outcomeError } = await admin.schema('governance').from('governed_action_outcomes')
    .select('id,project_id,autonomy_action_id,source_agent_run_id,verification_agent_run_id,policy_id,policy_version_id,approval_workflow_instance_id,decision_state,execution_state,verification_state,outcome_type,effectiveness,verified_at')
    .eq('id', String(outcomeId))
    .eq('project_id', input.projectId)
    .single()
  if (outcomeError || !outcome) throw new Error(`Unable to reload governed action outcome: ${outcomeError?.message ?? 'not found'}`)

  if (outcome.source_agent_run_id) {
    const verified = outcome.verification_state === 'VERIFIED'
    const score = verified && outcome.effectiveness != null ? Number(outcome.effectiveness) : null
    const { error: evaluationError } = await admin.schema('agent').from('agent_evaluations').upsert({
      project_id: input.projectId,
      agent_run_id: outcome.source_agent_run_id,
      evaluator_type: 'GOVERNED_OUTCOME',
      evaluator_version: '1.0',
      score,
      dimensions: {
        policy_version_bound: 1,
        approval_authority_derived: 1,
        action_execution_terminal: 1,
        outcome_verified: verified ? 1 : 0,
        outcome_effectiveness: score,
      },
      feedback: {
        evaluation_kind: 'governed_action_outcome',
        governed_action_outcome_id: outcome.id,
        autonomy_action_id: outcome.autonomy_action_id,
        policy_id: outcome.policy_id,
        policy_version_id: outcome.policy_version_id,
        approval_workflow_instance_id: outcome.approval_workflow_instance_id,
        verification_agent_run_id: outcome.verification_agent_run_id,
        decision_state: outcome.decision_state,
        execution_state: outcome.execution_state,
        verification_state: outcome.verification_state,
        outcome_type: outcome.outcome_type,
      },
    }, { onConflict: 'agent_run_id,evaluator_type,evaluator_version' })
    if (evaluationError) throw new Error(`Unable to persist governed outcome evaluation: ${evaluationError.message}`)
  }

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'SYSTEM',
    eventType: 'GOVERNED_ACTION_OUTCOME_RECORDED',
    entityType: 'AUTONOMY_ACTION',
    entityId: input.autonomyActionId,
    correlationId: outcome.id,
    metadata: {
      governed_action_outcome_id: outcome.id,
      verification_state: outcome.verification_state,
      outcome_type: outcome.outcome_type,
      policy_version_id: outcome.policy_version_id,
      source_agent_run_id: outcome.source_agent_run_id,
      verification_agent_run_id: outcome.verification_agent_run_id,
    },
  })

  return outcome
}

/**
 * Promotes only database-verified, policy-valid action outcomes into canonical
 * episodic learning. The promoted case is context only; every future action
 * must independently pass current authorization and policy evaluation.
 */
export async function promoteVerifiedGovernedActionOutcome(input: {
  projectId: string
  outcomeId: string
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const { data: outcome, error: outcomeError } = await admin.schema('governance').from('governed_action_outcomes')
    .select('id,project_id,autonomy_action_id,verification_state,policy_version_id,source_agent_run_id')
    .eq('id', input.outcomeId)
    .eq('project_id', input.projectId)
    .single()
  if (outcomeError || !outcome) throw new Error(`Unable to resolve governed outcome for learning promotion: ${outcomeError?.message ?? 'not found'}`)
  if (outcome.verification_state !== 'VERIFIED') throw new Error('Only verified governed outcomes may be promoted to learning.')
  if (!outcome.source_agent_run_id) throw new Error('Learning promotion requires source agent provenance.')

  const { data: caseId, error } = await admin.schema('governance').rpc('promote_verified_governed_action_outcome', {
    p_outcome_id: input.outcomeId,
  })
  if (error || !caseId) throw new Error(`Unable to promote verified governed outcome: ${error?.message ?? 'no case id returned'}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'SYSTEM',
    eventType: 'VERIFIED_GOVERNED_OUTCOME_PROMOTED_TO_LEARNING',
    entityType: 'AUTONOMY_ACTION',
    entityId: outcome.autonomy_action_id,
    correlationId: input.outcomeId,
    metadata: {
      governed_action_outcome_id: input.outcomeId,
      learning_case_id: String(caseId),
      policy_version_id: outcome.policy_version_id,
      future_action_reauthorization_required: true,
      memory_is_not_governance_authority: true,
    },
  })

  return { outcomeId: input.outcomeId, learningCaseId: String(caseId) }
}
