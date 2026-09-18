import assert from 'node:assert/strict'

import { decideProfilingStepResume, profilingRecoveryStartOrder } from '../lib/agents/profiling-checkpoint.ts'

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

assert.equal(profilingRecoveryStartOrder({ retry_stage: 'PROFILE_RUN' }), 1)
assert.equal(profilingRecoveryStartOrder({ retry_stage: 'SCHEMA_DISCOVERY' }), 1)
assert.equal(profilingRecoveryStartOrder({ retry_stage: 'PROFILE_COLUMNS' }), 1)
assert.equal(profilingRecoveryStartOrder({ retry_stage: 'METRIC_EXECUTION' }), 2)
assert.equal(profilingRecoveryStartOrder({ retry_stage: 'METRIC_PERSISTENCE' }), 2)
assert.equal(profilingRecoveryStartOrder({ retry_stage: 'FINDINGS_GENERATION' }), 3)
assert.equal(profilingRecoveryStartOrder({ retry_stage: 'QUALITY_SCORING' }), 3)
assert.equal(profilingRecoveryStartOrder({ retry_stage: 'GOVERNANCE_INSIGHTS' }), 3)
assert.equal(profilingRecoveryStartOrder({ retry_stage: 'GOVERNED_WORKFLOW' }), null)
assert.equal(profilingRecoveryStartOrder(null), null)

console.log('Profiling checkpoint resume tests passed.')
