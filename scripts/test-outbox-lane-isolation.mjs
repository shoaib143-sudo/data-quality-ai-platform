import assert from 'node:assert/strict'

import { runOutboxLane, skippedOutboxLane } from '../lib/orchestration/outbox-lane.ts'

let claimCalls = 0
let processCalls = 0
const healthy = await runOutboxLane('worker:healthy', 30, {
  claimEvents: async () => {
    claimCalls += 1
    return [{ id: 'event-1' }, { id: 'event-2' }]
  },
  processEvents: async (events) => {
    processCalls += 1
    return events.map((event) => ({ eventId: event.id, status: 'DONE' }))
  },
})
assert.equal(claimCalls, 1)
assert.equal(processCalls, 1)
assert.equal(healthy.degraded, false)
assert.equal(healthy.disposition, 'PROCESSED')
assert.equal(healthy.claimed, 2)
assert.equal(healthy.results.length, 2)
assert.equal(healthy.error, null)

processCalls = 0
const claimFailure = await runOutboxLane('worker:claim-failure', 30, {
  claimEvents: async () => {
    throw new Error('Gateway Timeout')
  },
  processEvents: async () => {
    processCalls += 1
    return []
  },
})
assert.equal(claimFailure.degraded, true)
assert.equal(claimFailure.disposition, 'CLAIM_FAILED_RETRY_LATER')
assert.equal(claimFailure.claimed, 0)
assert.deepEqual(claimFailure.results, [])
assert.equal(claimFailure.error, 'Gateway Timeout')
assert.equal(processCalls, 0, 'claim failure must not attempt processing')

claimCalls = 0
processCalls = 0
const processingFailure = await runOutboxLane('worker:processing-failure', 30, {
  claimEvents: async () => {
    claimCalls += 1
    return [{ id: 'event-3' }]
  },
  processEvents: async () => {
    processCalls += 1
    throw new Error('Unable to persist governance event failure: Gateway Timeout')
  },
})
assert.equal(claimCalls, 1)
assert.equal(processCalls, 1)
assert.equal(processingFailure.degraded, true)
assert.equal(processingFailure.disposition, 'PROCESSING_FAILED_RETRY_BY_OUTBOX_POLICY')
assert.equal(processingFailure.claimed, 1)
assert.deepEqual(processingFailure.results, [], 'transport failure must not fabricate per-event acknowledgements')

const boundedFailure = await runOutboxLane('worker:bounded', 30, {
  claimEvents: async () => {
    throw new Error('x'.repeat(800))
  },
  processEvents: async () => [],
})
assert.equal(boundedFailure.error?.length, 500, 'transport diagnostics must be bounded')

const unknownFailure = await runOutboxLane('worker:unknown', 30, {
  claimEvents: async () => {
    throw { reason: 'opaque transport failure' }
  },
  processEvents: async () => [],
})
assert.equal(unknownFailure.error, 'Governance event transport failed.')

const skipped = skippedOutboxLane()
assert.equal(skipped.degraded, true)
assert.equal(skipped.disposition, 'SKIPPED_AFTER_DEGRADATION')
assert.equal(skipped.claimed, 0)
assert.deepEqual(skipped.results, [])
assert.equal(skipped.error, null)

console.log('Outbox lane isolation unit, negative, and failure-case tests passed.')
