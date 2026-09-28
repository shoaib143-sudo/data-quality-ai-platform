import type { PairedLearningCase } from './governed-learning-paired-benchmark'

const SHA256_CASE_KEY = /^[a-f0-9]{64}$/

export type IndependentPairedEvaluationInput = {
  projectId: string
  candidateId: string
  agentKey: string
  skillKey: string
  evaluatorId: string
  evaluatorType: 'DETERMINISTIC' | 'LABELED_DATASET' | 'ADVERSARIAL_SUITE' | 'HUMAN_EVALUATION'
  benchmarkKey: string
  datasetKey: string
  observedAt: string
  baselineVersion: string
  candidateVersion: string
  cases: readonly PairedLearningCase[]
}

function text(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function score(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`)
  return value
}

/** Persist independent case-level results before recording the aggregate benchmark. */
export async function recordIndependentPairedEvaluations(input: IndependentPairedEvaluationInput) {
  const projectId = text(input.projectId, 'projectId')
  const candidateId = text(input.candidateId, 'candidateId')
  const agentKey = text(input.agentKey, 'agentKey')
  const skillKey = text(input.skillKey, 'skillKey')
  const evaluatorId = text(input.evaluatorId, 'evaluatorId')
  const benchmarkKey = text(input.benchmarkKey, 'benchmarkKey')
  const datasetKey = text(input.datasetKey, 'datasetKey')
  const baselineVersion = text(input.baselineVersion, 'baselineVersion')
  const candidateVersion = text(input.candidateVersion, 'candidateVersion')
  if (evaluatorId === agentKey) throw new Error('evaluation must be independent from the proposing agent')
  if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error('observedAt must be a valid timestamp')
  if (!input.cases.length) throw new Error('paired evaluation cases are required')
  const caseKeys = new Set<string>()
  for (const item of input.cases) {
    const caseKey = item.caseKey.trim()
    if (!SHA256_CASE_KEY.test(caseKey) || caseKeys.has(caseKey)) throw new Error('case keys must be unique SHA-256 digests')
    caseKeys.add(caseKey)
    score(item.baselineScore, 'baselineScore')
    score(item.candidateScore, 'candidateScore')
  }

  const rows = input.cases.flatMap((item) => [
    {
      project_id: projectId,
      evaluation_type: 'AGENT_SKILL',
      capability: `agent_skill:${agentKey}:${skillKey}`,
      metric_name: 'held_out_case_score',
      score: item.baselineScore,
      pass: item.baselineScore >= 0.5,
      evaluator_type: input.evaluatorType,
      evaluator_version: '1.0',
      evidence_refs: [item.baselineEvidenceRef],
      dimensions: { benchmark_case_key: item.caseKey, variant: 'BASELINE' },
      metadata: {
        benchmark_case_key: item.caseKey, benchmark_variant: 'BASELINE', benchmark_split: 'HELD_OUT',
        benchmark_dataset_key: datasetKey, learning_candidate_id: candidateId, agent_key: agentKey,
        skill_key: skillKey, version: baselineVersion, benchmark_evaluator_id: evaluatorId,
        benchmark_key: benchmarkKey, synthetic: 'false', authority_violation: String(item.authorityViolation),
        adversarial_failure: String(item.adversarialFailure),
      },
      observed_at: input.observedAt,
    },
    {
      project_id: projectId,
      evaluation_type: 'AGENT_SKILL',
      capability: `agent_skill:${agentKey}:${skillKey}`,
      metric_name: 'held_out_case_score',
      score: item.candidateScore,
      pass: item.candidateScore >= 0.5,
      evaluator_type: input.evaluatorType,
      evaluator_version: '1.0',
      evidence_refs: [item.candidateEvidenceRef],
      dimensions: { benchmark_case_key: item.caseKey, variant: 'CANDIDATE' },
      metadata: {
        benchmark_case_key: item.caseKey, benchmark_variant: 'CANDIDATE', benchmark_split: 'HELD_OUT',
        benchmark_dataset_key: datasetKey, learning_candidate_id: candidateId, agent_key: agentKey,
        skill_key: skillKey, version: candidateVersion, benchmark_evaluator_id: evaluatorId,
        benchmark_key: benchmarkKey, synthetic: 'false', authority_violation: String(item.authorityViolation),
        adversarial_failure: String(item.adversarialFailure),
      },
      observed_at: input.observedAt,
    },
  ])
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('ai_evaluation_results').insert(rows).select('id,metadata')
  if (error || !data || data.length !== rows.length) {
    throw new Error(`Unable to persist independent paired evaluations: ${error?.message ?? 'incomplete insert'}`)
  }
  return data.map((row) => String(row.id))
}
