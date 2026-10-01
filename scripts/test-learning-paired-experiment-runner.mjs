import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { GovernedPairedLearningExperimentRunner } = await import('../lib/agents/governed-learning-experiment-runner.ts')

const h = c => `sha256:${c.repeat(64)}`
const cases = [
  {
    caseKey: 'a'.repeat(64), sourceCaseRef: 'case:a', inputArtifactRef: 'artifact:input:a', inputArtifactHash: h('1'),
    baselineExecutableArtifactRef: 'artifact:baseline', baselineExecutableArtifactHash: h('2'),
    candidateExecutableArtifactRef: 'artifact:candidate', candidateExecutableArtifactHash: h('3'),
    payload: { id: 'a' },
  },
  {
    caseKey: 'b'.repeat(64), sourceCaseRef: 'case:b', inputArtifactRef: 'artifact:input:b', inputArtifactHash: h('4'),
    baselineExecutableArtifactRef: 'artifact:baseline', baselineExecutableArtifactHash: h('2'),
    candidateExecutableArtifactRef: 'artifact:candidate', candidateExecutableArtifactHash: h('3'),
    payload: { id: 'b' },
  },
]

function memoryStore() {
  const state = { attempts: [], results: [], scores: [], createRuns: 0 }
  return {
    state,
    store: {
      async createRun() { state.createRuns += 1; return '11111111-1111-4111-8111-111111111111' },
      async prepareAttempt(input) {
        const item = {
          ...input,
          attemptId: `22222222-2222-4222-8222-${String(state.attempts.length + 1).padStart(12, '0')}`,
          executionCorrelationId: `33333333-3333-4333-8333-${String(state.attempts.length + 1).padStart(12, '0')}`,
          attemptNumber: 1,
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
      async recordCaseScore(input) {
        state.scores.push(input)
        return `55555555-5555-4555-8555-${String(state.scores.length).padStart(12, '0')}`
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
    projectId: 'project', policyRecordId: 'policy', candidateId: 'candidate', evidenceClass: 'SYNTHETIC',
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
    projectId: 'project', policyRecordId: 'policy', candidateId: 'candidate', evidenceClass: 'SYNTHETIC',
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
    projectId: 'project', policyRecordId: 'policy', candidateId: 'candidate', evidenceClass: 'SYNTHETIC',
    baselineVersion: 'v1', candidateVersion: 'v2', evaluatorActorId: 'reviewer', cases: invalid,
  }), /must differ/)
  assert.equal(mem.state.createRuns, 0)
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
  'synthetic experiment arm cannot bind paid runtime evidence',
  'live successful arm requires canonical accounted settlement',
  'baseline and candidate', // migration has separate arm/version constraints and result binding
  'derive_learning_experiment_summary',
  'bind_learning_experiment_decision',
  'synthetic experiment cannot bind a release-admission decision',
  'evaluation decision does not equal canonical experiment evidence',
]) assert.ok(migration.includes(invariant), `missing paired runner invariant: ${invariant}`)

const service = fs.readFileSync('lib/agents/governed-learning-evaluation-service.ts', 'utf8')
assert.match(service, /learning_experiment_decision_bindings/)
assert.match(service, /PROSPECTIVE_LIVE/)
assert.match(service, /exactly one canonical prospective experiment binding/)

console.log('Paired learning experiment runner stops on ambiguity, binds executable artifacts, segregates synthetic evidence, and requires canonical prospective release evidence.')
