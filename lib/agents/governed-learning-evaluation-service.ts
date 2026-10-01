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

/** created_at can tie within one transaction. UUID ordering is not chronology.
 * Refuse ambiguous admission instead of picking a possibly stale positive row. */
function latestUnambiguousRow<T extends { created_at: string }>(rows: T[] | null, label: string): T | null {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const first = Date.parse(rows[0].created_at)
  if (!Number.isFinite(first)) throw new Error(`${label} has invalid creation time.`)
  if (rows.length > 1) {
    const second = Date.parse(rows[1].created_at)
    if (!Number.isFinite(second) || first <= second) throw new Error(`${label} chronology is ambiguous; release review is blocked.`)
  }
  return rows[0]
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
    p_dataset_manifest_id: policy.datasetManifestId,
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

  const { data: policyRows, error: policyError } = await admin.schema('agent')
    .from('learning_evaluation_policies')
    .select('id,created_at,policy_key,project_id,candidate_id,dataset_manifest_id,agent_key,skill_key,mode,dataset_version_ids,baseline_version,candidate_version,rollback_ref,evaluator_actor_id,proposer_actor_id,rubric_ref,calibration_ref,manifest_hash,locked_at,primary_metric,analysis_plan_ref,sample_size,minimum_gain,minimum_score,total_cost_budget,per_run_cost_budget,total_token_budget,per_run_token_budget,latency_ms_budget')
    .eq('project_id', input.projectId)
    .eq('candidate_id', input.candidateId)
    .order('created_at', { ascending: false })
    .limit(2)
  if (policyError) throw new Error(`Unable to load latest learning evaluation policy: ${policyError.message}`)
  const persistedPolicy = latestUnambiguousRow(policyRows, 'Evaluation policy')
  if (!persistedPolicy) throw new Error('A locked prospective evaluation policy is required before release review.')

  const { data: rows, error } = await admin.schema('agent')
    .from('learning_evaluation_results')
    .select('id,created_at,policy_id,candidate_id,observed_at,sample_count,baseline_score,candidate_score,gain_lower_confidence_bound,independently_verified,evidence_complete,confirmation_window_passed,authority_violations,safety_failures,accounting_complete,total_cost,max_run_cost,total_tokens,max_run_tokens,max_latency_ms,disposition,quality,reasons,automatic_promotion_allowed')
    .eq('project_id', input.projectId)
    .eq('candidate_id', input.candidateId)
    .eq('policy_id', persistedPolicy.id)
    .order('created_at', { ascending: false })
    .limit(2)
  if (error) throw new Error(`Unable to load latest learning evaluation decision: ${error.message}`)
  const row = latestUnambiguousRow(rows, 'Evaluation decision')
  if (!row) throw new Error('The latest prospective evaluation policy has no recorded decision.')
  if (String(row.disposition) !== 'REVIEW_REQUIRED' || String(row.quality) !== 'IMPROVED' || row.automatic_promotion_allowed !== false) {
    throw new Error('The latest prospective evaluation decision is not eligible for release review.')
  }

  const { data: bindingRows, error: bindingError } = await admin.schema('agent')
    .from('learning_experiment_decision_bindings')
    .select('id,run_id,evaluation_result_id,analysis_evidence_ref,created_at,learning_experiment_runs!inner(id,evidence_class,policy_id,candidate_id)')
    .eq('project_id', input.projectId)
    .eq('evaluation_result_id', row.id)
    .limit(2)
  if (bindingError) throw new Error(`Unable to load canonical experiment decision binding: ${bindingError.message}`)
  if (!Array.isArray(bindingRows) || bindingRows.length !== 1) {
    throw new Error('Release review requires exactly one canonical prospective experiment binding.')
  }
  const binding = bindingRows[0] as any
  const boundRun = Array.isArray(binding.learning_experiment_runs)
    ? binding.learning_experiment_runs[0]
    : binding.learning_experiment_runs
  if (!boundRun || boundRun.evidence_class !== 'PROSPECTIVE_LIVE'
    || String(boundRun.policy_id) !== String(persistedPolicy.id)
    || String(boundRun.candidate_id) !== input.candidateId
    || !String(binding.analysis_evidence_ref ?? '').trim()) {
    throw new Error('Release review experiment binding is invalid or synthetic.')
  }

  const policy: LearningEvaluationPolicy = {
    policyId: String(persistedPolicy.policy_key),
    projectId: String(persistedPolicy.project_id),
    candidateId: String(persistedPolicy.candidate_id),
    agentKey: persistedPolicy.agent_key,
    skillKey: persistedPolicy.skill_key,
    mode: persistedPolicy.mode,
    datasetVersionIds: [...persistedPolicy.dataset_version_ids],
    datasetManifestId: String(persistedPolicy.dataset_manifest_id),
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
    datasetManifestId: policy.datasetManifestId,
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
    evaluationPolicyRecordId: String(persistedPolicy.id),
    policy,
    result,
    decision,
  }
}
