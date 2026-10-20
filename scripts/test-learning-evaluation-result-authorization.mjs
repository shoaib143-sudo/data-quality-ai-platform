import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const fixtureUrl = new URL('./fixtures/learning-evaluation-result-boundary.mjs', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@/lib/supabase/admin') return next(fixtureUrl, context)
  if (specifier === '@/lib/auth/authorize') return next(fixtureUrl, context)
  if (specifier === '@/lib/auth/require-api-user') return next(fixtureUrl, context)
  return next(specifier, context)
} })

const fixture = await import('./fixtures/learning-evaluation-result-boundary.mjs')
const {
  acknowledgeLearningEvaluationPolicyAssignment,
  recordLearningEvaluationDecision,
  registerLearningEvaluationPolicy,
} = await import('../lib/agents/governed-learning-evaluation-service.ts')

const minutesAgo = minutes => new Date(Date.now() - minutes * 60_000).toISOString()
const evaluator = 'a1234567-89ab-4cde-8fab-123456789abc'
const policyRow = {
  id: 'locked-policy-row', created_at: '2026-10-20T09:00:00Z', policy_key: 'policy-1',
  project_id: 'project-1', candidate_id: 'candidate-1', dataset_manifest_id: 'manifest-1',
  agent_key: 'profiling_agent', skill_key: 'profile_evidence_analysis', mode: 'GUIDED',
  dataset_version_ids: ['version-1'], baseline_version: 'v1', candidate_version: 'v2', rollback_ref: 'rollback:v1',
  evaluator_actor_id: evaluator, proposer_actor_id: 'b1234567-89ab-4cde-8fab-123456789abc',
  rubric_ref: 'rubric-1', calibration_ref: 'calibration-1', manifest_hash: `sha256:${'a'.repeat(64)}`,
  locked_at: minutesAgo(30), primary_metric: 'quality', analysis_plan_ref: 'analysis-1',
  sample_size: 2, minimum_gain: 0.05, minimum_score: 0.8,
  total_cost_budget: 0, per_run_cost_budget: 0, total_token_budget: 0, per_run_token_budget: 0, latency_ms_budget: 1000,
}
const assignmentRow = {
  id: 'assignment-1', policy_id: policyRow.id, project_id: policyRow.project_id,
  candidate_id: policyRow.candidate_id, proposer_user_id: policyRow.proposer_actor_id,
  evaluator_user_id: evaluator, assigned_by_user_id: policyRow.proposer_actor_id,
  scope_digest: `sha256:${'b'.repeat(64)}`, assigned_at: minutesAgo(20),
}
const acknowledgementRow = {
  id: 'ack-1', assignment_id: assignmentRow.id, policy_id: policyRow.id,
  project_id: policyRow.project_id, candidate_id: policyRow.candidate_id,
  evaluator_user_id: evaluator, acknowledged_by_user_id: evaluator,
  scope_digest: assignmentRow.scope_digest, acknowledged_at: minutesAgo(10),
}
const result = {
  policyId: 'policy-1', projectId: 'project-1', candidateId: 'candidate-1', baselineVersion: 'v1', candidateVersion: 'v2',
  mode: 'GUIDED', datasetManifestId: 'manifest-1', manifestHash: `sha256:${'a'.repeat(64)}`, evaluatorActorId: evaluator,
  observedAt: minutesAgo(5), sampleCount: 2, baselineScore: 0.7, candidateScore: 0.9,
  gainLowerConfidenceBound: 0.1, independentlyVerified: true, evidenceComplete: true, confirmationWindowPassed: true,
  authorityViolations: 0, safetyFailures: 0, accountingComplete: true, totalCost: 0, maxRunCost: 0,
  totalTokens: 0, maxRunTokens: 0, maxLatencyMs: 100,
}
const registrationPolicy = {
  policyId: 'policy-registration-1', projectId: policyRow.project_id, candidateId: policyRow.candidate_id,
  agentKey: policyRow.agent_key, skillKey: policyRow.skill_key, mode: policyRow.mode,
  datasetVersionIds: [...policyRow.dataset_version_ids], datasetManifestId: policyRow.dataset_manifest_id,
  baselineVersion: policyRow.baseline_version, candidateVersion: policyRow.candidate_version,
  rollbackRef: policyRow.rollback_ref, evaluatorActorId: evaluator, rubricRef: policyRow.rubric_ref,
  calibrationRef: policyRow.calibration_ref, manifestHash: policyRow.manifest_hash,
  lockedAt: policyRow.locked_at, primaryMetric: policyRow.primary_metric,
  analysisPlanRef: policyRow.analysis_plan_ref, sampleSize: policyRow.sample_size,
  minimumGain: policyRow.minimum_gain, minimumScore: policyRow.minimum_score,
  budget: { totalCost: 0, perRunCost: 0, totalTokens: 0, perRunTokens: 0, latencyMs: 1000 },
}
const call = (patch = {}) => recordLearningEvaluationDecision({
  policyRecordId: policyRow.id,
  result: { ...result },
  ...patch,
})

fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow })
const unverifiedResult = {
  ...result,
  independentlyVerified: false,
  evidenceComplete: false,
  confirmationWindowPassed: false,
  accountingComplete: false,
}
await assert.rejects(call({ result: unverifiedResult }), /result writes are disabled until server-owned evidence attestation is available/)
let calls = fixture.getCalls()
assert.deepEqual(calls.map(item => item.type), ['auth', 'select', 'maybeSingle', 'authorize', 'select', 'maybeSingle', 'select', 'maybeSingle'])
assert.deepEqual(calls.find(item => item.type === 'authorize'), {
  type: 'authorize', userId: evaluator, projectId: 'project-1', capability: 'agent.learning.evaluate',
})
assert.ok(!calls.some(item => item.type === 'rpc'), 'unattested aggregate must not reach result RPC')

for (const forged of [
  { ...unverifiedResult, baselineScore: 0, candidateScore: 1, gainLowerConfidenceBound: 1 },
  { ...unverifiedResult, authorityViolations: 0, safetyFailures: 0, totalCost: 0, totalTokens: 0 },
  { ...unverifiedResult, authorityViolations: 9, safetyFailures: 9, totalCost: 999, totalTokens: 999 },
]) {
  fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow })
  await assert.rejects(call({ result: forged }), /result writes are disabled until server-owned evidence attestation is available/)
  assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'), 'fabricated non-positive aggregates must not reach canonical evidence storage')
}

fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow })
await assert.rejects(call(), /Caller-supplied verification claims are not accepted/)
assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'))

for (const claim of ['independentlyVerified', 'evidenceComplete', 'confirmationWindowPassed', 'accountingComplete']) {
  fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow })
  await assert.rejects(call({ result: { ...unverifiedResult, [claim]: true } }), /Caller-supplied verification claims are not accepted/)
  assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'), `${claim} must not reach result RPC`)
}

fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow })
await assert.rejects(call({ result: { ...result, observedAt: minutesAgo(15) } }), /must occur after evaluator acknowledgement/)
assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'))

fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow })
await assert.rejects(call({ result: { ...result, observedAt: '2099-10-20T09:10:00Z' } }), /cannot be future-dated/)
assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'))

fixture.configure({ userId: 'c1234567-89ab-4cde-8fab-123456789abc', policyRow, assignmentRow, acknowledgementRow })
await assert.rejects(call(), /must match/)
calls = fixture.getCalls()
assert.ok(!calls.some(item => item.type === 'authorize' || item.type === 'rpc'))

fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow, authorizationAllowed: false })
await assert.rejects(call(), /permission/)
assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'))

fixture.configure({ userId: evaluator, policyRow: null })
await assert.rejects(call(), /persisted locked learning evaluation policy/)
assert.ok(!fixture.getCalls().some(item => item.type === 'authorize' || item.type === 'rpc'))

fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow, policyFailure: 'database unavailable' })
await assert.rejects(call(), /Unable to load locked learning evaluation policy/)
assert.ok(!fixture.getCalls().some(item => item.type === 'authorize' || item.type === 'rpc'))

fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow, authFailure: 'session unavailable' })
await assert.rejects(call(), /session unavailable/)
assert.deepEqual(fixture.getCalls().map(item => item.type), ['auth'])

fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow, rpcResponse: { data: null, error: { message: 'write unavailable' } } })
await assert.rejects(call({ result: unverifiedResult }), /result writes are disabled until server-owned evidence attestation is available/)
assert.equal(fixture.getCalls().filter(item => item.type === 'rpc').length, 0)

const proposer = 'b1234567-89ab-4cde-8fab-123456789abc'
fixture.configure({ userId: proposer, authUsers: [evaluator] })
assert.equal(await registerLearningEvaluationPolicy({ ...registrationPolicy, proposerActorId: 'forged-proposer' }), 'evaluation-result-id')
calls = fixture.getCalls()
assert.deepEqual(calls.filter(item => item.type === 'authorize').map(item => [item.userId, item.projectId, item.capability]), [
  [proposer, 'project-1', 'agent.admin'],
  [evaluator, 'project-1', 'agent.learning.evaluate'],
])
assert.equal(calls.find(item => item.type === 'rpc').args.p_policy_input.p_proposer_actor_id, proposer)
assert.equal(calls.find(item => item.type === 'rpc').args.p_policy_input.p_evaluator_actor_id, evaluator)
assert.equal(calls.find(item => item.type === 'rpc').args.p_proposer_user_id, proposer)
assert.equal(calls.find(item => item.type === 'rpc').args.p_evaluator_user_id, evaluator)
assert.equal(calls.filter(item => item.type === 'rpc').length, 1)
assert.equal(calls.find(item => item.type === 'rpc').name, 'record_learning_evaluation_policy_with_assignment')

fixture.configure({ userId: proposer, authUsers: [evaluator], rpcResponse: { data: null, error: { message: 'assignment transaction failed' } } })
await assert.rejects(registerLearningEvaluationPolicy(registrationPolicy), /Unable to atomically persist learning evaluation policy and evaluator assignment: assignment transaction failed/)
assert.equal(fixture.getCalls().filter(item => item.type === 'rpc').length, 1)

fixture.configure({ userId: proposer, authUsers: [] })
await assert.rejects(registerLearningEvaluationPolicy(registrationPolicy), /Unable to resolve evaluator account/)
assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'))

fixture.configure({ userId: proposer, authUsers: [evaluator], authorizationAllowed: false })
await assert.rejects(registerLearningEvaluationPolicy(registrationPolicy), /permission/)
assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'))

await assert.rejects(registerLearningEvaluationPolicy({ ...registrationPolicy, evaluatorActorId: proposer }), /must be different/)
assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'))

fixture.configure({ userId: evaluator, policyRow, assignmentRow, acknowledgementRow: null })
await assert.rejects(call(), /matching evaluator acknowledgement is required/)
assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'))

fixture.configure({ userId: evaluator, policyRow, assignmentRow: { ...assignmentRow, scope_digest: `sha256:${'c'.repeat(64)}` }, acknowledgementRow })
await assert.rejects(call(), /matching evaluator acknowledgement is required/)
assert.ok(!fixture.getCalls().some(item => item.type === 'rpc'))

fixture.configure({ userId: evaluator, policyRow })
assert.equal(await acknowledgeLearningEvaluationPolicyAssignment(policyRow.id), 'evaluation-result-id')
calls = fixture.getCalls()
assert.deepEqual(calls.map(item => item.type), ['auth', 'select', 'maybeSingle', 'authorize', 'rpc'])
assert.equal(calls.find(item => item.type === 'rpc').name, 'record_learning_evaluation_assignment_acknowledgement')
assert.equal(calls.find(item => item.type === 'rpc').args.p_evaluator_user_id, evaluator)

fixture.configure({ userId: proposer, policyRow })
await assert.rejects(acknowledgeLearningEvaluationPolicyAssignment(policyRow.id), /must match/)
assert.ok(!fixture.getCalls().some(item => item.type === 'authorize' || item.type === 'rpc'))

console.log('PASS result writes require a session, persisted evaluator binding, current capability, and matching evaluator acknowledgement')
console.log('PASS caller-supplied positive and non-positive aggregates cannot enter the canonical ledger without server-derived evidence attestation')
console.log('PASS forged evaluator, missing policy/assignment/acknowledgement, scope mismatch, read outage, authorization denial, auth outage, and disabled write path are fail-closed')
console.log('PASS policy registration derives proposer from session, requires distinct existing evaluator, checks both capabilities, and persists assignment')
