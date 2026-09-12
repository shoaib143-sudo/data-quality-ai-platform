import assert from 'node:assert/strict'

import {
  assessPoolClaimOutcomes,
  assessStaleReleaseFailure,
  formatPoolClaimFailures,
} from '../lib/orchestration/pool-claim-policy.ts'

const healthy = assessPoolClaimOutcomes([
  { pool: 'CORE', succeeded: true },
  { pool: 'SEMANTIC', succeeded: true },
  { pool: 'GOVERNANCE', succeeded: true },
])
assert.equal(healthy.successfulPoolCount, 3)
assert.equal(healthy.allPoolsFailed, false)
assert.deepEqual(healthy.failures, [])

const partial = assessPoolClaimOutcomes([
  { pool: 'CORE', succeeded: true },
  { pool: 'SEMANTIC', succeeded: false, error: 'Gateway Timeout' },
  { pool: 'GOVERNANCE', succeeded: true },
])
assert.equal(partial.successfulPoolCount, 2)
assert.equal(partial.allPoolsFailed, false, 'one failed pool must not fail healthy pools')
assert.deepEqual(partial.failures, [{ pool: 'SEMANTIC', error: 'Gateway Timeout' }])

const firstPoolFailed = assessPoolClaimOutcomes([
  { pool: 'CORE', succeeded: false, error: 'connection reset' },
  { pool: 'SEMANTIC', succeeded: true },
  { pool: 'GOVERNANCE', succeeded: true },
])
assert.equal(firstPoolFailed.allPoolsFailed, false, 'later healthy pools must remain serviceable')

const lastPoolFailed = assessPoolClaimOutcomes([
  { pool: 'CORE', succeeded: true },
  { pool: 'SEMANTIC', succeeded: true },
  { pool: 'GOVERNANCE', succeeded: false, error: 'upstream unavailable' },
])
assert.equal(lastPoolFailed.allPoolsFailed, false, 'earlier claimed work must not be discarded by a later pool failure')

const allFailed = assessPoolClaimOutcomes([
  { pool: 'CORE', succeeded: false, error: 'timeout' },
  { pool: 'SEMANTIC', succeeded: false, error: 'timeout' },
  { pool: 'GOVERNANCE', succeeded: false, error: 'timeout' },
])
assert.equal(allFailed.successfulPoolCount, 0)
assert.equal(allFailed.allPoolsFailed, true, 'complete pool unavailability must fail closed')
assert.equal(formatPoolClaimFailures(allFailed.failures), 'CORE: timeout; SEMANTIC: timeout; GOVERNANCE: timeout')

const zeroJobSuccessfulPool = assessPoolClaimOutcomes([
  { pool: 'CORE', succeeded: true },
  { pool: 'SEMANTIC', succeeded: false, error: 'Gateway Timeout' },
])
assert.equal(zeroJobSuccessfulPool.allPoolsFailed, false, 'a successful empty pool probe still proves the queue substrate is partially available')

const longError = 'x'.repeat(800)
const bounded = assessPoolClaimOutcomes([{ pool: 'SEMANTIC', succeeded: false, error: longError }])
assert.equal(bounded.failures[0].error.length, 500, 'persisted failure evidence must be bounded')

const staleReleaseWithQueuedOnlyClaims = assessStaleReleaseFailure('Gateway Timeout', ['QUEUED'])
assert.equal(staleReleaseWithQueuedOnlyClaims.canContinueClaiming, true, 'stale RUNNING work stays fenced when only QUEUED rows are claimable')
assert.equal(staleReleaseWithQueuedOnlyClaims.disposition, 'STALE_RUNNING_LEFT_FENCED_FOR_RETRY')

const staleReleaseWithRunningClaims = assessStaleReleaseFailure('Gateway Timeout', ['QUEUED', 'RUNNING'])
assert.equal(staleReleaseWithRunningClaims.canContinueClaiming, false, 'cleanup failure must fail closed if RUNNING rows could be reclaimed by the claim path')
assert.equal(staleReleaseWithRunningClaims.disposition, 'FAIL_CLOSED')

const boundedRelease = assessStaleReleaseFailure('y'.repeat(800), ['QUEUED'])
assert.equal(boundedRelease.error.length, 500, 'stale-release failure evidence must be bounded')

console.log('Durable workload-pool claim isolation and stale-release safety unit tests passed.')
