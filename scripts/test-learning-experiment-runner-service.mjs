import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { setResponses, getCalls } from './fixtures/learning-runner-admin.mjs'
const mockUrl = new URL('./fixtures/learning-runner-admin.mjs', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true }
  if (specifier === '@/lib/supabase/admin') return next(mockUrl, context)
  return next(specifier, context)
} })
const { createLearningRunnerCanonicalSettlementLoader, executeStoredLearningExperiment } = await import('../lib/agents/learning-experiment-runner-service.ts')
const { runnerHash, learningRunnerExecutionManifestHash } = await import('../lib/agents/learning-experiment-runner.ts')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const data = value => ({ data: value, error: null })
const reservation = { id: id(10), project_id: id(2), policy_id: id(1), candidate_id: id(3), run_id: id(8), invocation_id: id(11) }
const settlement = { id: id(12), reservation_id: id(10), project_id: id(2), status: 'ACCOUNTED', cost_event_id: id(13), observed_tokens: 10, observed_cost: '0.002' }
const cost = { id: id(13), project_id: id(2), invocation_id: id(11), execution_correlation_id: id(8), accounting_status: 'PRICED', currency: 'USD', total_tokens: 10, total_cost: '0.002' }
const load = () => createLearningRunnerCanonicalSettlementLoader()(id(10))
setResponses([data(reservation), data(settlement), data(cost)])
assert.deepEqual(await load(), { id: id(12), reservationId: id(10), projectId: id(2), invocationId: id(11), policyRecordId: id(1), candidateId: id(3), runId: id(8), costEventId: id(13), status: 'ACCOUNTED', tokens: 10, costUsd: '0.002' })
assert.deepEqual(getCalls().map(c => [c.schema, c.table, c.filters]), [
  ['agent', 'learning_experiment_budget_reservations', [['id', id(10)]]],
  ['agent', 'learning_experiment_budget_settlements', [['reservation_id', id(10)], ['project_id', id(2)]]],
  ['governance', 'ai_model_cost_events', [['id', id(13)], ['project_id', id(2)]]],
])
for (const [index, patch] of [
  [0, { id: id(99) }], [1, { reservation_id: id(99) }], [1, { project_id: id(99) }],
  [1, { status: 'UNKNOWN' }], [1, { cost_event_id: null }],
  [2, { id: id(99) }], [2, { project_id: id(99) }], [2, { invocation_id: id(99) }],
  [2, { execution_correlation_id: id(99) }], [2, { currency: 'SGD' }], [2, { accounting_status: 'UNPRICED' }],
  [2, { total_tokens: 11 }], [2, { total_cost: '0.003' }],
]) {
  const rows = structuredClone([reservation, settlement, cost]); Object.assign(rows[index], patch)
  setResponses(rows.map(data)); assert.equal(await load(), null)
}
for (const bad of [-1, 1.5, 'NaN', Infinity]) {
  setResponses([data(reservation), data({ ...settlement, observed_tokens: bad }), data({ ...cost, total_tokens: bad })])
  assert.equal(await load(), null)
}
for (const bad of ['-1', 'NaN', 'Infinity']) {
  setResponses([data(reservation), data({ ...settlement, observed_cost: bad }), data({ ...cost, total_cost: bad })])
  assert.equal(await load(), null)
}
for (let index = 0; index < 3; index++) {
  setResponses([...([reservation, settlement, cost].slice(0, index).map(data)), data(null)])
  assert.equal(await load(), null)
  setResponses([...([reservation, settlement, cost].slice(0, index).map(data)), { data: null, error: { message: 'unavailable' } }])
  await assert.rejects(load, new RegExp(['RUNNER_RESERVATION_READ_FAILED', 'RUNNER_SETTLEMENT_READ_FAILED', 'RUNNER_COST_READ_FAILED'][index]))
}
const artifact = (ref, bytes) => ({ ref, bytes, hash: runnerHash(bytes) })
const plan = {
  runId: id(8), policyRecordId: id(1), provenance: 'prospective',
  policy: { policyId: 'logical-policy-fixture-v1', projectId: id(2), candidateId: id(3), agentKey: 'profiling_agent', skillKey: 'profile_evidence_analysis', mode: 'GUIDED',
    datasetVersionIds: [id(4)], datasetManifestId: id(5), baselineVersion: 'baseline-v1', candidateVersion: 'candidate-v2', rollbackRef: 'rollback-v1',
    evaluatorActorId: id(6), proposerActorId: id(7), rubricRef: 'rubric-v1', calibrationRef: 'calibration-v1', manifestHash: runnerHash('split-manifest'),
    lockedAt: '2026-10-01T00:00:00Z', primaryMetric: 'paired-pass-rate', analysisPlanRef: 'bounded-paired-v1', sampleSize: 1,
    minimumGain: .05, minimumScore: .8, budget: { totalCost: 1, perRunCost: .5, totalTokens: 100, perRunTokens: 50, latencyMs: 1000 } },
  baseline: artifact('baseline', '{"prompt":"baseline"}'), candidate: artifact('candidate', '{"prompt":"candidate"}'),
  cases: [{ caseKey: runnerHash('case').slice(7), datasetVersionId: id(4), split: 'held_out', input: artifact('input', '{"objective":0}') }], trainingCaseKeys: [],
}
plan.executionManifestHash = learningRunnerExecutionManifestHash(plan)
let providerCalls = 0
const input = { runId: id(8), loadServerPlan: async () => structuredClone(plan), verifyStoredPlan: async () => true, isCancelled: async () => false,
  authorize: async p => ({ projectId: p.policy.projectId, policyId: p.policy.policyId, proposerActorId: p.policy.proposerActorId, evaluatorActorId: p.policy.evaluatorActorId,
    executeAllowed: true, evaluatorAllowed: true, independenceVerified: true, sourceRemediationAllowed: false }),
  provider: { id: 'fixture', async generateJson() { providerCalls++; throw new Error('Must not call provider') } },
}
setResponses([])
assert.equal((await executeStoredLearningExperiment(input)).status, 'PREPARED')
assert.equal(providerCalls, 0); assert.equal(getCalls().length, 0)
setResponses([])
const stopped = await executeStoredLearningExperiment({ ...input, dispatch: true })
assert.equal(stopped.status, 'STOPPED'); assert.match(stopped.reason, /RUNNER_ACTIVATION_DEPENDENCIES_MISSING/)
assert.equal(providerCalls, 0); assert.equal(getCalls().filter(c => c.rpc).length, 0)
setResponses([])
assert.equal((await executeStoredLearningExperiment({ ...input, verifyStoredPlan: async () => false })).status, 'STOPPED')
assert.equal(getCalls().length, 0); assert.equal(providerCalls, 0)
setResponses([])
const denied = await executeStoredLearningExperiment({ ...input, dispatch: true, expectedModelName: 'fixture', quote: { async quote() { throw new Error('Must not quote') } }, assertActivated: async () => { throw new Error('activation denied') } })
assert.equal(denied.status, 'STOPPED'); assert.match(denied.reason, /activation denied/)
assert.equal(getCalls().length, 0); assert.equal(providerCalls, 0)
console.log('Learning runner service verifies canonical scope/accounting, fails closed on reads, and defaults to preparation without dispatch.')
