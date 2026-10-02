import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import './lib/register-typescript-resolution.mjs'
const { runLearningExperiment, runnerHash, learningRunnerExecutionManifestHash } = await import('../lib/agents/learning-experiment-runner.ts')
const { createBudgetGuardedLearningRunnerExecutor } = await import('../lib/agents/learning-experiment-runner-invocation.ts')
const { aggregateLearningExperimentEvidence } = await import('../lib/agents/learning-experiment-runner-scoring.ts')

// Disposable in-memory canonical records only. No database, network, model call,
// policy admission, release, or prospective evidence write occurs in this suite.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const digest = value => runnerHash(value).slice(7)
const artifact = (ref, bytes) => ({ ref, bytes, hash: runnerHash(bytes) })
function planFixture(provenance = 'synthetic') {
  const policy = {
    policyId: 'logical-policy-fixture-v1', projectId: id(2), candidateId: id(3), agentKey: 'profiling_agent', skillKey: 'profile_evidence_analysis', mode: 'GUIDED',
    datasetVersionIds: [id(4)], datasetManifestId: id(5), baselineVersion: 'baseline-v1', candidateVersion: 'candidate-v2', rollbackRef: 'rollback-v1',
    evaluatorActorId: id(6), proposerActorId: id(7), rubricRef: 'rubric-v1', calibrationRef: 'calibration-v1', manifestHash: runnerHash('split-manifest'),
    lockedAt: '2026-10-01T00:00:00Z', primaryMetric: 'paired-pass-rate', analysisPlanRef: 'bounded-paired-v1', sampleSize: 2,
    minimumGain: .05, minimumScore: .8, budget: { totalCost: 1, perRunCost: .5, totalTokens: 100, perRunTokens: 50, latencyMs: 1000 },
  }
  const plan = { runId: id(8), policyRecordId: id(1), provenance, policy, baseline: artifact('baseline-artifact', '{"prompt":"baseline"}'), candidate: artifact('candidate-artifact', '{"prompt":"candidate"}'),
    cases: [0, 1].map(n => ({ caseKey: digest(`case-${n}`), datasetVersionId: id(4), split: 'held_out', input: artifact(`case-input-${n}`, JSON.stringify({ objective: n })) })), trainingCaseKeys: [] }
  return { ...plan, executionManifestHash: learningRunnerExecutionManifestHash(plan) }
}
function fixture(provenance = 'synthetic') {
  const plan = planFixture(provenance), events = [], claims = new Map(), canonical = new Map()
  const key = identity => [identity.projectId, identity.policyId, identity.runId, identity.caseKey, identity.arm].join(':')
  const state = { plan, events, claims, canonical, cancelled: false }
  const ports = {
    async loadServerPlan() { events.push('load'); return state.plan },
    async authorize(p) { events.push('authorize'); return { projectId: p.policy.projectId, policyId: p.policy.policyId, proposerActorId: p.policy.proposerActorId, evaluatorActorId: p.policy.evaluatorActorId,
      executeAllowed: true, evaluatorAllowed: true, independenceVerified: true, sourceRemediationAllowed: false } },
    store: {
      async isCancelled() { return state.cancelled },
      async claimDispatch(identity, inputHash) {
        events.push('claim'); const k = key(identity), old = claims.get(k)
        if (old) {
          assert.deepEqual(old.identity, identity, 'immutable claim identity')
          assert.equal(old.inputHash, inputHash, 'immutable claim input')
          return old.outcome ? { status: 'completed', outcome: structuredClone(old.outcome) } : { status: 'ambiguous' }
        }
        const claimId = randomUUID(); claims.set(k, { claimId, identity: structuredClone(identity), inputHash })
        return { status: 'acquired', claimId }
      },
      async completeDispatch(claimId, outcome) {
        events.push('complete'); const old = [...claims.values()].find(c => c.claimId === claimId)
        assert.ok(old); assert.deepEqual(old.identity, outcome.identity); assert.equal(old.inputHash, outcome.inputHash)
        assert.equal(old.outcome, undefined, 'terminal output cannot be overwritten')
        old.outcome = structuredClone(outcome)
      },
    },
    async execute(input) {
      events.push('execute')
      const outcome = { identity: structuredClone(input.identity), inputHash: input.input.hash, output: artifact(`output-${input.identity.caseKey}-${input.identity.arm}`, JSON.stringify({ objective: JSON.parse(input.input.bytes).objective, arm: input.identity.arm })),
        provenance: input.provenance, invocationId: randomUUID(), reservationId: null, settlementId: null, costEventId: null, costUsd: '0', tokens: 10, latencyMs: 1 }
      if (input.provenance === 'prospective') Object.assign(outcome, { reservationId: randomUUID(), settlementId: randomUUID(), costEventId: randomUUID(), costUsd: '0.002' })
      canonical.set(outcome.invocationId, structuredClone(outcome)); return outcome
    },
    async verifyCanonicalOutcome(outcome) { events.push('verify'); return JSON.stringify(canonical.get(outcome.invocationId)) === JSON.stringify(outcome) },
  }
  return { ...state, state, ports, run: (extra = {}) => runLearningExperiment({ runId: id(8), ports, dispatch: true, ...extra }) }
}
const count = (f, name) => f.events.filter(event => event === name).length
function reseal(plan) { plan.executionManifestHash = learningRunnerExecutionManifestHash(plan) }
let assertions = 0
async function stoppedBeforeExecution(mutate, expectedReason) {
  const f = fixture(); mutate(f); const result = await f.run()
  assert.equal(result.status, 'STOPPED'); if (expectedReason) assert.match(result.reason, expectedReason)
  assert.equal(count(f, 'execute'), 0); assert.equal(result.automaticPromotionAllowed, false); assertions++
}
{
  const f = fixture(), result = await f.run({ dispatch: undefined })
  assert.equal(result.status, 'PREPARED'); assert.equal(count(f, 'claim'), 0); assert.equal(count(f, 'execute'), 0); assertions++
}
for (const provenance of ['synthetic', 'prospective']) {
  const f = fixture(provenance), result = await f.run()
  assert.equal(result.status, 'COMPLETED'); assert.equal(result.outcomes.length, 4); assert.equal(count(f, 'execute'), 4)
  assert.equal(result.automaticPromotionAllowed, false)
  assert.equal(new Set(result.outcomes.map(o => `${o.identity.caseKey}:${o.identity.arm}`)).size, 4)
  const repeated = await f.run(); assert.equal(repeated.status, 'COMPLETED'); assert.equal(count(f, 'execute'), 4)
  assert.deepEqual(repeated.outcomes, result.outcomes); assertions++
}
for (const mutate of [
  f => { f.plan.runId = id(99); reseal(f.plan) },
  f => { f.plan.policy.projectId = 'wrong-project'; reseal(f.plan) },
  f => { f.plan.policy.candidateVersion = f.plan.policy.baselineVersion; reseal(f.plan) },
  f => { f.plan.baseline.bytes = 'corrupted' },
  f => { f.plan.candidate.hash = runnerHash('wrong executable'); reseal(f.plan) },
  f => { f.plan.cases[0].input.bytes = 'corrupted' },
  f => { f.plan.cases[0].datasetVersionId = id(99); reseal(f.plan) },
  f => { f.plan.cases[0].split = 'training'; reseal(f.plan) },
  f => { f.plan.cases[0].caseKey = 'not-a-case-hash'; reseal(f.plan) },
  f => { f.plan.cases[1].caseKey = f.plan.cases[0].caseKey; reseal(f.plan) },
  f => { f.plan.cases[1].input.ref = f.plan.cases[0].input.ref; reseal(f.plan) },
  f => { f.plan.trainingCaseKeys = [f.plan.cases[0].caseKey]; reseal(f.plan) },
  f => { f.plan.cases.pop(); reseal(f.plan) },
  f => { f.plan.executionManifestHash = runnerHash('different manifest') },
  f => { f.plan.provenance = 'unknown'; reseal(f.plan) },
]) await stoppedBeforeExecution(mutate)
for (const change of [{ executeAllowed: false }, { evaluatorAllowed: false }, { independenceVerified: false }, { sourceRemediationAllowed: true }, { projectId: id(99) }, { policyId: id(99) }, { evaluatorActorId: id(99) }, { proposerActorId: id(99) }]) {
  await stoppedBeforeExecution(f => { const authorize = f.ports.authorize; f.ports.authorize = async p => ({ ...await authorize(p), ...change }) }, /AUTHORIZATION_DENIED/)
}
await stoppedBeforeExecution(f => { f.plan.policy.evaluatorActorId = f.plan.policy.proposerActorId; reseal(f.plan) }, /evaluator must differ/)
for (const status of ['ambiguous', 'cancelled', 'failed']) {
  const f = fixture(); f.ports.store.claimDispatch = async () => ({ status })
  const result = await f.run(); assert.equal(result.reason, `RUNNER_PRIOR_${status.toUpperCase()}`); assert.equal(count(f, 'execute'), 0); assertions++
}
for (const failurePoint of ['execute', 'verify', 'complete']) {
  const f = fixture()
  if (failurePoint === 'execute') f.ports.execute = async () => { f.events.push('execute'); throw new Error('transport outcome unknown') }
  if (failurePoint === 'verify') f.ports.verifyCanonicalOutcome = async () => false
  if (failurePoint === 'complete') f.ports.store.completeDispatch = async () => { throw new Error('persistence unavailable') }
  const first = await f.run(); assert.equal(first.status, 'STOPPED'); assert.equal(count(f, 'execute'), 1)
  const second = await f.run(); assert.equal(second.reason, 'RUNNER_PRIOR_AMBIGUOUS'); assert.equal(count(f, 'execute'), 1); assertions++
}
for (const mutation of [
  outcome => { outcome.identity.projectId = id(99) }, outcome => { outcome.identity.caseKey = digest('other case') },
  outcome => { outcome.identity.arm = 'candidate' }, outcome => { outcome.identity.artifactHash = runnerHash('other-version') },
  outcome => { outcome.inputHash = runnerHash('other-input') }, outcome => { outcome.output.bytes = 'tampered' },
  outcome => { outcome.tokens = -1 }, outcome => { outcome.costUsd = 'NaN' }, outcome => { outcome.provenance = 'prospective' },
  outcome => { outcome.costEventId = id(99) },
]) {
  const f = fixture(), execute = f.ports.execute
  f.ports.execute = async input => { const outcome = await execute(input); mutation(outcome); return outcome }
  const result = await f.run(); assert.equal(result.status, 'STOPPED'); assert.equal(count(f, 'complete'), 0); assertions++
}
{
  const f = fixture('prospective'), execute = f.ports.execute
  f.ports.execute = async input => ({ ...await execute(input), costEventId: null })
  const result = await f.run(); assert.match(result.reason, /ACCOUNTING_MISSING/); assert.equal(count(f, 'complete'), 0); assertions++
}
{
  const f = fixture('prospective'), execute = f.ports.execute
  f.ports.execute = async input => ({ ...await execute(input), costEventId: id(99) })
  const result = await f.run(); assert.match(result.reason, /CANONICAL_EVIDENCE_INVALID/); assert.equal(count(f, 'complete'), 0); assertions++
}
{
  const f = fixture(); f.state.cancelled = true
  const result = await f.run(); assert.equal(result.status, 'CANCELLED'); assert.equal(count(f, 'claim'), 0); assertions++
}
{
  const f = fixture(), claim = f.ports.store.claimDispatch
  f.ports.store.claimDispatch = async (...args) => { const result = await claim(...args); f.state.cancelled = true; return result }
  const result = await f.run(); assert.equal(result.reason, 'RUNNER_CANCELLED_AFTER_CLAIM'); assert.equal(count(f, 'execute'), 0)
  f.state.cancelled = false; assert.equal((await f.run()).reason, 'RUNNER_PRIOR_AMBIGUOUS'); assertions++
}
{
  const f = fixture(), execute = f.ports.execute
  f.ports.execute = async input => { const outcome = await execute(input); f.state.cancelled = true; return outcome }
  const result = await f.run(); assert.equal(result.status, 'CANCELLED'); assert.equal(result.outcomes.length, 1); assert.equal(count(f, 'complete'), 1); assertions++
}
{
  const f = fixture(), controller = new AbortController(); controller.abort()
  const result = await f.run({ signal: controller.signal }); assert.equal(result.status, 'CANCELLED'); assert.equal(count(f, 'execute'), 0); assertions++
}
{
  const f = fixture(), authorize = f.ports.authorize
  f.ports.authorize = async p => ({ ...await authorize(p), executeAllowed: count(f, 'authorize') < 3 })
  const result = await f.run(); assert.match(result.reason, /AUTHORIZATION_DENIED/); assert.equal(count(f, 'execute'), 0)
  f.ports.authorize = authorize; assert.equal((await f.run()).reason, 'RUNNER_PRIOR_AMBIGUOUS'); assertions++
}

for (const accountingKey of ['invocationId', 'reservationId', 'settlementId', 'costEventId']) {
  const f = fixture('prospective'), execute = f.ports.execute
  let first
  f.ports.execute = async input => {
    const outcome = await execute(input)
    if (!first) first = structuredClone(outcome)
    else { outcome[accountingKey] = first[accountingKey]; f.canonical.set(outcome.invocationId, structuredClone(outcome)) }
    return outcome
  }
  const result = await f.run(); assert.match(result.reason, /DUPLICATE_EVIDENCE/); assert.equal(count(f, 'complete'), 1); assertions++
}
{
  const f = fixture(); assert.equal((await f.run()).status, 'COMPLETED')
  f.plan.policy.rubricRef = 'changed-after-dispatch'; reseal(f.plan)
  const result = await f.run(); assert.equal(result.status, 'STOPPED'); assert.equal(count(f, 'execute'), 4); assertions++
}
{
  const f = fixture(), authorize = f.ports.authorize
  f.ports.authorize = async plan => {
    assert.ok(Object.isFrozen(plan)); assert.ok(Object.isFrozen(plan.cases[0].input))
    f.plan.candidate.bytes = 'outside mutation after immutable snapshot'
    return authorize(plan)
  }
  const result = await f.run(); assert.equal(result.status, 'COMPLETED'); assertions++
}

function scoringFixture(synthetic = false) {
  const policy = planFixture().policy, experimentId = id(8), expectedCaseKeys = [digest('case-0'), digest('case-1')]
  const arms = expectedCaseKeys.flatMap((caseKey, n) => ['BASELINE', 'CANDIDATE'].map((arm, index) => ({
    experimentId, policyRecordId: id(1), projectId: policy.projectId, policyId: policy.policyId, candidateId: policy.candidateId, caseKey, arm,
    version: arm === 'BASELINE' ? policy.baselineVersion : policy.candidateVersion, manifestHash: policy.manifestHash,
    inputHash: runnerHash(`input-${n}`), outputHash: runnerHash(`output-${n}-${arm}`), attemptId: id(100 + n * 2 + index), evidenceId: id(200 + n * 2 + index), evidenceHash: runnerHash(`evidence-${n}-${arm}`),
    evaluatorActorId: policy.evaluatorActorId, rubricRef: policy.rubricRef, calibrationRef: policy.calibrationRef,
    observedAt: '2026-10-01T00:02:00Z', score: arm === 'BASELINE' ? .6 : .9, authorityViolations: 0, safetyFailures: 0, synthetic,
  })))
  const settlements = arms.map((arm, index) => ({ experimentId, policyRecordId: id(1), projectId: policy.projectId, policyId: policy.policyId, candidateId: policy.candidateId,
    caseKey: arm.caseKey, arm: arm.arm, version: arm.version, inputHash: arm.inputHash, outputHash: arm.outputHash, synthetic,
    attemptId: arm.attemptId, settlementId: synthetic ? null : id(300 + index), costEventId: synthetic ? null : id(400 + index), status: 'COMPLETED', actualCost: synthetic ? 0 : .01, actualTokens: 10,
    latencyMs: 5, startedAt: '2026-10-01T00:00:30Z', settledAt: '2026-10-01T00:01:00Z', authorityViolations: 0, safetyFailures: 0 }))
  return { policy, policyRecordId: id(1), experimentId, expectedCaseKeys, arms, settlements, analysisPlan: { ref: policy.analysisPlanRef, method: 'PAIRED_BOUNDED_HOEFFDING', confidence: .95, confirmationWindowMs: 60_000, independentCaseUnits: true }, now: '2026-10-01T00:03:00Z' }
}
{
  const input = scoringFixture(), output = aggregateLearningExperimentEvidence(input)
  assert.equal(output.result.sampleCount, 2); assert.equal(output.result.baselineScore, .6); assert.equal(output.result.candidateScore, .9)
  assert.equal(output.result.maxLatencyMs, 30_000); assert.equal(output.result.totalTokens, 40); assert.equal(output.result.totalCost, .04); assert.equal(output.prospectiveWriteAllowed, false); assert.equal(output.result.independentlyVerified, false); assert.equal(output.result.maxRunTokens, 40)
  const expectedLower = Math.max(-1, .9 - .6 - Math.sqrt(2 * Math.log(1 / .05) / 2))
  assert.ok(Math.abs(output.result.gainLowerConfidenceBound - expectedLower) < 1e-12)
  assert.deepEqual(aggregateLearningExperimentEvidence(structuredClone(input)), output)
  assert.equal(output.result.confirmationWindowPassed, false); input.now = '2026-10-01T00:02:30Z'; assert.equal(aggregateLearningExperimentEvidence(input).result.confirmationWindowPassed, false); assertions++
}
{
  const output = aggregateLearningExperimentEvidence(scoringFixture(true))
  assert.equal(output.prospectiveWriteAllowed, false); assert.equal(output.result.independentlyVerified, false); assertions++
}
{
  const input = scoringFixture(); input.settlements.push({ ...input.settlements[0], attemptId: id(900), settlementId: id(901), costEventId: id(902), status: 'CANCELLED', actualCost: .2, actualTokens: 3, safetyFailures: 1 })
  assert.throws(() => aggregateLearningExperimentEvidence(input), /inconclusive/); assertions++
}
{
  const input = scoringFixture()
  input.independentVerification = { experimentId: input.experimentId, projectId: input.policy.projectId, policyRecordId: input.policyRecordId,
    evaluatorActorId: input.policy.evaluatorActorId, rubricRef: input.policy.rubricRef, calibrationRef: input.policy.calibrationRef,
    evidenceHashesVerified: true, evaluatorAuthorized: true, allAttemptsLoaded: true }
  const verified = aggregateLearningExperimentEvidence(input)
  assert.equal(verified.result.independentlyVerified, true); assert.equal(verified.result.evidenceComplete, true)
  assert.equal(verified.prospectiveWriteAllowed, false); assert.equal(verified.result.confirmationWindowPassed, false)
  input.independentVerification.allAttemptsLoaded = false
  assert.equal(aggregateLearningExperimentEvidence(input).result.independentlyVerified, false); assertions++
}
{
  const input = scoringFixture()
  input.settlements[3].startedAt = '2026-10-01T00:00:59Z'
  input.settlements[3].settledAt = '2026-10-01T00:01:40Z'
  assert.equal(aggregateLearningExperimentEvidence(input).result.maxLatencyMs, 70_000)
  input.settlements[0].latencyMs = 80_000
  assert.equal(aggregateLearningExperimentEvidence(input).result.maxLatencyMs, 80_000); assertions++
}
for (const mutate of [
  x => { x.settlements[0].startedAt = undefined },
  x => { x.settlements[0].startedAt = 'invalid' },
  x => { x.settlements[0].startedAt = '2026-09-30T23:59:59Z' },
  x => { x.settlements[0].startedAt = '2026-10-01T00:01:01Z' },
  x => { for (const item of [...x.arms, ...x.settlements]) item.inputHash = x.arms[0].inputHash },
  x => { x.arms.pop() }, x => { x.settlements.pop() }, x => { x.expectedCaseKeys.push(x.expectedCaseKeys[0]) },
  x => { x.arms[1].inputHash = runnerHash('different paired replay'); x.settlements[1].inputHash = x.arms[1].inputHash },
  x => { x.arms[0].projectId = id(99) }, x => { x.arms[0].policyRecordId = id(99) }, x => { x.arms[0].inputHash = runnerHash('other input') }, x => { x.arms[0].outputHash = runnerHash('other output') }, x => { x.arms[0].caseKey = digest('unexpected') }, x => { x.arms[0].arm = 'UNKNOWN' },
  x => { x.arms[0].version = 'unlocked-version' }, x => { x.arms[0].manifestHash = runnerHash('other manifest') },
  x => { x.arms[0].evaluatorActorId = x.policy.proposerActorId }, x => { x.arms[0].rubricRef = 'unlocked rubric' },
  x => { x.arms[0].calibrationRef = 'other calibration' }, x => { x.arms[0].evidenceHash = 'not a digest' },
  x => { x.arms[1].evidenceId = x.arms[0].evidenceId }, x => { x.arms[1].attemptId = x.arms[0].attemptId },
  x => { x.arms[0].score = 1.1 }, x => { x.arms[0].score = Number.NaN }, x => { x.arms[0].synthetic = true },
  x => { x.arms[0].observedAt = '2026-09-30T00:00:00Z' }, x => { x.arms[0].observedAt = '2026-10-02T00:00:00Z' },
  x => { x.settlements[0].status = 'CANCELLED' }, x => { x.settlements[0].status = 'UNKNOWN' }, x => { x.settlements[0].actualCost = -1 },
  x => { x.settlements[0].actualTokens = 1.5 }, x => { x.settlements[1].settlementId = x.settlements[0].settlementId },
  x => { x.settlements[1].costEventId = x.settlements[0].costEventId }, x => { x.settlements[0].projectId = id(99) },
  x => { x.analysisPlan.ref = 'unlocked-analysis' }, x => { x.analysisPlan.independentCaseUnits = false }, x => { x.analysisPlan.confidence = 1 },
]) {
  const input = scoringFixture(); mutate(input); assert.throws(() => aggregateLearningExperimentEvidence(input)); assertions++
}
function guardedFixture() {
  const events = [], receipts = new Map(), reservations = new Map(), records = new Map()
  const config = {
    provider: { id: 'fixture-provider', async generateJson(request) { events.push('provider'); assert.equal(request.allowFallback, false); assert.equal(request.maxOutputTokens, 8)
      return { provider: 'fixture-provider', model: 'fixture-model', result: { ok: true }, latencyMs: 1, usage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 }, providerRequestId: 'fixture-request' } } },
    expectedModelName: 'fixture-model', agentKey: 'profiling_agent', skillKey: 'profile_evidence_analysis', mode: 'GUIDED', baselineVersion: 'baseline-v1', candidateVersion: 'candidate-v2',
    async assertActivated() { events.push('activation') },
    quote: { async quote() { events.push('quote'); return { providerId: 'fixture-provider', modelName: 'fixture-model', pricingVersionId: id(600), currency: 'USD', maxOutputTokens: 8, totalTokensUpperBound: 20, costUsdUpperBound: '0.01' } } },
    admission: {
      async reserve(input) { events.push('reserve'); const reservationId = randomUUID(); reservations.set(reservationId, structuredClone(input)); return { admitted: true, reason: 'ADMITTED', reservationId, deadlineAt: new Date(Date.now() + 10000).toISOString() } },
      async reconcile(input) { events.push(['reconcile', input]); const reserved = reservations.get(input.reservationId)
        if (!input.accountingComplete) return { status: 'UNKNOWN' }
        const record = records.get(input.costEventId)
        receipts.set(input.reservationId, { id: randomUUID(), reservationId: input.reservationId, projectId: reserved.projectId, policyRecordId: reserved.policyId,
          candidateId: reserved.candidateId, runId: reserved.runId, invocationId: reserved.invocationId, costEventId: record.id, status: 'ACCOUNTED', tokens: record.totalTokens, costUsd: record.totalCost })
        return { status: 'ACCOUNTED' }
      },
    },
    costAccounting: { async recordInvocation(input) { events.push('accounting'); const record = { id: randomUUID(), invocationId: input.invocationId, projectId: input.projectId,
      executionCorrelationId: input.executionCorrelationId, providerRequestId: input.providerRequestId, providerId: input.providerId, modelName: input.modelName,
      inputTokens: input.usage?.inputTokens, outputTokens: input.usage?.outputTokens, totalTokens: input.usage?.totalTokens, pricingVersionId: id(600), currency: 'USD',
      inputCost: '0.001', outputCost: '0.001', totalCost: '0.002', accountingStatus: 'PRICED', observedAt: input.observedAt, recordedAt: input.observedAt }
      records.set(record.id, record); return record } },
    async loadSettlement(reservationId) { events.push('receipt'); return receipts.get(reservationId) ?? null },
  }
  const prompt = artifact('sealed-prompt', JSON.stringify({ format: 'reasoning_prompt_v1', agentKey: config.agentKey, skillKey: config.skillKey, version: config.baselineVersion, task: 'general', system: 'fixture instruction', maxOutputTokens: 8 }))
  const attempt = { identity: { projectId: id(2), policyId: id(1), candidateId: id(3), runId: id(8), caseKey: digest('case-0'), datasetVersionId: id(4), arm: 'baseline', attempt: 1, artifactHash: prompt.hash, executionManifestHash: runnerHash('sealed-fixture') },
    input: artifact('replay-input', '{"objective":0}'), executable: prompt, provenance: 'prospective' }
  return { config, attempt, events, reservations, records, receipts, execute: () => createBudgetGuardedLearningRunnerExecutor(config)(attempt) }
}
{
  const f = guardedFixture(), outcome = await f.execute()
  assert.equal(outcome.costUsd, '0.002'); assert.equal(outcome.tokens, 10)
  const record = f.records.get(outcome.costEventId), reserved = f.reservations.get(outcome.reservationId)
  assert.equal(outcome.invocationId, record.invocationId); assert.equal(reserved.invocationId, outcome.invocationId); assert.equal(reserved.runId, outcome.identity.runId)
  assert.equal(outcome.settlementId, f.receipts.get(outcome.reservationId).id); assert.equal(outcome.output.hash, runnerHash(outcome.output.bytes)); assertions++
}
for (const mutate of [
  f => { f.config.assertActivated = async () => { throw new Error('activation absent') } },
  f => { f.attempt.provenance = 'synthetic' },
  f => { f.config.quote = undefined },
  f => { f.config.quote.quote = async () => null },
  f => { f.attempt.executable = artifact('bad', '{}') },
  f => { const prompt = JSON.parse(f.attempt.executable.bytes); prompt.version = 'wrong-version'; f.attempt.executable = artifact('bad-version', JSON.stringify(prompt)) },
  f => { f.attempt.input = artifact('bad-replay', '[]') },
  f => { f.attempt.signal = AbortSignal.abort() },
]) {
  const f = guardedFixture(); mutate(f); await assert.rejects(f.execute()); assert.equal(f.events.includes('provider'), false); assertions++
}
for (const change of [{ projectId: id(99) }, { runId: id(99) }, { policyRecordId: id(99) }, { invocationId: id(99) }, { costEventId: id(99) }, { tokens: 11 }, { costUsd: '0.009' }, { status: 'UNKNOWN' }]) {
  const f = guardedFixture(), load = f.config.loadSettlement; f.config.loadSettlement = async id => ({ ...await load(id), ...change })
  await assert.rejects(f.execute(), /RECEIPT_MISMATCH/); assert.equal(f.events.filter(e => e === 'provider').length, 1); assertions++
}
for (const failure of ['provider', 'accounting']) {
  const f = guardedFixture()
  if (failure === 'provider') f.config.provider.generateJson = async () => { f.events.push('provider'); throw new Error('transport ambiguous') }
  else f.config.costAccounting.recordInvocation = async () => { throw new Error('accounting unavailable') }
  await assert.rejects(f.execute()); assert.equal(f.reservations.size, 1); assert.equal(f.receipts.size, 0)
  assert.equal(f.events.find(e => Array.isArray(e) && e[0] === 'reconcile')[1].accountingComplete, false); assertions++
}
{
  const f = fixture('prospective'), guarded = guardedFixture()
  for (const arm of ['baseline', 'candidate']) f.plan[arm] = artifact(`sealed-${arm}`, JSON.stringify({ format: 'reasoning_prompt_v1', agentKey: guarded.config.agentKey, skillKey: guarded.config.skillKey,
    version: arm === 'baseline' ? guarded.config.baselineVersion : guarded.config.candidateVersion, task: 'general', system: `fixture ${arm}`, maxOutputTokens: 8 }))
  reseal(f.plan)
  const execute = createBudgetGuardedLearningRunnerExecutor(guarded.config)
  f.ports.execute = async input => { const outcome = await execute(input); f.canonical.set(outcome.invocationId, structuredClone(outcome)); return outcome }
  const result = await f.run(); assert.equal(result.status, 'COMPLETED'); assert.equal(result.outcomes.length, 4)
  assert.equal(guarded.events.filter(e => e === 'provider').length, 4); assert.equal(guarded.reservations.size, 4); assert.equal(guarded.receipts.size, 4)
  assert.equal((await f.run()).status, 'COMPLETED'); assert.equal(guarded.events.filter(e => e === 'provider').length, 4); assertions++
}

console.log(`Learning experiment runner behavior passed (${assertions} scenarios, synthetic local records only)`)
