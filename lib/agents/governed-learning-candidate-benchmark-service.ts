import { createAdminClient } from '@/lib/supabase/admin'
import type { SkillBenchmarkEvidence } from './governed-skill-promotion-gate'
import type { GovernedLearningCandidateDraft } from './governed-learning-candidates'
import {
  evaluateGovernedLearningCandidateBenchmark,
  type GovernedLearningBenchmarkDecision,
} from './governed-learning-candidate-benchmark'

export async function recordGovernedLearningCandidateBenchmark(input: {
  projectId: string
  candidateId: string
  candidate: GovernedLearningCandidateDraft
  benchmark: SkillBenchmarkEvidence
  rollbackRef: string
  actorUserId?: string | null
  minimumCaseCount?: number
  minimumCandidateScore?: number
}): Promise<{ benchmarkRecordId: string; decision: GovernedLearningBenchmarkDecision }> {
  if (input.candidate.projectId !== input.projectId) {
    throw new Error('learning candidate projectId must match benchmark projectId')
  }

  const decision = evaluateGovernedLearningCandidateBenchmark({
    candidate: input.candidate,
    benchmark: input.benchmark,
    rollbackRef: input.rollbackRef,
    minimumCaseCount: input.minimumCaseCount,
    minimumCandidateScore: input.minimumCandidateScore,
  })

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('record_learning_candidate_benchmark', {
    p_project_id: input.projectId,
    p_candidate_id: input.candidateId,
    p_benchmark_id: decision.benchmarkId,
    p_evaluator_id: decision.evaluatorId,
    p_evaluator_type: decision.evaluatorType,
    p_observed_at: input.benchmark.observedAt,
    p_case_count: decision.caseCount,
    p_baseline_version: decision.baselineVersion,
    p_candidate_version: decision.candidateVersion,
    p_baseline_score: decision.baselineScore,
    p_candidate_score: decision.candidateScore,
    p_authority_violations: decision.authorityViolations,
    p_adversarial_failures: decision.adversarialFailures,
    p_evidence_refs: decision.evidenceRefs,
    p_rollback_ref: decision.rollbackRef,
    p_minimum_case_count: decision.minimumCaseCount,
    p_minimum_candidate_score: decision.minimumCandidateScore,
    p_decision: decision.status,
    p_reasons: decision.reasons,
    p_actor_user_id: input.actorUserId ?? null,
  })

  if (error || !data) {
    throw new Error(`Unable to persist governed learning benchmark: ${error?.message ?? 'no benchmark id returned'}`)
  }

  return { benchmarkRecordId: String(data), decision }
}
