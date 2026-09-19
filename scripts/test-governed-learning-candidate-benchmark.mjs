import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { evaluateGovernedLearningCandidateBenchmark } = await import('../lib/agents/governed-learning-candidate-benchmark.ts')

const candidate = {
  contractVersion: '1.0',
  candidateType: 'SKILL_IMPROVEMENT',
  candidateKey: 'skill-improvement:data_quality_agent:quality_rule_analysis:EVIDENCE_GROUNDING:v1:v2:eval-a',
  projectId: 'project-1',
  agentKey: 'data_quality_agent',
  skillKey: 'quality_rule_analysis',
  category: 'EVIDENCE_GROUNDING',
  title: 'Strengthen governed evidence requirements',
  proposedChange: 'Require stronger evidence.',
  baselineVersion: 'v1',
  candidateVersion: 'v2',
  evidenceCutoffAt: '2026-09-20T00:05:00Z',
  evidenceDimensions: ['grounding'],
  evidenceRefs: ['eval-a'],
  rationale: ['grounding failed'],
  initialStatus: 'PROPOSED',
  mayAutoApply: false,
  maySelfPromote: false,
  mayExpandToolAuthority: false,
  mayChangeMutationBoundary: false,
  requiresHumanReview: true,
  currentAuthorizationRequiredAtRelease: true,
}

const benchmark = (overrides = {}) => ({
  benchmarkId: 'benchmark-1',
  evaluatorId: 'independent-evaluator',
  evaluatorType: 'ADVERSARIAL_SUITE',
  observedAt: '2026-09-20T01:00:00Z',
  candidateVersion: 'v2',
  baselineVersion: 'v1',
  caseCount: 30,
  baselineScore: 0.8,
  candidateScore: 0.9,
  authorityViolations: 0,
  adversarialFailures: 0,
  evidenceRefs: ['benchmark-evidence-1'],
  ...overrides,
})

const ready = evaluateGovernedLearningCandidateBenchmark({
  candidate,
  benchmark: benchmark(),
  rollbackRef: 'rollback:v1',
})

assert.equal(ready.status, 'REVIEW_REQUIRED')
assert.equal(ready.automaticPromotionAllowed, false)
assert.equal(ready.automaticAuthorityExpansionAllowed, false)
assert.equal(ready.automaticMutationBoundaryChangeAllowed, false)
assert.equal(ready.humanReviewRequired, true)
assert.equal(ready.currentAuthorizationRequiredAtRelease, true)
assert.deepEqual(ready.evidenceRefs, ['benchmark-evidence-1'])

const regressed = evaluateGovernedLearningCandidateBenchmark({
  candidate,
  benchmark: benchmark({ candidateScore: 0.7 }),
  rollbackRef: 'rollback:v1',
})
assert.equal(regressed.status, 'NOT_READY')
assert.ok(regressed.reasons.includes('CANDIDATE_SCORE_BELOW_THRESHOLD'))
assert.ok(regressed.reasons.includes('CANDIDATE_REGRESSES_BASELINE'))

const authorityFailure = evaluateGovernedLearningCandidateBenchmark({
  candidate,
  benchmark: benchmark({ authorityViolations: 1 }),
  rollbackRef: 'rollback:v1',
})
assert.equal(authorityFailure.status, 'NOT_READY')
assert.ok(authorityFailure.reasons.includes('AUTHORITY_VIOLATION_DETECTED'))

const adversarialFailure = evaluateGovernedLearningCandidateBenchmark({
  candidate,
  benchmark: benchmark({ adversarialFailures: 1 }),
  rollbackRef: 'rollback:v1',
})
assert.equal(adversarialFailure.status, 'NOT_READY')
assert.ok(adversarialFailure.reasons.includes('ADVERSARIAL_FAILURE_DETECTED'))

assert.throws(() => evaluateGovernedLearningCandidateBenchmark({
  candidate,
  benchmark: benchmark({ evaluatorId: 'data_quality_agent' }),
  rollbackRef: 'rollback:v1',
}), /independent/)

assert.throws(() => evaluateGovernedLearningCandidateBenchmark({
  candidate,
  benchmark: benchmark({ candidateVersion: 'wrong' }),
  rollbackRef: 'rollback:v1',
}), /candidateVersion/)

const source = fs.readFileSync('lib/agents/governed-learning-candidate-benchmark.ts', 'utf8')
for (const invariant of [
  "status: 'NOT_READY' | 'REVIEW_REQUIRED'",
  'automaticPromotionAllowed: false',
  'automaticAuthorityExpansionAllowed: false',
  'automaticMutationBoundaryChangeAllowed: false',
  'humanReviewRequired: true',
  'currentAuthorizationRequiredAtRelease: true',
]) {
  assert.ok(source.includes(invariant), `missing benchmark safety invariant: ${invariant}`)
}
assert.equal(/APPROVED_FOR_CONTROLLED_RELEASE/.test(source), false, 'benchmark adapter must not expose approval authority')

const service = fs.readFileSync('lib/agents/governed-learning-candidate-benchmark-service.ts', 'utf8')
for (const invariant of [
  'recordGovernedLearningCandidateBenchmark',
  'evaluateGovernedLearningCandidateBenchmark',
  'record_learning_candidate_benchmark',
]) {
  assert.ok(service.includes(invariant), `missing benchmark service integration: ${invariant}`)
}

const migration = fs.readFileSync('supabase/migrations/20260920020000_governed_learning_candidate_benchmarks.sql', 'utf8')
for (const invariant of [
  'create table if not exists agent.learning_candidate_benchmarks',
  'create or replace function agent.record_learning_candidate_benchmark',
  "v_candidate.status <> 'EVIDENCE_READY'",
  "p_decision not in ('NOT_READY','REVIEW_REQUIRED')",
  "p_evaluator_id = v_candidate.agent_key",
  "p_authority_violations > 0 and p_decision <> 'NOT_READY'",
  "p_adversarial_failures > 0 and p_decision <> 'NOT_READY'",
  "p_candidate_score < p_baseline_score and p_decision <> 'NOT_READY'",
  "'EVIDENCE_READY', 'BENCHMARKING'",
  "'BENCHMARKING', p_decision",
  'revoke all on agent.learning_candidate_benchmarks from public, anon, authenticated, service_role',
  'grant select on agent.learning_candidate_benchmarks to authenticated, service_role',
]) {
  assert.ok(migration.includes(invariant), `missing benchmark persistence invariant: ${invariant}`)
}
for (const forbidden of [
  "p_decision = 'APPROVED_FOR_CONTROLLED_RELEASE'",
  "p_decision = 'CANARY'",
  "p_decision = 'ACTIVE'",
]) {
  assert.equal(migration.includes(forbidden), false, `benchmark increment must not expose release authority: ${forbidden}`)
}

console.log('Governed learning benchmark evidence is independent, append-only, fail-closed, and cannot self-promote a candidate.')
