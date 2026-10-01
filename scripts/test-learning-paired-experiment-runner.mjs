import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { GovernedPairedLearningExperimentRunner } = await import('../lib/agents/governed-learning-experiment-runner.ts')

const h = c => `sha256:${c.repeat(64)}`
const cases = [
  {
    caseKey: 'a'.repeat(64), inputArtifactRef: 'artifact:input:a', inputArtifactHash: h('1'),
    baselineExecutableArtifactRef: 'artifact:baseline', baselineExecutableArtifactHash: h('2'),
    candidateExecutableArtifactRef: 'artifact:candidate', candidateExecutableArtifactHash: h('3'),
    payload: { id: 'a' },
  },
  {
    caseKey: 'b'.repeat(64), inputArtifactRef: 'artifact:input:b', inputArtifactHash: h('4'),
    baselineExecutableArtifactRef: 'artifact:baseline', baselineExecutableArtifactHash: h('2'),
    candidateExecutableArtifactRef: 'artifact:candidate', candidateExecutableArtifactHash: h('3'),
    payload: { id: 'b' },
  },
]

function memoryStore() {
  const state = { attempts: [], results: [], scores: [], createRuns: 0, runId: '11111111-1111-4111-8111-111111111111' }
  return {
    state,
    store: {
      async createRun() { state.createRuns += 1; return state.runId },
      async prepareAttempt(input) {
        const existing = state.attempts.find(x => x.attemptKey === input.attemptKey)
        if (existing) {
          const terminal = state.results.find(x => x.attemptId === existing.attemptId)
          if (!terminal) throw new Error('ambiguous existing experiment attempt has no terminal evidence')
          return {
            ...existing,
            sourceCaseRef: existing.sourceCaseRef ?? `manifest:${input.caseKey}`,
            reused: true,
            terminalResultId: terminal.id,
            terminalStatus: terminal.execution.terminalStatus,
          }
        }
        const item = {
          ...input,
          attemptId: `22222222-2222-4222-8222-${String(state.attempts.length + 1).padStart(12, '0')}`,
          executionCorrelationId: `33333333-3333-4333-8333-${String(state.attempts.length + 1).padStart(12, '0')}`,
          attemptNumber: 1,
          sourceCaseRef: `manifest:${input.caseKey}`,
          reused: false,
        }
        state.attempts.push(item)
        return item
      },
      async recordArmResult(input) {
        const id = `44444444-4444-4444-8444-${String(state.results.length + 1).padStart(12, '0')}`
        state.results.push({ ...input, id })
        return id
      },
      async findCaseScore(input) {
        const existing = state.scores.find(x => x.runId === input.runId && x.caseKey === input.caseKey)
        return existing?.id ?? null
      },
      async recordCaseScore(input) {
        const id = `55555555-5555-4555-8555-${String(state.scores.length + 1).padStart(12, '0')}`
        state.scores.push({ ...input, id })
        return id
      },
      async deriveSummary({ runId }) {
        const succeeded = state.results.filter(x => x.execution.terminalStatus === 'SUCCEEDED')
        const failed = state.results.filter(x => x.execution.terminalStatus !== 'SUCCEEDED')
        const baseline = state.scores.length ? state.scores.reduce((n,x)=>n+x.score.baselineScore,0)/state.scores.length : null
        const candidate = state.scores.length ? state.scores.reduce((n,x)=>n+x.score.candidateScore,0)/state.scores.length : null
        return {
          runId, evidenceClass: 'SYNTHETIC', caseCount: cases.length, scoredCaseCount: state.scores.length,
          complete: state.scores.length === cases.length && failed.length === 0,
          allIndependentlyVerified: state.scores.length > 0 && state.scores.every(x=>x.score.independentlyVerified),
          baselineScore: baseline, candidateScore: candidate,
          authorityViolations: state.scores.filter(x=>x.score.authorityViolation).length,
          safetyFailures: state.scores.filter(x=>x.score.safetyFailure).length,
          accountingComplete: true, totalCost: 0, maxRunCost: 0, totalTokens: 0, maxRunTokens: 0,
          maxLatencyMs: succeeded.length ? Math.max(...succeeded.map(x=>x.execution.observedLatencyMs ?? 0)) : 0,
        }
      },
    },
  }
}

{
  const mem = memoryStore()
  let executeCalls = 0
  let scoreCalls = 0
  const runner = new GovernedPairedLearningExperimentRunner(mem.store, {
    async execute(input) {
      executeCalls += 1
      assert.match(input.executableArtifactHash, /^sha256:/)
      return {
        terminalStatus: 'SUCCEEDED',
        outputArtifactRef: `artifact:output:${input.caseKey}:${input.arm}`,
        outputArtifactHash: input.arm === 'BASELINE' ? h('5') : h('6'),
        observedLatencyMs: 10,
      }
    },
  }, {
    async score() {
      scoreCalls += 1
      return {
        baselineScore: 0.7, candidateScore: 0.9, independentlyVerified: true,
        authorityViolation: false, safetyFailure: false, evaluatorType: 'DETERMINISTIC',
        rubricRef: 'rubric:1', calibrationRef: 'calibration:1', observedAt: '2026-10-02T00:00:00Z',
      }
    },
  })
  const summary = await runner.run({
    projectId: 'project', policyRecordId: 'policy', candidateId: 'candidate', runKey: 'synthetic-run-1', evidenceClass: 'SYNTHETIC',
    baselineVersion: 'v1', candidateVersion: 'v2', evaluatorActorId: 'reviewer', cases,
  })
  assert.equal(summary.complete, true)
  assert.equal(summary.allIndependentlyVerified, true)
  assert.equal(executeCalls, 4)
  assert.equal(scoreCalls, 2)
  assert.equal(mem.state.attempts.length, 4)
  assert.equal(mem.state.results.length, 4)
  assert.equal(mem.state.scores.length, 2)
}

{
  const mem = memoryStore()
  let executeCalls = 0
  let scoreCalls = 0
  const runner = new GovernedPairedLearningExperimentRunner(mem.store, {
    async execute() {
      executeCalls += 1
      throw new Error('provider result ambiguous after dispatch')
    },
  }, {
    async score() { scoreCalls += 1; throw new Error('must not score failed arms') },
  })
  const summary = await runner.run({
    projectId: 'project', policyRecordId: 'policy', candidateId: 'candidate', runKey: 'synthetic-run-1', evidenceClass: 'SYNTHETIC',
    baselineVersion: 'v1', candidateVersion: 'v2', evaluatorActorId: 'reviewer', cases,
  })
  assert.equal(summary.complete, false)
  assert.equal(executeCalls, 1)
  assert.equal(scoreCalls, 0)
  assert.equal(mem.state.results[0].execution.terminalStatus, 'UNKNOWN')
}

{
  const mem = memoryStore()
  const runner = new GovernedPairedLearningExperimentRunner(mem.store, { async execute() { throw new Error('unreachable') } }, { async score() { throw new Error('unreachable') } })
  const invalid = [{ ...cases[0], candidateExecutableArtifactHash: cases[0].baselineExecutableArtifactHash }]
  await assert.rejects(() => runner.run({
    projectId: 'project', policyRecordId: 'policy', candidateId: 'candidate', runKey: 'synthetic-run-1', evidenceClass: 'SYNTHETIC',
    baselineVersion: 'v1', candidateVersion: 'v2', evaluatorActorId: 'reviewer', cases: invalid,
  }), /must differ/)
  assert.equal(mem.state.createRuns, 0)
}


{
  const mem = memoryStore()
  let executeCalls = 0
  let scoreCalls = 0
  const runner = new GovernedPairedLearningExperimentRunner(mem.store, {
    async execute(input) {
      executeCalls += 1
      return {
        terminalStatus: 'SUCCEEDED',
        outputArtifactRef: `artifact:resume:${input.caseKey}:${input.arm}`,
        outputArtifactHash: input.arm === 'BASELINE' ? h('7') : h('8'),
        observedLatencyMs: 5,
      }
    },
  }, {
    async score() {
      scoreCalls += 1
      return {
        baselineScore: 0.6, candidateScore: 0.8, independentlyVerified: true,
        authorityViolation: false, safetyFailure: false, evaluatorType: 'DETERMINISTIC',
        rubricRef: 'rubric:1', calibrationRef: 'calibration:1', observedAt: '2026-10-02T00:00:00Z',
      }
    },
  })
  const request = {
    projectId: 'project', policyRecordId: 'policy', candidateId: 'candidate',
    runKey: 'restart-safe-run', evidenceClass: 'SYNTHETIC',
    baselineVersion: 'v1', candidateVersion: 'v2', evaluatorActorId: 'reviewer', cases,
  }
  assert.equal((await runner.run(request)).complete, true)
  const firstExecuteCalls = executeCalls
  const firstScoreCalls = scoreCalls
  assert.equal((await runner.run(request)).complete, true)
  assert.equal(executeCalls, firstExecuteCalls, 'restart must reuse terminal arm results without provider redispatch')
  assert.equal(scoreCalls, firstScoreCalls, 'restart must reuse existing case scores without rescoring')
}

{
  const mem = memoryStore()
  mem.state.attempts.push({
    projectId: 'project', runId: mem.state.runId, caseKey: cases[0].caseKey, arm: 'BASELINE',
    version: 'v1', attemptKey: `${cases[0].caseKey}:BASELINE:1`,
    executableArtifactRef: cases[0].baselineExecutableArtifactRef,
    executableArtifactHash: cases[0].baselineExecutableArtifactHash,
    inputArtifactRef: cases[0].inputArtifactRef, inputArtifactHash: cases[0].inputArtifactHash,
    attemptId: '99999999-9999-4999-8999-999999999999',
    executionCorrelationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    attemptNumber: 1, reused: false,
  })
  let executeCalls = 0
  const runner = new GovernedPairedLearningExperimentRunner(mem.store, {
    async execute() { executeCalls += 1; throw new Error('must not redispatch ambiguous attempt') },
  }, { async score() { throw new Error('unreachable') } })
  await assert.rejects(() => runner.run({
    projectId: 'project', policyRecordId: 'policy', candidateId: 'candidate',
    runKey: 'restart-safe-run', evidenceClass: 'SYNTHETIC',
    baselineVersion: 'v1', candidateVersion: 'v2', evaluatorActorId: 'reviewer', cases,
  }), /ambiguous existing experiment attempt has no terminal evidence/)
  assert.equal(executeCalls, 0)
}

const migration = fs.readFileSync('supabase/migrations/20261002023000_learning_paired_experiment_runner.sql', 'utf8')
for (const invariant of [
  'learning_experiment_runs',
  'learning_experiment_run_cases',
  'learning_experiment_arm_attempts',
  'learning_experiment_arm_results',
  'learning_experiment_case_scores',
  'learning_experiment_decision_bindings',
  'ambiguous prior experiment attempt has no terminal evidence',
  'ambiguous existing experiment attempt has no terminal evidence',
  'experiment run key reuse does not match immutable run identity',
  'experiment run key reuse does not match immutable case set',
  'synthetic experiment arm cannot bind paid runtime evidence',
  'live successful arm requires canonical accounted settlement',
  'live successful arm requires exactly one canonical budget reservation',
  'baseline successful result not found',
  'candidate successful result not found',
  'case score arm/result binding mismatch',
  'derive_learning_experiment_summary',
  'bind_learning_experiment_decision',
  'synthetic experiment cannot bind a release-admission decision',
  'evaluation decision does not equal canonical experiment evidence',
]) assert.ok(migration.includes(invariant), `missing paired runner invariant: ${invariant}`)


for (const singleton of [
  'create table if not exists agent.learning_experiment_runs',
  'create table if not exists agent.learning_experiment_decision_bindings',
  'create or replace function agent.create_learning_experiment_run',
  'create or replace function agent.prepare_learning_experiment_arm_attempt',
  'create or replace function agent.record_learning_experiment_arm_result',
  'create or replace function agent.record_learning_experiment_case_score',
  'create or replace function agent.derive_learning_experiment_summary',
  'create or replace function agent.bind_learning_experiment_decision',
]) {
  assert.equal(migration.split(singleton).length - 1, 1, `migration must contain exactly one canonical definition for: ${singleton}`)
}

const service = fs.readFileSync('lib/agents/governed-learning-evaluation-service.ts', 'utf8')
assert.match(service, /learning_experiment_decision_bindings/)
assert.match(service, /PROSPECTIVE_LIVE/)
assert.match(service, /exactly one canonical prospective experiment binding/)

console.log('Paired learning experiment runner stops on ambiguity, binds executable artifacts, segregates synthetic evidence, and requires canonical prospective release evidence.')
