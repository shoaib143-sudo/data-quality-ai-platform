import assert from 'node:assert/strict'
import fs from 'node:fs'

import { assessPoolClaimOutcomes, assessStaleReleaseFailure } from '../lib/orchestration/pool-claim-policy.ts'

const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const hotPathMigration = fs.readFileSync('supabase/migrations/20260913120500_optimize_worker_claim_hot_path.sql', 'utf8')
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

const safeCleanupFailure = assessStaleReleaseFailure('Gateway Timeout', ['QUEUED'])
assert.equal(safeCleanupFailure.canContinueClaiming, true, 'cleanup outage must not suppress QUEUED-only work while stale RUNNING rows remain fenced')
const unsafeCleanupFailure = assessStaleReleaseFailure('Gateway Timeout', ['QUEUED', 'RUNNING'])
assert.equal(unsafeCleanupFailure.canContinueClaiming, false, 'cleanup outage must fail closed if RUNNING rows could become claimable')

assert.match(claimPath, /assessStaleReleaseFailure\(releaseError\.message, \['QUEUED'\]\)/, 'runtime cleanup degradation must declare the QUEUED-only claim invariant')
assert.match(claimPath, /logClaimDegradation\('job\.stale_release_failed'/, 'stale cleanup failure must produce explicit runtime evidence')
assert.match(claimPath, /if \(!releaseAssessment\.canContinueClaiming\)/, 'unsafe cleanup degradation must fail closed')
assert.match(claimPath, /logClaimDegradation\('job\.pool_claim_failed'/, 'pool failure must produce explicit runtime evidence')
assert.doesNotMatch(claimPath, /await writeTelemetry\(null, 'job\.(stale_release_failed|pool_claim_failed)'/, 'claim transport failures must not synchronously write through the failed database path')
assert.match(claimPath, /disposition: 'POOL_LEFT_QUEUED_FOR_RETRY'/, 'failed pool work must remain retryable')
assert.match(claimPath, /if \(assessment\.allPoolsFailed\)/, 'complete outage must fail closed')
assert.doesNotMatch(claimPath, /last_error/, 'claim transport and cleanup failures must not mutate job business failure state')
assert.doesNotMatch(claimPath, /from\('job_queue'\)\.update/, 'claim transport and cleanup failures must not update durable job state')
assert.doesNotMatch(claimPath, /markDurableJobFailed/, 'transport failures must not consume durable job attempts')

const recordClaimTelemetryStart = queue.indexOf('async function recordClaimTelemetry')
const resolveCapacityStart = queue.indexOf('async function resolveCapacity', recordClaimTelemetryStart)
assert.ok(recordClaimTelemetryStart >= 0 && resolveCapacityStart > recordClaimTelemetryStart, 'claim telemetry source boundary must be discoverable')
const recordClaimTelemetryPath = queue.slice(recordClaimTelemetryStart, resolveCapacityStart)
assert.match(recordClaimTelemetryPath, /from\('platform_telemetry'\)\.insert\(rows\)/, 'successful claim queue-wait telemetry must use one batch insert')
assert.doesNotMatch(recordClaimTelemetryPath, /Promise\.all\(jobs\.map/, 'successful claim telemetry must not fan out one database write per claimed job')

assert.match(hotPathMigration, /idx_job_queue_stale_running_lease[\s\S]*where status = 'RUNNING'/, 'stale lease maintenance must have a selective RUNNING lease index')
assert.match(hotPathMigration, /idx_job_queue_running_project[\s\S]*where status = 'RUNNING'/, 'capacity checks must have a selective RUNNING project index')
assert.match(hotPathMigration, /create or replace function orchestration\.release_stale_jobs\(\)[\s\S]*perform orchestration\.resolve_failed_job_dependencies\(\)/, 'dependency cleanup must run once in claim-cycle maintenance')
const sqlClaimStart = hotPathMigration.indexOf('create or replace function orchestration.claim_jobs_by_pool')
assert.ok(sqlClaimStart >= 0, 'optimized workload-pool claim function must be defined')
const sqlClaimPath = hotPathMigration.slice(sqlClaimStart)
assert.doesNotMatch(sqlClaimPath, /perform orchestration\.resolve_failed_job_dependencies\(\)/, 'dependency cleanup must not repeat once per workload pool')
assert.match(sqlClaimPath, /limit v_scan_limit\s+for update of q skip locked/i, 'pool claim candidate scan must be bounded and retain SKIP LOCKED concurrency')
assert.match(sqlClaimPath, /v_scan_limit integer := least\(256, greatest\(32,/i, 'claim scan bound must be explicit and finite')
assert.match(sqlClaimPath, /q\.status = 'QUEUED'/, 'claim path must remain QUEUED-only')
assert.match(sqlClaimPath, /not exists \([\s\S]*job_dependencies/, 'claim path must keep dependency eligibility fail-closed')

console.log(`Independent automated adversarial audit passed for ${scenarios.length} workload-pool failure scenarios, transport-degradation evidence, batched claim telemetry, stale-release boundaries, and bounded SQL hot-path invariants.`)
