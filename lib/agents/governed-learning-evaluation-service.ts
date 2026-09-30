import { createAdminClient } from '@/lib/supabase/admin'
import {
  assertLearningEvaluationEligibleForReleaseReview,
  classifyLearningEvaluation,
  validateLearningEvaluationPolicy,
  type LearningEvaluationPolicy,
  type LearningEvaluationResult,
} from './learning-evaluation-policy'

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export async function registerLearningEvaluationPolicy(policy: LearningEvaluationPolicy) {
  validateLearningEvaluationPolicy(policy)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('record_learning_evaluation_policy', {
    p_project_id: policy.projectId,
    p_candidate_id: policy.candidateId,
    p_policy_key: policy.policyId,
    p_agent_key: policy.agentKey,
    p_skill_key: policy.skillKey,
    p_mode: policy.mode,
    p_dataset_version_ids: policy.datasetVersionIds,
    p_baseline_version: policy.baselineVersion,
    p_candidate_version: policy.candidateVersion,
    p_rollback_ref: policy.rollbackRef,
    p_evaluator_actor_id: policy.evaluatorActorId,
    p_proposer_actor_id: policy.proposerActorId,
    p_rubric_ref: policy.rubricRef,
    p_calibration_ref: policy.calibrationRef,
    p_manifest_hash: policy.manifestHash,
    p_locked_at: policy.lockedAt,
    p_primary_metric: policy.primaryMetric,
    p_analysis_plan_ref: policy.analysisPlanRef,
    p_sample_size: policy.sampleSize,
    p_minimum_gain: policy.minimumGain,
    p_minimum_score: policy.minimumScore,
    p_total_cost_budget: policy.budget.totalCost,
    p_per_run_cost_budget: policy.budget.perRunCost,
    p_total_token_budget: policy.budget.totalTokens,
    p_per_run_token_budget: policy.budget.perRunTokens,
    p_latency_ms_budget: policy.budget.latencyMs,
  })
  if (error || !data) throw new Error(`Unable to persist learning evaluation policy: ${error?.message ?? 'no policy id returned'}`)
  return String(data)
}

export async function recordLearningEvaluationDecision(input: {
  policy: LearningEvaluationPolicy
  policyRecordId: string
  result: LearningEvaluationResult
  recordedBy: string
}) {
  validateLearningEvaluationPolicy(input.policy)
  const decision = classifyLearningEvaluation(input.policy, input.result)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('record_learning_evaluation_result', {
    p_project_id: input.policy.projectId,
    p_policy_id: requiredText(input.policyRecordId, 'policyRecordId'),
    p_candidate_id: input.policy.candidateId,
    p_observed_at: input.result.observedAt,
    p_sample_count: input.result.sampleCount,
    p_baseline_score: input.result.baselineScore,
    p_candidate_score: input.result.candidateScore,
    p_gain_lower_confidence_bound: input.result.gainLowerConfidenceBound,
    p_independently_verified: input.result.independentlyVerified,
    p_evidence_complete: input.result.evidenceComplete,
    p_confirmation_window_passed: input.result.confirmationWindowPassed,
    p_authority_violations: input.result.authorityViolations,
    p_safety_failures: input.result.safetyFailures,
    p_accounting_complete: input.result.accountingComplete,
    p_total_cost: input.result.totalCost,
    p_max_run_cost: input.result.maxRunCost,
    p_total_tokens: input.result.totalTokens,
    p_max_run_tokens: input.result.maxRunTokens,
    p_max_latency_ms: input.result.maxLatencyMs,
    p_disposition: decision.disposition,
    p_quality: decision.quality,
    p_reasons: decision.reasons,
    p_recorded_by: requiredText(input.recordedBy, 'recordedBy'),
  })
  if (error || !data) throw new Error(`Unable to persist learning evaluation result: ${error?.message ?? 'no result id returned'}`)
  return { resultId: String(data), decision }
}

export async function loadLearningReleaseAdmission(input: {
  projectId: string
  candidateId: string
}) {
  const admin = createAdminClient()
  const { data: rows, error } = await admin.schema('agent')
    .from('learning_evaluation_results')
    .select('id,policy_id,candidate_id,observed_at,sample_count,baseline_score,candidate_score,gain_lower_confidence_bound,independently_verified,evidence_complete,confirmation_window_passed,authority_violations,safety_failures,accounting_complete,total_cost,max_run_cost,total_tokens,max_run_tokens,max_latency_ms,disposition,quality,reasons,automatic_promotion_allowed,learning_evaluation_policies!inner(policy_key,project_id,candidate_id,agent_key,skill_key,mode,dataset_version_ids,baseline_version,candidate_version,rollback_ref,evaluator_actor_id,proposer_actor_id,rubric_ref,calibration_ref,manifest_hash,locked_at,primary_metric,analysis_plan_ref,sample_size,minimum_gain,minimum_score,total_cost_budget,per_run_cost_budget,total_token_budget,per_run_token_budget,latency_ms_budget)')
    .eq('project_id', input.projectId)
    .eq('candidate_id', input.candidateId)
    .eq('disposition', 'REVIEW_REQUIRED')
    .eq('quality', 'IMPROVED')
    .eq('automatic_promotion_allowed', false)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`Unable to load learning release admission evidence: ${error.message}`)
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) throw new Error('A persisted IMPROVED prospective evaluation is required before release review.')

  const persistedPolicy = Array.isArray((row as any).learning_evaluation_policies)
    ? (row as any).learning_evaluation_policies[0]
    : (row as any).learning_evaluation_policies
  if (!persistedPolicy) throw new Error('Learning evaluation policy binding is missing.')

  const policy: LearningEvaluationPolicy = {
    policyId: String(persistedPolicy.policy_key),
    projectId: String(persistedPolicy.project_id),
    candidateId: String(persistedPolicy.candidate_id),
    agentKey: persistedPolicy.agent_key,
    skillKey: persistedPolicy.skill_key,
    mode: persistedPolicy.mode,
    datasetVersionIds: [...persistedPolicy.dataset_version_ids],
    baselineVersion: String(persistedPolicy.baseline_version),
    candidateVersion: String(persistedPolicy.candidate_version),
    rollbackRef: String(persistedPolicy.rollback_ref),
    evaluatorActorId: String(persistedPolicy.evaluator_actor_id),
    proposerActorId: String(persistedPolicy.proposer_actor_id),
    rubricRef: String(persistedPolicy.rubric_ref),
    calibrationRef: String(persistedPolicy.calibration_ref),
    manifestHash: String(persistedPolicy.manifest_hash),
    lockedAt: String(persistedPolicy.locked_at),
    primaryMetric: String(persistedPolicy.primary_metric),
    analysisPlanRef: String(persistedPolicy.analysis_plan_ref),
    sampleSize: Number(persistedPolicy.sample_size),
    minimumGain: Number(persistedPolicy.minimum_gain),
    minimumScore: Number(persistedPolicy.minimum_score),
    budget: {
      totalCost: Number(persistedPolicy.total_cost_budget),
      perRunCost: Number(persistedPolicy.per_run_cost_budget),
      totalTokens: Number(persistedPolicy.total_token_budget),
      perRunTokens: Number(persistedPolicy.per_run_token_budget),
      latencyMs: Number(persistedPolicy.latency_ms_budget),
    },
  }
  const result: LearningEvaluationResult = {
    policyId: policy.policyId,
    projectId: policy.projectId,
    candidateId: policy.candidateId,
    baselineVersion: policy.baselineVersion,
    candidateVersion: policy.candidateVersion,
    mode: policy.mode,
    manifestHash: policy.manifestHash,
    evaluatorActorId: policy.evaluatorActorId,
    observedAt: String(row.observed_at),
    sampleCount: Number(row.sample_count),
    baselineScore: row.baseline_score == null ? null : Number(row.baseline_score),
    candidateScore: row.candidate_score == null ? null : Number(row.candidate_score),
    gainLowerConfidenceBound: row.gain_lower_confidence_bound == null ? null : Number(row.gain_lower_confidence_bound),
    independentlyVerified: row.independently_verified === true,
    evidenceComplete: row.evidence_complete === true,
    confirmationWindowPassed: row.confirmation_window_passed === true,
    authorityViolations: Number(row.authority_violations),
    safetyFailures: Number(row.safety_failures),
    accountingComplete: row.accounting_complete === true,
    totalCost: Number(row.total_cost),
    maxRunCost: Number(row.max_run_cost),
    totalTokens: Number(row.total_tokens),
    maxRunTokens: Number(row.max_run_tokens),
    maxLatencyMs: Number(row.max_latency_ms),
  }
  const decision = assertLearningEvaluationEligibleForReleaseReview(policy, result)
  if (String(row.disposition) !== decision.disposition || String(row.quality) !== decision.quality) {
    throw new Error('Persisted learning evaluation decision no longer matches the locked policy.')
  }
  return {
    evaluationResultId: String(row.id),
    evaluationPolicyRecordId: String(row.policy_id),
    policy,
    result,
    decision,
  }
}
