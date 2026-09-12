import assert from 'node:assert/strict'
import fs from 'node:fs'

import { assessPoolClaimOutcomes } from '../lib/orchestration/pool-claim-policy.ts'

const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const claimStart = queue.indexOf('export async function claimDurableJobs')
const claimEnd = queue.indexOf('export async function markDurableJobSucceeded', claimStart)
assert.ok(claimStart >= 0 && claimEnd > claimStart, 'claimDurableJobs source boundary must be discoverable')
const claimPath = queue.slice(claimStart, claimEnd)

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

assert.match(claimPath, /if \(releaseError\) throw new Error/, 'stale lease release failure must fail before new claims')
assert.match(claimPath, /await writeTelemetry\(null, 'job\.pool_claim_failed'/, 'pool failure must produce explicit evidence')
assert.match(claimPath, /disposition: 'POOL_LEFT_QUEUED_FOR_RETRY'/, 'failed pool work must remain retryable')
assert.match(claimPath, /if \(assessment\.allPoolsFailed\)/, 'complete outage must fail closed')
assert.doesNotMatch(claimPath, /last_error/, 'claim transport failures must not mutate job business failure state')
assert.doesNotMatch(claimPath, /from\('job_queue'\)\.update/, 'claim transport failures must not update durable job state')
assert.doesNotMatch(claimPath, /markDurableJobFailed/, 'pool transport failure must not consume durable job attempts')

console.log(`Independent automated adversarial audit passed for ${scenarios.length} workload-pool failure scenarios.`)
