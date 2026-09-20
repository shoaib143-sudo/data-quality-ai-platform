import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { buildGovernedLearningCandidateDraftsFromScorecard } = await import('../lib/agents/governed-learning-candidates.ts')
const { evaluateGovernedLearningCandidateBenchmark } = await import('../lib/agents/governed-learning-benchmarks.ts')

const metric = (overrides = {}) => ({
  evaluationType: 'AGENT_SKILL',
  capability: 'agent_skill:data_quality_agent:quality_rule_analysis',
  metricName: 'grounding',
  sampleCount: 25,
  scoredCount: 25,
  passCount: 20,
  failCount: 5,
  averageScore: 0.8,
  evidenceResultIds: ['candidate-eval-1'],
  lastObservedAt: '2026-09-20T00:00:00Z',
  ...overrides,
})

const [candidate] = buildGovernedLearningCandidateDraftsFromScorecard({
  projectId: 'project-1',
  agentKey: 'data_quality_agent',
  skillKey: 'quality_rule_analysis',
  metrics: [metric()],
  baselineVersion: 'quality-rule-analysis-v1',
  candidateVersion: 'quality-rule-analysis-v2-candidate',
  evidenceCutoffAt: '2026-09-20T00:05:00Z',
})

const benchmark = (overrides = {}) => ({
  benchmarkId: 'benchmark-1',
  evaluatorId: 'independent-evaluator-v1',
  evaluatorType: 'ADVERSARIAL_SUITE',
  observedAt: '2026-09-20T01:00:00Z',
  candidateVersion: candidate.candidateVersion,
  baselineVersion: candidate.baselineVersion,
  caseCount: 40,
  baselineScore: 0.82,
  candidateScore: 0.9,
  authorityViolations: 0,
  adversarialFailures: 0,
  evidenceRefs: ['benchmark-eval-1', 'benchmark-eval-2'],
  ...overrides,
})

const passed = evaluateGovernedLearningCandidateBenchmark({
  candidate,
  benchmark: benchmark(),
  rollbackRef: 'rollback:quality-rule-analysis-v1',
})
assert.equal(passed.candidateStatus, 'REVIEW_REQUIRED')
assert.deepEqual(passed.reasons, ['BENCHMARK_PASSED_HUMAN_REVIEW_REQUIRED'])
assert.equal(passed.automaticPromotionAllowed, false)
assert.equal(passed.automaticAuthorityExpansionAllowed, false)
assert.equal(passed.automaticMutationBoundaryChangeAllowed, false)
assert.equal(passed.rollbackRequired, true)
assert.equal(passed.currentAuthorizationRequiredAtRelease, true)
assert.equal(passed.humanReviewRequired, true)

for (const [overrides, reason] of [
  [{ caseCount: 5 }, 'INSUFFICIENT_BENCHMARK_CASES'],
  [{ candidateScore: 0.7 }, 'CANDIDATE_SCORE_BELOW_THRESHOLD'],
  [{ candidateScore: 0.81, baselineScore: 0.82 }, 'CANDIDATE_REGRESSES_BASELINE'],
  [{ authorityViolations: 1 }, 'AUTHORITY_VIOLATION_DETECTED'],
  [{ adversarialFailures: 1 }, 'ADVERSARIAL_FAILURE_DETECTED'],
]) {
  const result = evaluateGovernedLearningCandidateBenchmark({
    candidate,
    benchmark: benchmark(overrides),
    rollbackRef: 'rollback:quality-rule-analysis-v1',
  })
  assert.equal(result.candidateStatus, 'NOT_READY')
  assert.ok(result.reasons.includes(reason))
}

assert.throws(() => evaluateGovernedLearningCandidateBenchmark({
  candidate,
  benchmark: benchmark({ evaluatorId: 'data_quality_agent' }),
  rollbackRef: 'rollback:quality-rule-analysis-v1',
}), /independent/)

assert.throws(() => evaluateGovernedLearningCandidateBenchmark({
  candidate,
  benchmark: benchmark({ baselineVersion: 'wrong-baseline' }),
  rollbackRef: 'rollback:quality-rule-analysis-v1',
}), /baselineVersion/)

const source = fs.readFileSync('lib/agents/governed-learning-benchmarks.ts', 'utf8')
for (const invariant of [
  'evaluateGovernedSkillPromotion',
  "candidateStatus: 'NOT_READY' | 'REVIEW_REQUIRED'",
  'automaticPromotionAllowed: false',
  'automaticAuthorityExpansionAllowed: false',
  'automaticMutationBoundaryChangeAllowed: false',
  'rollbackRequired: true',
  'humanReviewRequired: true',
]) {
  assert.ok(source.includes(invariant), `missing benchmark invariant: ${invariant}`)
}
assert.equal(source.includes('APPROVED_FOR_CONTROLLED_RELEASE ?'), false)

const migration = fs.readFileSync('supabase/migrations/20260920011000_governed_learning_candidate_benchmarks.sql', 'utf8')
for (const invariant of [
  'create table if not exists agent.learning_candidate_benchmarks',
  'create or replace function agent.record_learning_candidate_benchmark',
  "v_candidate.status <> 'EVIDENCE_READY'",
  "p_evaluator_id = v_candidate.agent_key",
  "v_target_status := 'REVIEW_REQUIRED'",
  "v_target_status := 'NOT_READY'",
  "metadata->>'synthetic'",
  'revoke all on agent.learning_candidate_benchmarks from public, anon, authenticated, service_role',
  'grant select on agent.learning_candidate_benchmarks to authenticated, service_role',
]) {
  assert.ok(migration.includes(invariant), `missing benchmark persistence invariant: ${invariant}`)
}
assert.equal(migration.includes("v_target_status := 'ACTIVE'"), false)
assert.equal(migration.includes("v_target_status := 'APPROVED_FOR_CONTROLLED_RELEASE'"), false)

console.log('Governed learning benchmark requires independent evidence, rejects regressions and authority failures, and stops at human review.')
