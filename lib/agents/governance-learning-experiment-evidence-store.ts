import { createAdminClient } from '@/lib/supabase/admin'
import type {
  LearningExperimentEvidenceStore,
  LearningExperimentSummary,
  PreparedLearningExperimentAttempt,
} from './governed-learning-experiment-runner'

function requiredString(value: unknown, label: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}
function numberValue(value: unknown, label: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be numeric`)
  return numeric
}
function integerValue(value: unknown, label: string) {
  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric)) throw new Error(`${label} must be an integer`)
  return numeric
}

export function createGovernanceLearningExperimentEvidenceStore(): LearningExperimentEvidenceStore {
  const admin = createAdminClient()

  return {
    async createRun(input) {
      const { data, error } = await admin.schema('agent').rpc('create_learning_experiment_run', {
        p_project_id: input.projectId,
        p_policy_id: input.policyRecordId,
        p_candidate_id: input.candidateId,
        p_run_key: input.runKey,
        p_evidence_class: input.evidenceClass,
        p_case_keys: [...input.caseKeys],
      })
      if (error || !data) throw new Error(`Unable to create learning experiment run: ${error?.message ?? 'no run id returned'}`)
      return requiredString(data, 'runId')
    },

    async prepareAttempt(input) {
      const { data, error } = await admin.schema('agent').rpc('prepare_learning_experiment_arm_attempt', {
        p_project_id: input.projectId,
        p_run_id: input.runId,
        p_case_key: input.caseKey,
        p_arm: input.arm,
        p_version: input.version,
        p_attempt_key: input.attemptKey,
        p_executable_artifact_ref: input.executableArtifactRef,
        p_executable_artifact_hash: input.executableArtifactHash,
        p_input_artifact_ref: input.inputArtifactRef,
        p_input_artifact_hash: input.inputArtifactHash,
      })
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`Unable to prepare learning experiment attempt: ${error?.message ?? 'invalid attempt evidence'}`)
      }
      const row = data as Record<string, unknown>
      const prepared: PreparedLearningExperimentAttempt = {
        attemptId: requiredString(row.attemptId, 'attemptId'),
        executionCorrelationId: requiredString(row.executionCorrelationId, 'executionCorrelationId'),
        attemptNumber: integerValue(row.attemptNumber, 'attemptNumber'),
        sourceCaseRef: requiredString(row.sourceCaseRef, 'sourceCaseRef'),
        reused: row.reused === true,
        terminalResultId: row.terminalResultId == null ? null : requiredString(row.terminalResultId, 'terminalResultId'),
        terminalStatus: row.terminalStatus == null ? null : String(row.terminalStatus) as PreparedLearningExperimentAttempt['terminalStatus'],
      }
      return prepared
    },

    async recordArmResult(input) {
      const { data, error } = await admin.schema('agent').rpc('record_learning_experiment_arm_result', {
        p_project_id: input.projectId,
        p_run_id: input.runId,
        p_attempt_id: input.attemptId,
        p_terminal_status: input.execution.terminalStatus,
        p_output_artifact_ref: input.execution.outputArtifactRef ?? null,
        p_output_artifact_hash: input.execution.outputArtifactHash ?? null,
        p_observed_latency_ms: input.execution.observedLatencyMs ?? null,
        p_failure_code: input.execution.failureCode ?? null,
      })
      if (error || !data) throw new Error(`Unable to persist learning experiment arm result: ${error?.message ?? 'no result id returned'}`)
      return requiredString(data, 'armResultId')
    },

    async findCaseScore(input) {
      const { data, error } = await admin.schema('agent')
        .from('learning_experiment_case_scores')
        .select('id')
        .eq('project_id', input.projectId)
        .eq('run_id', input.runId)
        .eq('case_key', input.caseKey)
        .maybeSingle()
      if (error) throw new Error(`Unable to inspect existing learning experiment case score: ${error.message}`)
      return data?.id ? String(data.id) : null
    },

    async recordCaseScore(input) {
      const { data, error } = await admin.schema('agent').rpc('record_learning_experiment_case_score', {
        p_project_id: input.projectId,
        p_run_id: input.runId,
        p_case_key: input.caseKey,
        p_evaluator_actor_id: input.evaluatorActorId,
        p_evaluator_type: input.score.evaluatorType,
        p_baseline_result_id: input.baselineResultId,
        p_candidate_result_id: input.candidateResultId,
        p_baseline_score: input.score.baselineScore,
        p_candidate_score: input.score.candidateScore,
        p_independently_verified: input.score.independentlyVerified,
        p_authority_violation: input.score.authorityViolation,
        p_safety_failure: input.score.safetyFailure,
        p_rubric_ref: input.score.rubricRef,
        p_calibration_ref: input.score.calibrationRef,
        p_observed_at: input.score.observedAt,
      })
      if (error || !data) throw new Error(`Unable to persist learning experiment case score: ${error?.message ?? 'no score id returned'}`)
      return requiredString(data, 'caseScoreId')
    },

    async deriveSummary(input) {
      const { data, error } = await admin.schema('agent').rpc('derive_learning_experiment_summary', {
        p_project_id: input.projectId,
        p_run_id: input.runId,
      })
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`Unable to derive learning experiment summary: ${error?.message ?? 'invalid summary evidence'}`)
      }
      const row = data as Record<string, unknown>
      const summary: LearningExperimentSummary = {
        runId: requiredString(row.runId, 'runId'),
        evidenceClass: row.evidenceClass === 'PROSPECTIVE_LIVE' ? 'PROSPECTIVE_LIVE' : 'SYNTHETIC',
        caseCount: integerValue(row.caseCount, 'caseCount'),
        scoredCaseCount: integerValue(row.scoredCaseCount, 'scoredCaseCount'),
        complete: row.complete === true,
        allIndependentlyVerified: row.allIndependentlyVerified === true,
        baselineScore: row.baselineScore == null ? null : numberValue(row.baselineScore, 'baselineScore'),
        candidateScore: row.candidateScore == null ? null : numberValue(row.candidateScore, 'candidateScore'),
        authorityViolations: integerValue(row.authorityViolations, 'authorityViolations'),
        safetyFailures: integerValue(row.safetyFailures, 'safetyFailures'),
        accountingComplete: row.accountingComplete === true,
        totalCost: numberValue(row.totalCost, 'totalCost'),
        maxRunCost: numberValue(row.maxRunCost, 'maxRunCost'),
        totalTokens: integerValue(row.totalTokens, 'totalTokens'),
        maxRunTokens: integerValue(row.maxRunTokens, 'maxRunTokens'),
        maxLatencyMs: integerValue(row.maxLatencyMs, 'maxLatencyMs'),
      }
      return summary
    },
  }
}
