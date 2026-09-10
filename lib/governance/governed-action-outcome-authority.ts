import { createAdminClient } from '@/lib/supabase/admin'
import { verifyGovernedActionOutcome } from '@/lib/governance/governed-action-outcomes'
import {
  promoteVerifiedGovernedActionOutcome,
  recordGovernedActionOutcome,
} from '@/lib/governance/governed-outcome-learning'

type JsonRecord = Record<string, any>

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function effectivenessOutcome(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'UNKNOWN' as const
  if (parsed >= 0.999999) return 'EFFECTIVE' as const
  if (parsed <= 0.000001) return 'INEFFECTIVE' as const
  return 'PARTIAL' as const
}

/**
 * Operational verification may move through PENDING/UNKNOWN/FAILED/VERIFIED.
 * Only terminal VERIFIED/FAILED state is snapshotted into the immutable
 * governance.governed_action_outcomes authority. Reusable learning is then
 * promoted through that immutable authority, never directly from mutable state.
 */
export async function verifyAndCanonicalizeGovernedActionOutcome(input: {
  projectId: string
  actionId: string
  actorUserId?: string | null
}) {
  const operational = await verifyGovernedActionOutcome(input)
  const outcome = record(operational.outcome)
  const action = record(operational.action)
  const status = text(outcome.verification_status).toUpperCase()

  if (!['VERIFIED', 'FAILED'].includes(status)) {
    return {
      ...operational,
      canonicalOutcome: null,
      canonicalLearningCase: null,
      learningAuthority: 'IMMUTABLE_GOVERNED_OUTCOME_REQUIRED',
    }
  }

  const actionInput = record(action.input)
  const beforeState = record(outcome.before_state)
  const afterState = record(outcome.after_state)
  const verificationEvidence = record(outcome.verification_evidence)
  const effectiveBefore = Object.keys(beforeState).length
    ? beforeState
    : {
        state: 'NO_PRIOR_STATE_REQUIRED_FOR_ACTION_OBJECTIVE',
        action_key: action.action_key ?? null,
        target_type: action.target_type ?? null,
        target_id: action.target_id ?? null,
      }

  const verified = status === 'VERIFIED'
  const canonicalOutcome = await recordGovernedActionOutcome({
    projectId: input.projectId,
    autonomyActionId: input.actionId,
    verificationKey: `operational:${outcome.id}`,
    recommendationType: text(action.action_key) || 'GOVERNED_ACTION',
    recommendationVersion: text(actionInput.recommendationVersion ?? actionInput.recommendation_version) || 'governed-action-v1',
    recommendation: record(actionInput.recommendation ?? actionInput),
    evidenceContext: verificationEvidence,
    beforeEvidence: verified ? effectiveBefore : beforeState,
    afterEvidence: afterState,
    verificationState: verified ? 'VERIFIED' : 'FAILED',
    outcomeType: verified ? effectivenessOutcome(outcome.effectiveness) : 'FAILED',
    effectiveness: verified ? Number(outcome.effectiveness) : null,
    actorUserId: input.actorUserId ?? null,
    decisionReason: text(outcome.failure_detail) || null,
    runtimeEvidence: {
      operational_outcome_id: outcome.id,
      operational_verifier_type: outcome.verifier_type ?? null,
      profile_run_id: outcome.profile_run_id ?? null,
      issue_id: outcome.issue_id ?? null,
      failure_code: outcome.failure_code ?? null,
    },
  })

  let canonicalLearningCase: { outcomeId: string; learningCaseId: string } | null = null
  if (verified && canonicalOutcome.source_agent_run_id) {
    canonicalLearningCase = await promoteVerifiedGovernedActionOutcome({
      projectId: input.projectId,
      outcomeId: canonicalOutcome.id,
      actorUserId: input.actorUserId ?? null,
    })
  }

  const admin = createAdminClient()
  const { error: linkError } = await admin.schema('governance').from('autonomy_action_outcomes').update({
    canonical_outcome_id: canonicalOutcome.id,
    learning_case_id: canonicalLearningCase?.learningCaseId ?? outcome.learning_case_id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', outcome.id).eq('project_id', input.projectId)
  if (linkError) throw new Error(`Unable to bind operational outcome to immutable authority: ${linkError.message}`)

  return {
    ...operational,
    canonicalOutcome,
    canonicalLearningCase,
    learningAuthority: 'governance.governed_action_outcomes',
  }
}
