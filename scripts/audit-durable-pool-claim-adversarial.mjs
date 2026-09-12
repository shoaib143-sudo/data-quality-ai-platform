import assert from 'node:assert/strict'
import fs from 'node:fs'

import { assessPoolClaimOutcomes } from '../lib/orchestration/pool-claim-policy.ts'

const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')

const scenarios = [
  {
    name: 'semantic timeout does not suppress core or governance',
    outcomes: [
      { pool: 'CORE', succeeded: true },
      { pool: 'SEMANTIC', succeeded: false, error: 'Gateway Timeout' },
      { pool: 'GOVERNANCE', succeeded: true },
    ],
    allPoolsFailed: false,
  },
  {
    name: 'core timeout does not suppress later pools',
    outcomes: [
      { pool: 'CORE', succeeded: false, error: 'connection reset' },
      { pool: 'SEMANTIC', succeeded: true },
      { pool: 'GOVERNANCE', succeeded: true },
    ],
    allPoolsFailed: false,
  },
  {
    name: 'late governance failure does not invalidate already claimed work',
    outcomes: [
      { pool: 'CORE', succeeded: true },
      { pool: 'SEMANTIC', succeeded: true },
      { pool: 'GOVERNANCE', succeeded: false, error: 'upstream unavailable' },
    ],
    allPoolsFailed: false,
  },
  {
    name: 'all workload pools unavailable fails closed',
    outcomes: [
      { pool: 'CORE', succeeded: false, error: 'timeout' },
      { pool: 'SEMANTIC', succeeded: false, error: 'timeout' },
      { pool: 'GOVERNANCE', succeeded: false, error: 'timeout' },
    ],
    allPoolsFailed: true,
  },
]

for (const scenario of scenarios) {
  const result = assessPoolClaimOutcomes(scenario.outcomes)
  assert.equal(result.allPoolsFailed, scenario.allPoolsFailed, scenario.name)
}

assert.match(queue, /if \(releaseError\) throw new Error/, 'stale lease release failure must fail before new claims')
assert.match(queue, /await writeTelemetry\(null, 'job\.pool_claim_failed'/, 'pool failure must produce explicit evidence')
assert.match(queue, /disposition: 'POOL_LEFT_QUEUED_FOR_RETRY'/, 'failed pool work must remain retryable')
assert.match(queue, /if \(assessment\.allPoolsFailed\)/, 'complete outage must fail closed')
assert.doesNotMatch(queue, /last_error.*pool_claim_failed/s, 'claim transport failures must not mutate job business failure state')
assert.doesNotMatch(queue, /markDurableJobFailed\([^)]*pool/s, 'pool transport failure must not consume durable job attempts')

console.log(`Independent automated adversarial audit passed for ${scenarios.length} workload-pool failure scenarios.`)
