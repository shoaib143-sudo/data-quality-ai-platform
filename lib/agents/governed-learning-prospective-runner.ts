import { createAdminClient } from '@/lib/supabase/admin'
import type {
  LearningProspectiveCaseEvaluation,
  LearningProspectivePlanProvider,
  LearningProspectiveRunStore,
} from './learning-prospective-experiment-runner'

function text(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function number(value: unknown, label: string) {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${label} must be a positive integer`)
  return result
}

export function createGovernanceLearningProspectivePlanProvider(): LearningProspectivePlanProvider {
  const admin = createAdminClient()
  return {
    async load(input) {
      const { data: policy, error: policyError } = await admin.schema('agent').from('learning_evaluation_policies')
        .select('id,project_id,candidate_id,dataset_manifest_id,policy_key,agent_key,skill_key,mode,baseline_version,candidate_version,evaluator_actor_id,sample_size,manifest_hash,created_at')
        .eq('id', input.policyRecordId)
        .eq('project_id', input.projectId)
        .eq('candidate_id', input.candidateId)
        .maybeSingle()
      if (policyError) throw new Error(`Unable to load locked learning evaluation policy: ${policyError.message}`)
      if (!policy) throw new Error('Locked learning evaluation policy not found')

      const { data: newer, error: newerError } = await admin.schema('agent').from('learning_evaluation_policies')
        .select('id,created_at')
        .eq('project_id', input.projectId)
        .eq('candidate_id', input.candidateId)
        .neq('id', input.policyRecordId)
        .gte('created_at', policy.created_at)
        .limit(1)
      if (newerError) throw new Error(`Unable to validate latest learning evaluation policy: ${newerError.message}`)
      if (newer?.length) throw new Error('Locked learning evaluation policy is stale or chronology is ambiguous')

      const { data: manifest, error: manifestError } = await admin.schema('agent').from('learning_benchmark_dataset_manifests')
        .select('id,project_id,manifest_hash,status,held_out_case_count')
        .eq('id', policy.dataset_manifest_id)
        .eq('project_id', input.projectId)
        .maybeSingle()
      if (manifestError) throw new Error(`Unable to load sealed learning dataset manifest: ${manifestError.message}`)
      if (!manifest || manifest.status !== 'SEALED' || manifest.manifest_hash !== policy.manifest_hash) {
        throw new Error('Sealed learning dataset manifest does not match locked policy')
      }

      const { data: cases, error: caseError } = await admin.schema('agent').from('learning_benchmark_dataset_cases')
        .select('case_key,source_case_ref')
        .eq('project_id', input.projectId)
        .eq('dataset_id', policy.dataset_manifest_id)
        .eq('split', 'HELD_OUT')
        .order('case_key', { ascending: true })
      if (caseError) throw new Error(`Unable to load locked held-out cases: ${caseError.message}`)
      if (!cases?.length) throw new Error('Locked manifest has no held-out cases')
      if (cases.length !== Number(manifest.held_out_case_count)) throw new Error('Held-out case inventory does not match sealed manifest')

      return {
        projectId: text(policy.project_id, 'projectId'),
        policyRecordId: text(policy.id, 'policyRecordId'),
        candidateId: text(policy.candidate_id, 'candidateId'),
        datasetManifestId: text(policy.dataset_manifest_id, 'datasetManifestId'),
        policyKey: text(policy.policy_key, 'policyKey'),
        agentKey: text(policy.agent_key, 'agentKey'),
        skillKey: text(policy.skill_key, 'skillKey'),
        mode: policy.mode,
        baselineVersion: text(policy.baseline_version, 'baselineVersion'),
        candidateVersion: text(policy.candidate_version, 'candidateVersion'),
        evaluatorActorId: text(policy.evaluator_actor_id, 'evaluatorActorId'),
        sampleSize: number(policy.sample_size, 'sampleSize'),
        heldOutCases: cases.map((item) => ({
          caseKey: text(item.case_key, 'caseKey'),
          sourceCaseRef: text(item.source_case_ref, 'sourceCaseRef'),
        })),
      }
    },
  }
}

function mapCaseEvaluation(row: Record<string, unknown>): LearningProspectiveCaseEvaluation {
  return {
    evaluationId: text(row.id, 'evaluationId'),
    caseKey: text(row.case_key, 'caseKey'),
    baselineEvidenceRef: text(row.baseline_evidence_ref, 'baselineEvidenceRef'),
    candidateEvidenceRef: text(row.candidate_evidence_ref, 'candidateEvidenceRef'),
    baselineScore: Number(row.baseline_score),
    candidateScore: Number(row.candidate_score),
    authorityViolation: row.authority_violation === true,
    adversarialFailure: row.adversarial_failure === true,
    observedAt: text(row.observed_at, 'observedAt'),
  }
}

export function createGovernanceLearningProspectiveRunStore(): LearningProspectiveRunStore {
  const admin = createAdminClient()
  return {
    async begin(input) {
      const { data, error } = await admin.schema('agent').rpc('begin_learning_prospective_experiment', {
        p_project_id: input.projectId,
        p_policy_id: input.policyRecordId,
        p_candidate_id: input.candidateId,
        p_run_key: input.runKey,
        p_evidence_class: input.evidenceClass,
      })
      if (error || !data) throw new Error(`Unable to begin prospective learning experiment: ${error?.message ?? 'no run evidence'}`)
      return {
        runId: text(data.run_id, 'runId'),
        expectedCaseCount: number(data.expected_case_count, 'expectedCaseCount'),
        existing: data.existing === true,
      }
    },

    async claimAttempt(input) {
      const { data, error } = await admin.schema('agent').rpc('claim_learning_prospective_attempt', {
        p_project_id: input.projectId,
        p_experiment_run_id: input.runId,
        p_case_key: input.caseKey,
        p_arm: input.arm,
        p_version: input.version,
        p_attempt_key: input.attemptKey,
      })
      if (error || !data) throw new Error(`Unable to claim prospective learning attempt: ${error?.message ?? 'no attempt evidence'}`)
      return {
        attemptId: text(data.attempt_id, 'attemptId'),
        executionRunId: text(data.execution_run_id, 'executionRunId'),
        status: data.status,
        evidenceRef: data.evidence_ref == null ? null : text(data.evidence_ref, 'evidenceRef'),
        existing: data.existing === true,
      }
    },

    async completeAttempt(input) {
      const { error } = await admin.schema('agent').rpc('complete_learning_prospective_attempt', {
        p_project_id: input.projectId,
        p_attempt_id: input.attemptId,
        p_status: input.status,
        p_evidence_ref: input.evidenceRef,
        p_error_code: input.errorCode,
      })
      if (error) throw new Error(`Unable to complete prospective learning attempt: ${error.message}`)
    },

    async loadCaseEvaluation(input) {
      const { data, error } = await admin.schema('agent').from('learning_prospective_case_evaluations')
        .select('id,case_key,baseline_evidence_ref,candidate_evidence_ref,baseline_score,candidate_score,authority_violation,adversarial_failure,observed_at')
        .eq('project_id', input.projectId)
        .eq('experiment_run_id', input.runId)
        .eq('case_key', input.caseKey)
        .maybeSingle()
      if (error) throw new Error(`Unable to load prospective case evaluation: ${error.message}`)
      return data ? mapCaseEvaluation(data as Record<string, unknown>) : null
    },

    async recordCaseEvaluation(input) {
      const { data: id, error } = await admin.schema('agent').rpc('record_learning_prospective_case_evaluation', {
        p_project_id: input.projectId,
        p_experiment_run_id: input.runId,
        p_case_key: input.caseKey,
        p_evaluator_actor_id: input.evaluatorActorId,
        p_baseline_evidence_ref: input.baselineEvidenceRef,
        p_candidate_evidence_ref: input.candidateEvidenceRef,
        p_baseline_score: input.baselineScore,
        p_candidate_score: input.candidateScore,
        p_authority_violation: input.authorityViolation,
        p_adversarial_failure: input.adversarialFailure,
        p_observed_at: input.observedAt,
      })
      if (error || !id) throw new Error(`Unable to persist prospective case evaluation: ${error?.message ?? 'no evaluation id'}`)
      return {
        evaluationId: String(id),
        caseKey: input.caseKey,
        baselineEvidenceRef: input.baselineEvidenceRef,
        candidateEvidenceRef: input.candidateEvidenceRef,
        baselineScore: input.baselineScore,
        candidateScore: input.candidateScore,
        authorityViolation: input.authorityViolation,
        adversarialFailure: input.adversarialFailure,
        observedAt: input.observedAt,
      }
    },

    async completeRun(input) {
      const { error } = await admin.schema('agent').rpc('complete_learning_prospective_experiment', {
        p_project_id: input.projectId,
        p_experiment_run_id: input.runId,
      })
      if (error) throw new Error(`Unable to complete prospective learning experiment: ${error.message}`)
    },
  }
}
