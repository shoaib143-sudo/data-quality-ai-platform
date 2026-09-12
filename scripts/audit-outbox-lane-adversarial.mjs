import assert from 'node:assert/strict'

import { runOutboxLane, skippedOutboxLane } from '../lib/orchestration/outbox-lane.ts'

// Independent attack harness: transport failure before claim must not process, acknowledge, or leak payload state.
let processed = 0
const poisonedClaim = await runOutboxLane('adversary:claim', 30, {
  claimEvents: async () => {
    throw new Error(`Gateway Timeout ${'secret-marker'.repeat(80)}`)
  },
  processEvents: async () => {
    processed += 1
    return [{ status: 'DONE', payload: 'should-never-exist' }]
  },
})
assert.equal(processed, 0)
assert.equal(poisonedClaim.degraded, true)
assert.equal(poisonedClaim.disposition, 'CLAIM_FAILED_RETRY_LATER')
assert.equal(poisonedClaim.claimed, 0)
assert.deepEqual(poisonedClaim.results, [])
assert.ok((poisonedClaim.error?.length ?? 0) <= 500)
assert.equal(JSON.stringify(poisonedClaim.results).includes('should-never-exist'), false)

// Simulate a business side effect followed by authoritative persistence failure. The isolation layer must
// not invent DONE/RETRY/DEAD evidence, retry immediately, or invoke the processor more than once.
let claimCalls = 0
let processCalls = 0
let simulatedBusinessSideEffects = 0
const postSideEffectFailure = await runOutboxLane('adversary:processing', 30, {
  claimEvents: async () => {
    claimCalls += 1
    return [{ id: 'leased-event', payload: { authority: 'database' } }]
  },
  processEvents: async () => {
    processCalls += 1
    simulatedBusinessSideEffects += 1
    throw new Error('Unable to persist governance event failure: upstream connection reset')
  },
})
assert.equal(claimCalls, 1, 'a lane execution may claim at most once')
assert.equal(processCalls, 1, 'a transport failure must not cause an immediate in-process replay')
assert.equal(simulatedBusinessSideEffects, 1)
assert.equal(postSideEffectFailure.degraded, true)
assert.equal(postSideEffectFailure.disposition, 'PROCESSING_FAILED_RETRY_BY_OUTBOX_POLICY')
assert.equal(postSideEffectFailure.claimed, 1)
assert.deepEqual(postSideEffectFailure.results, [], 'no synthetic authoritative event status may be emitted')

// Once a caller fences the lane, the skip result is inert and cannot itself touch dependencies.
const fenced = skippedOutboxLane()
assert.equal(fenced.disposition, 'SKIPPED_AFTER_DEGRADATION')
assert.equal(fenced.claimed, 0)
assert.deepEqual(fenced.results, [])
assert.equal(fenced.error, null)

// Reordered failure classes must stay distinguishable for deterministic monitoring and recovery semantics.
const claimReset = await runOutboxLane('adversary:reset', 30, {
  claimEvents: async () => { throw new Error('connection reset') },
  processEvents: async () => [],
})
const persistenceTimeout = await runOutboxLane('adversary:persistence', 30, {
  claimEvents: async () => [{ id: 'event' }],
  processEvents: async () => { throw new Error('Gateway Timeout') },
})
assert.notEqual(claimReset.disposition, persistenceTimeout.disposition)
assert.equal(claimReset.results.length, 0)
assert.equal(persistenceTimeout.results.length, 0)

console.log('Independent adversarial outbox transport-isolation audit passed.')
