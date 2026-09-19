import { createAdminClient } from '@/lib/supabase/admin'
import type { SkillBenchmarkEvidence } from './governed-skill-promotion-gate'

export async function recordGovernedLearningCandidateBenchmark(input: {
  projectId: string
  candidateId: string
  benchmark: SkillBenchmarkEvidence
  rollbackRef: string
  minimumCaseCount?: number
  minimumCandidateScore?: number
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const benchmark = input.benchmark
  const { data, error } = await admin.schema('agent').rpc('record_learning_candidate_benchmark', {
    p_project_id: input.projectId,
    p_candidate_id: input.candidateId,
    p_benchmark_key: benchmark.benchmarkId,
    p_evaluator_id: benchmark.evaluatorId,
    p_evaluator_type: benchmark.evaluatorType,
    p_observed_at: benchmark.observedAt,
    p_case_count: benchmark.caseCount,
    p_baseline_score: benchmark.baselineScore,
    p_candidate_score: benchmark.candidateScore,
    p_authority_violations: benchmark.authorityViolations,
    p_adversarial_failures: benchmark.adversarialFailures,
    p_evidence_refs: [...benchmark.evidenceRefs],
    p_rollback_ref: input.rollbackRef,
    p_minimum_case_count: input.minimumCaseCount ?? 20,
    p_minimum_candidate_score: input.minimumCandidateScore ?? 0.8,
    p_actor_user_id: input.actorUserId ?? null,
  })
  if (error || !data) {
    throw new Error(`Unable to record governed learning benchmark: ${error?.message ?? 'no benchmark id returned'}`)
  }
  return String(data)
}
