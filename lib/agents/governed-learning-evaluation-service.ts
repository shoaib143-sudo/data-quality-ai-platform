import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProject } from '@/lib/auth/authorize'
import {
  assertAuthenticatedLearningEvaluator,
  assertLearningEvaluatorAssignment,
} from './learning-evaluation-authorization'
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

function learningPolicyFromRow(row: any): LearningEvaluationPolicy {
  return {
    policyId: String(row.policy_key),
    projectId: String(row.project_id),
    candidateId: String(row.candidate_id),
    agentKey: row.agent_key,
    skillKey: row.skill_key,
    mode: row.mode,
    datasetVersionIds: [...row.dataset_version_ids],
    datasetManifestId: String(row.dataset_manifest_id),
    baselineVersion: String(row.baseline_version),
    candidateVersion: String(row.candidate_version),
    rollbackRef: String(row.rollback_ref),
    evaluatorActorId: String(row.evaluator_actor_id),
    proposerActorId: String(row.proposer_actor_id),
    rubricRef: String(row.rubric_ref),
    calibrationRef: String(row.calibration_ref),
    manifestHash: String(row.manifest_hash),
    lockedAt: String(row.locked_at),
    primaryMetric: String(row.primary_metric),
    analysisPlanRef: String(row.analysis_plan_ref),
    sampleSize: Number(row.sample_size),
    minimumGain: Number(row.minimum_gain),
    minimumScore: Number(row.minimum_score),
    budget: {
      totalCost: Number(row.total_cost_budget),
      perRunCost: Number(row.per_run_cost_budget),
      totalTokens: Number(row.total_token_budget),
      perRunTokens: Number(row.per_run_token_budget),
      latencyMs: Number(row.latency_ms_budget),
    },
  }
}

const learningEvaluationPolicyColumns = 'id,created_at,policy_key,project_id,candidate_id,dataset_manifest_id,agent_key,skill_key,mode,dataset_version_ids,baseline_version,candidate_version,rollback_ref,evaluator_actor_id,proposer_actor_id,rubric_ref,calibration_ref,manifest_hash,locked_at,primary_metric,analysis_plan_ref,sample_size,minimum_gain,minimum_score,total_cost_budget,per_run_cost_budget,total_token_budget,per_run_token_budget,latency_ms_budget'

export async function registerLearningEvaluationPolicy(input: Omit<LearningEvaluationPolicy, 'proposerActorId'>) {
  const { requireApiUser } = await import('@/lib/auth/require-api-user')
  const proposer = await requireApiUser()
  const assignment = assertLearningEvaluatorAssignment({
    proposerUserId: proposer.id,
    evaluatorUserId: input.evaluatorActorId,
  })
  const policy: LearningEvaluationPolicy = {
    ...input,
    proposerActorId: assignment.proposerUserId,
    evaluatorActorId: assignment.evaluatorUserId,
  }
  validateLearningEvaluationPolicy(policy)
  // Evaluator assignment is an administrative governance action. The proposer
  // must be an agent admin, and the target evaluator must independently hold
  // the narrower evaluation capability in this same project.
  await authorizeProject(assignment.proposerUserId, policy.projectId, 'agent.admin')
  const admin = createAdminClient()
  const { data: evaluatorUser, error: evaluatorLookupError } = await admin.auth.admin.getUserById(assignment.evaluatorUserId)
  if (evaluatorLookupError || !evaluatorUser?.user?.id) {
    throw new Error(`Unable to resolve evaluator account: ${evaluatorLookupError?.message ?? 'user not found'}`)
  }
  await authorizeProject(assignment.evaluatorUserId, policy.projectId, 'agent.learning.evaluate')
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
  const policyRecordId = String(data)
  const { data: assignmentId, error: assignmentError } = await admin.schema('agent').rpc('record_learning_evaluation_assignment', {
    p_policy_id: policyRecordId,
    p_project_id: policy.projectId,
    p_candidate_id: policy.candidateId,
    p_proposer_user_id: assignment.proposerUserId,
    p_evaluator_user_id: assignment.evaluatorUserId,
    p_assigned_by_user_id: assignment.proposerUserId,
  })
  if (assignmentError || !assignmentId) {
    throw new Error(`Unable to persist trusted evaluator assignment: ${assignmentError?.message ?? 'no assignment id returned'}`)
  }
  return policyRecordId
}

async function requireAcknowledgedLearningEvaluatorAssignment(
  admin: ReturnType<typeof createAdminClient>,
  policyRecordId: string,
  policy: LearningEvaluationPolicy,
) {
  const { data: assignment, error: assignmentError } = await admin.schema('agent')
    .from('learning_evaluation_assignments')
    .select('id,project_id,policy_id,candidate_id,proposer_user_id,evaluator_user_id,assigned_by_user_id,scope_digest')
    .eq('policy_id', policyRecordId)
    .eq('project_id', policy.projectId)
    .eq('candidate_id', policy.candidateId)
    .maybeSingle()
  if (assignmentError) throw new Error(`Unable to load trusted evaluator assignment: ${assignmentError.message}`)
  if (!assignment || assignment.policy_id !== policyRecordId || assignment.project_id !== policy.projectId
    || assignment.candidate_id !== policy.candidateId
    || String(assignment.proposer_user_id).toLowerCase() !== policy.proposerActorId.toLowerCase()
    || String(assignment.evaluator_user_id).toLowerCase() !== policy.evaluatorActorId.toLowerCase()
    || String(assignment.assigned_by_user_id).toLowerCase() !== policy.proposerActorId.toLowerCase()
    || !/^sha256:[0-9a-f]{64}$/.test(String(assignment.scope_digest))) {
    throw new Error('A matching immutable evaluator assignment is required.')
  }

  const { data: acknowledgement, error: acknowledgementError } = await admin.schema('agent')
    .from('learning_evaluation_assignment_acknowledgements')
    .select('id,assignment_id,policy_id,project_id,candidate_id,evaluator_user_id,scope_digest,acknowledged_by_user_id')
    .eq('policy_id', policyRecordId)
    .eq('assignment_id', assignment.id)
    .eq('project_id', policy.projectId)
    .maybeSingle()
  if (acknowledgementError) throw new Error(`Unable to load evaluator assignment acknowledgement: ${acknowledgementError.message}`)
  if (!acknowledgement || acknowledgement.policy_id !== policyRecordId
    || acknowledgement.assignment_id !== assignment.id
    || acknowledgement.project_id !== policy.projectId
    || acknowledgement.candidate_id !== policy.candidateId
    || String(acknowledgement.evaluator_user_id).toLowerCase() !== policy.evaluatorActorId.toLowerCase()
    || String(acknowledgement.acknowledged_by_user_id).toLowerCase() !== policy.evaluatorActorId.toLowerCase()
    || acknowledgement.scope_digest !== assignment.scope_digest) {
    throw new Error('A matching evaluator acknowledgement is required before learning evaluation.')
  }
  return { assignment, acknowledgement }
}

/** The assigned evaluator must explicitly acknowledge the exact locked policy. */
export async function acknowledgeLearningEvaluationPolicyAssignment(policyRecordId: string) {
  const { requireApiUser } = await import('@/lib/auth/require-api-user')
  const authenticatedUser = await requireApiUser()
  const admin = createAdminClient()
  const normalizedPolicyId = requiredText(policyRecordId, 'policyRecordId')
  const { data: persistedPolicy, error } = await admin.schema('agent')
    .from('learning_evaluation_policies')
    .select(learningEvaluationPolicyColumns)
    .eq('id', normalizedPolicyId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load locked learning evaluation policy: ${error.message}`)
  if (!persistedPolicy) throw new Error('A persisted locked learning evaluation policy is required before acknowledgement.')
  const policy = learningPolicyFromRow(persistedPolicy)
  const evaluatorUserId = assertAuthenticatedLearningEvaluator({
    authenticatedUserId: authenticatedUser.id,
    policyEvaluatorActorId: policy.evaluatorActorId,
    resultEvaluatorActorId: policy.evaluatorActorId,
  })
  await authorizeProject(evaluatorUserId, policy.projectId, 'agent.learning.evaluate')
  const { data, error: acknowledgementError } = await admin.schema('agent').rpc('record_learning_evaluation_assignment_acknowledgement', {
    p_policy_id: normalizedPolicyId,
    p_project_id: policy.projectId,
    p_evaluator_user_id: evaluatorUserId,
  })
  if (acknowledgementError || !data) {
    throw new Error(`Unable to record evaluator assignment acknowledgement: ${acknowledgementError?.message ?? 'no acknowledgement id returned'}`)
  }
  return String(data)
}

export async function recordLearningEvaluationDecision(input: {
  policyRecordId: string
  result: LearningEvaluationResult
}) {
  const { requireApiUser } = await import('@/lib/auth/require-api-user')
  const authenticatedUser = await requireApiUser()
  const admin = createAdminClient()
  const policyRecordId = requiredText(input.policyRecordId, 'policyRecordId')
  const { data: persistedPolicy, error: policyError } = await admin.schema('agent')
    .from('learning_evaluation_policies')
    .select(learningEvaluationPolicyColumns)
    .eq('id', policyRecordId)
    .maybeSingle()
  if (policyError) throw new Error(`Unable to load locked learning evaluation policy: ${policyError.message}`)
  if (!persistedPolicy) throw new Error('A persisted locked learning evaluation policy is required before recording a result.')
  const policy = learningPolicyFromRow(persistedPolicy)
  validateLearningEvaluationPolicy(policy)
  assertAuthenticatedLearningEvaluator({
    authenticatedUserId: authenticatedUser.id,
    policyEvaluatorActorId: policy.evaluatorActorId,
    resultEvaluatorActorId: input.result.evaluatorActorId,
  })
  await authorizeProject(authenticatedUser.id, policy.projectId, 'agent.learning.evaluate')
  await requireAcknowledgedLearningEvaluatorAssignment(admin, policyRecordId, policy)
  const decision = classifyLearningEvaluation(policy, input.result)
  const { data, error } = await admin.schema('agent').rpc('record_learning_evaluation_result', {
    p_project_id: policy.projectId,
    p_policy_id: policyRecordId,
    p_candidate_id: policy.candidateId,
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
    p_recorded_by: authenticatedUser.id,
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
  const policy = learningPolicyFromRow(persistedPolicy)
  validateLearningEvaluationPolicy(policy)
  await requireAcknowledgedLearningEvaluatorAssignment(admin, String(persistedPolicy.id), policy)

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
