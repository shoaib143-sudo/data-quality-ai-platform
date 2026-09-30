import { authorizeProject } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

export type LearningEvaluationPolicySummary = {
  id: string
  candidateId: string
  policyKey: string
  agentKey: string
  skillKey: string
  mode: string
  manifestHash: string
  evaluatorActorId: string
  lockedAt: string
  sampleSize: number
  minimumGain: number
  minimumScore: number
  totalCostBudget: number
  perRunCostBudget: number
  totalTokenBudget: number
  perRunTokenBudget: number
  latencyMsBudget: number
}

export type LearningEvaluationDecisionSummary = {
  id: string
  policyId: string
  candidateId: string
  observedAt: string
  sampleCount: number
  baselineScore: number | null
  candidateScore: number | null
  gainLowerConfidenceBound: number | null
  independentlyVerified: boolean
  evidenceComplete: boolean
  confirmationWindowPassed: boolean
  authorityViolations: number
  safetyFailures: number
  accountingComplete: boolean
  totalCost: number
  maxRunCost: number
  totalTokens: number
  maxRunTokens: number
  maxLatencyMs: number
  disposition: string
  quality: string
  reasons: string[]
  automaticPromotionAllowed: false
}

export type LearningEvaluationCommandCenterState = {
  policies: LearningEvaluationPolicySummary[]
  decisions: LearningEvaluationDecisionSummary[]
  counts: {
    policies: number
    decisions: number
    improved: number
    regressed: number
    inconclusive: number
    stopped: number
    rejected: number
  }
  authority: {
    readOnly: true
    automaticPromotionAllowed: false
    humanReleaseReviewRequired: true
  }
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function optionalNumber(value: unknown) {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

/**
 * Read-only projection of locked prospective evaluation policies and decisions.
 * This surface never creates policy, records evidence, requests approval, promotes,
 * activates, or rolls back a learning candidate.
 */
export async function readLearningEvaluationCommandCenterState(
  projectId: string,
  actorUserId: string,
): Promise<LearningEvaluationCommandCenterState> {
  await authorizeProject(actorUserId, projectId, 'admin.manage')
  const admin = createAdminClient()

  const [policyResult, decisionResult] = await Promise.all([
    admin.schema('agent').from('learning_evaluation_policies')
      .select('id,candidate_id,policy_key,agent_key,skill_key,mode,manifest_hash,evaluator_actor_id,locked_at,sample_size,minimum_gain,minimum_score,total_cost_budget,per_run_cost_budget,total_token_budget,per_run_token_budget,latency_ms_budget')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.schema('agent').from('learning_evaluation_results')
      .select('id,policy_id,candidate_id,observed_at,sample_count,baseline_score,candidate_score,gain_lower_confidence_bound,independently_verified,evidence_complete,confirmation_window_passed,authority_violations,safety_failures,accounting_complete,total_cost,max_run_cost,total_tokens,max_run_tokens,max_latency_ms,disposition,quality,reasons,automatic_promotion_allowed')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (policyResult.error) throw new Error(`Unable to load learning evaluation policies: ${policyResult.error.message}`)
  if (decisionResult.error) throw new Error(`Unable to load learning evaluation decisions: ${decisionResult.error.message}`)

  const policies: LearningEvaluationPolicySummary[] = (policyResult.data ?? []).map((row) => ({
    id: String(row.id),
    candidateId: String(row.candidate_id),
    policyKey: String(row.policy_key),
    agentKey: String(row.agent_key),
    skillKey: String(row.skill_key),
    mode: String(row.mode),
    manifestHash: String(row.manifest_hash),
    evaluatorActorId: String(row.evaluator_actor_id),
    lockedAt: String(row.locked_at),
    sampleSize: finiteNumber(row.sample_size),
    minimumGain: finiteNumber(row.minimum_gain),
    minimumScore: finiteNumber(row.minimum_score),
    totalCostBudget: finiteNumber(row.total_cost_budget),
    perRunCostBudget: finiteNumber(row.per_run_cost_budget),
    totalTokenBudget: finiteNumber(row.total_token_budget),
    perRunTokenBudget: finiteNumber(row.per_run_token_budget),
    latencyMsBudget: finiteNumber(row.latency_ms_budget),
  }))

  const decisions: LearningEvaluationDecisionSummary[] = (decisionResult.data ?? []).map((row) => ({
    id: String(row.id),
    policyId: String(row.policy_id),
    candidateId: String(row.candidate_id),
    observedAt: String(row.observed_at),
    sampleCount: finiteNumber(row.sample_count),
    baselineScore: optionalNumber(row.baseline_score),
    candidateScore: optionalNumber(row.candidate_score),
    gainLowerConfidenceBound: optionalNumber(row.gain_lower_confidence_bound),
    independentlyVerified: row.independently_verified === true,
    evidenceComplete: row.evidence_complete === true,
    confirmationWindowPassed: row.confirmation_window_passed === true,
    authorityViolations: finiteNumber(row.authority_violations),
    safetyFailures: finiteNumber(row.safety_failures),
    accountingComplete: row.accounting_complete === true,
    totalCost: finiteNumber(row.total_cost),
    maxRunCost: finiteNumber(row.max_run_cost),
    totalTokens: finiteNumber(row.total_tokens),
    maxRunTokens: finiteNumber(row.max_run_tokens),
    maxLatencyMs: finiteNumber(row.max_latency_ms),
    disposition: String(row.disposition),
    quality: String(row.quality),
    reasons: textArray(row.reasons),
    automaticPromotionAllowed: false,
  }))

  return {
    policies,
    decisions,
    counts: {
      policies: policies.length,
      decisions: decisions.length,
      improved: decisions.filter((row) => row.quality === 'IMPROVED').length,
      regressed: decisions.filter((row) => row.quality === 'REGRESSED').length,
      inconclusive: decisions.filter((row) => row.quality === 'INCONCLUSIVE').length,
      stopped: decisions.filter((row) => row.disposition === 'STOPPED').length,
      rejected: decisions.filter((row) => row.disposition === 'REJECTED').length,
    },
    authority: {
      readOnly: true,
      automaticPromotionAllowed: false,
      humanReleaseReviewRequired: true,
    },
  }
}
