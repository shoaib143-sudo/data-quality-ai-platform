import assert from 'node:assert/strict'
import { executeWithReadFallback } from '../lib/data-plane/read-fallback.ts'

let fallbackCalls = 0
const primaryValue = await executeWithReadFallback({
  primary: async () => 'primary',
  fallback: async () => { fallbackCalls += 1; return 'fallback' },
  fallbackEnabled: true,
})
assert.equal(primaryValue, 'primary')
assert.equal(fallbackCalls, 0)

const fallbackValue = await executeWithReadFallback({
  primary: async () => { throw new Error('simulated provider outage') },
  fallback: async () => { fallbackCalls += 1; return 'fallback' },
  fallbackEnabled: true,
})
assert.equal(fallbackValue, 'fallback')
assert.equal(fallbackCalls, 1)

const transformed = await executeWithReadFallback({
  primary: async () => { throw new Error('simulated semantic provider outage') },
  fallback: async () => ({ provider: 'postgres', semanticStatus: 'AVAILABLE' }),
  fallbackEnabled: true,
  transformFallback: (value, error) => ({ ...value, semanticStatus: 'UNAVAILABLE', primaryError: error instanceof Error ? error.message : String(error) }),
})
assert.deepEqual(transformed, {
  provider: 'postgres',
  semanticStatus: 'UNAVAILABLE',
  primaryError: 'simulated semantic provider outage',
})

await assert.rejects(
  executeWithReadFallback({
    primary: async () => { throw new Error('primary failure must surface') },
    fallback: async () => 'should-not-run',
    fallbackEnabled: false,
  }),
  /primary failure must surface/,
)

await assert.rejects(
  executeWithReadFallback({
    primary: async () => { throw new Error('primary unavailable') },
    fallback: async () => { throw new Error('fallback unavailable') },
    fallbackEnabled: true,
  }),
  /fallback unavailable/,
)

console.log('Provider read fallback behavior verified.')
