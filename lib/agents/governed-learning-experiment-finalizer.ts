import { createAdminClient } from '@/lib/supabase/admin'
import type { LearningEvaluationPolicy } from './learning-evaluation-policy'
import { recordLearningEvaluationDecision } from './governed-learning-evaluation-service'
import type { LearningExperimentSummary } from './governed-learning-experiment-runner'

export type LearningExperimentAnalysis = {
  observedAt: string
  gainLowerConfidenceBound: number | null
  confirmationWindowPassed: boolean
  analysisEvidenceRef: string
}

export interface LearningExperimentAnalysisProvider {
  analyze(input: {
    policy: LearningEvaluationPolicy
    summary: LearningExperimentSummary
  }): Promise<LearningExperimentAnalysis>
}

function required(value: unknown, label: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function toPolicy(row: Record<string, any>): LearningEvaluationPolicy {
  return {
    policyId: required(row.policy_key, 'policyKey'),
    projectId: required(row.project_id, 'projectId'),
    candidateId: required(row.candidate_id, 'candidateId'),
    agentKey: row.agent_key,
    skillKey: row.skill_key,
    mode: row.mode,
    datasetVersionIds: [...row.dataset_version_ids],
    datasetManifestId: required(row.dataset_manifest_id, 'datasetManifestId'),
    baselineVersion: required(row.baseline_version, 'baselineVersion'),
    candidateVersion: required(row.candidate_version, 'candidateVersion'),
    rollbackRef: required(row.rollback_ref, 'rollbackRef'),
    evaluatorActorId: required(row.evaluator_actor_id, 'evaluatorActorId'),
    proposerActorId: required(row.proposer_actor_id, 'proposerActorId'),
    rubricRef: required(row.rubric_ref, 'rubricRef'),
    calibrationRef: required(row.calibration_ref, 'calibrationRef'),
    manifestHash: required(row.manifest_hash, 'manifestHash'),
    lockedAt: required(row.locked_at, 'lockedAt'),
    primaryMetric: required(row.primary_metric, 'primaryMetric'),
    analysisPlanRef: required(row.analysis_plan_ref, 'analysisPlanRef'),
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

export async function finalizeGovernedLearningExperiment(input: {
  projectId: string
  policyRecordId: string
  candidateId: string
  summary: LearningExperimentSummary
  analysis: LearningExperimentAnalysisProvider
  recordedBy: string
}) {
  if (input.summary.evidenceClass !== 'PROSPECTIVE_LIVE') {
    throw new Error('Synthetic learning experiment evidence can never create a release-admission decision')
  }
  if (!input.summary.complete) throw new Error('Learning experiment is incomplete')
  if (!input.summary.allIndependentlyVerified) throw new Error('Every paired case must be independently verified')
  if (!input.summary.accountingComplete) throw new Error('Canonical experiment accounting is incomplete')
  if (input.summary.authorityViolations > 0 || input.summary.safetyFailures > 0) {
    throw new Error('Prohibited authority or safety evidence blocks positive finalization')
  }
  if (input.summary.baselineScore == null || input.summary.candidateScore == null) {
    throw new Error('Complete learning experiment requires paired quality scores')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent')
    .from('learning_evaluation_policies')
    .select('id,policy_key,project_id,candidate_id,dataset_manifest_id,agent_key,skill_key,mode,dataset_version_ids,baseline_version,candidate_version,rollback_ref,evaluator_actor_id,proposer_actor_id,rubric_ref,calibration_ref,manifest_hash,locked_at,primary_metric,analysis_plan_ref,sample_size,minimum_gain,minimum_score,total_cost_budget,per_run_cost_budget,total_token_budget,per_run_token_budget,latency_ms_budget')
    .eq('id', input.policyRecordId)
    .eq('project_id', input.projectId)
    .eq('candidate_id', input.candidateId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load locked evaluation policy for finalization: ${error.message}`)
  if (!data) throw new Error('Locked evaluation policy not found for experiment finalization')
  const policy = toPolicy(data as Record<string, any>)
  if (input.summary.caseCount !== policy.sampleSize || input.summary.scoredCaseCount !== policy.sampleSize) {
    throw new Error('Canonical experiment sample does not match locked policy sample size')
  }

  const analysis = await input.analysis.analyze({ policy, summary: input.summary })
  const analysisEvidenceRef = required(analysis.analysisEvidenceRef, 'analysisEvidenceRef')
  if (!Number.isFinite(Date.parse(analysis.observedAt)) || Date.parse(analysis.observedAt) < Date.parse(policy.lockedAt)) {
    throw new Error('Analysis evidence must be observed after the locked policy')
  }
  if (analysis.gainLowerConfidenceBound != null && !Number.isFinite(analysis.gainLowerConfidenceBound)) {
    throw new Error('Analysis confidence lower bound must be finite when provided')
  }

  const result = {
    policyId: policy.policyId,
    projectId: policy.projectId,
    candidateId: policy.candidateId,
    baselineVersion: policy.baselineVersion,
    candidateVersion: policy.candidateVersion,
    mode: policy.mode,
    datasetManifestId: policy.datasetManifestId,
    manifestHash: policy.manifestHash,
    evaluatorActorId: policy.evaluatorActorId,
    observedAt: analysis.observedAt,
    sampleCount: input.summary.scoredCaseCount,
    baselineScore: input.summary.baselineScore,
    candidateScore: input.summary.candidateScore,
    gainLowerConfidenceBound: analysis.gainLowerConfidenceBound,
    independentlyVerified: input.summary.allIndependentlyVerified,
    evidenceComplete: input.summary.complete,
    confirmationWindowPassed: analysis.confirmationWindowPassed,
    authorityViolations: input.summary.authorityViolations,
    safetyFailures: input.summary.safetyFailures,
    accountingComplete: input.summary.accountingComplete,
    totalCost: input.summary.totalCost,
    maxRunCost: input.summary.maxRunCost,
    totalTokens: input.summary.totalTokens,
    maxRunTokens: input.summary.maxRunTokens,
    maxLatencyMs: input.summary.maxLatencyMs,
  }
  const finalized = await recordLearningEvaluationDecision({
    policy,
    policyRecordId: input.policyRecordId,
    result,
    recordedBy: required(input.recordedBy, 'recordedBy'),
  })
  const { data: bindingId, error: bindingError } = await admin.schema('agent').rpc('bind_learning_experiment_decision', {
    p_project_id: input.projectId,
    p_run_id: input.summary.runId,
    p_evaluation_result_id: finalized.resultId,
    p_analysis_evidence_ref: analysisEvidenceRef,
    p_gain_lower_confidence_bound: analysis.gainLowerConfidenceBound,
    p_confirmation_window_passed: analysis.confirmationWindowPassed,
  })
  if (bindingError || !bindingId) {
    throw new Error(`Unable to bind evaluation decision to canonical experiment evidence: ${bindingError?.message ?? 'no binding id returned'}`)
  }
  return { ...finalized, experimentDecisionBindingId: String(bindingId), analysisEvidenceRef }
}
