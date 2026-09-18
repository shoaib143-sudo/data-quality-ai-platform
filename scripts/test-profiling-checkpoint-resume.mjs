import assert from 'node:assert/strict'

import { decideProfilingStepResume } from '../lib/agents/profiling-checkpoint.ts'

const succeeded = decideProfilingStepResume({
  id: 'step-profile',
  status: 'SUCCEEDED',
  attempt: 1,
  output: { datasetVersionId: 'version-1', rowCount: 10 },
})
assert.deepEqual(succeeded, {
  mode: 'REUSE',
  id: 'step-profile',
  attempt: 1,
  output: { datasetVersionId: 'version-1', rowCount: 10 },
})

const failed = decideProfilingStepResume({
  id: 'step-metrics',
  status: 'FAILED',
  attempt: 2,
  output: { stale: true },
})
assert.deepEqual(failed, {
  mode: 'RESTART',
  id: 'step-metrics',
  nextAttempt: 3,
})

const running = decideProfilingStepResume({
  id: 'step-investigation',
  status: 'RUNNING',
  attempt: null,
  output: null,
})
assert.deepEqual(running, {
  mode: 'RESTART',
  id: 'step-investigation',
  nextAttempt: 2,
})

const malformedOutput = decideProfilingStepResume({
  id: 'step-profile',
  status: 'SUCCEEDED',
  attempt: 4,
  output: ['not', 'an', 'object'],
})
assert.deepEqual(malformedOutput, {
  mode: 'REUSE',
  id: 'step-profile',
  attempt: 4,
  output: {},
})

console.log('Profiling checkpoint resume tests passed.')
