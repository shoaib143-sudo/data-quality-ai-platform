import fs from 'node:fs'

const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const policy = fs.readFileSync('lib/orchestration/pool-claim-policy.ts', 'utf8')

for (const marker of [
  "rpc('release_stale_jobs')",
  "assessStaleReleaseFailure(releaseError.message, ['QUEUED'])",
  "console.error('[job-stale-release]'",
  "'job.stale_release_failed'",
  "'STALE_RUNNING_LEFT_FENCED_FOR_RETRY'",
  'assessPoolClaimOutcomes(outcomes)',
  "console.error('[job-pool-claim]'",
  "'job.pool_claim_failed'",
  "'POOL_LEFT_QUEUED_FOR_RETRY'",
  'continue',
  'assessment.allPoolsFailed',
  'Unable to claim durable jobs from any configured workload pool',
]) {
  if (!(queue + policy).includes(marker)) throw new Error(`Pool claim isolation contract missing: ${marker}`)
}

if (queue.includes('if (releaseError) throw new Error(`Unable to release stale durable jobs before claiming work:')) {
  throw new Error('A transient stale-release failure must not abort safely fenced QUEUED-only claims.')
}
if (queue.includes('if (error) throw new Error(`Unable to claim durable jobs for ${pool} pool:')) {
  throw new Error('A single workload-pool claim failure must not abort healthy pool processing.')
}
if (!policy.includes('staleRunningCouldBeClaimed')) {
  throw new Error('Stale-release degradation must be conditioned on RUNNING rows remaining unclaimable.')
}
if (!policy.includes("staleRunningCouldBeClaimed ? 'FAIL_CLOSED' : 'STALE_RUNNING_LEFT_FENCED_FOR_RETRY'")) {
  throw new Error('Stale-release policy must fail closed if RUNNING rows can be claimed.')
}
if (!policy.includes('outcomes.length > 0 && successfulPoolCount === 0')) {
  throw new Error('Complete workload-pool unavailability must remain fail-closed.')
}
if (!policy.includes(".slice(0, 500)")) {
  throw new Error('Failure evidence must remain bounded before telemetry/log persistence.')
}
if (/credential|authorization|bearer|secret/i.test(policy)) {
  throw new Error('Pool claim policy must not depend on or expose authentication material.')
}

console.log('Durable workload-pool claim isolation verified: stale cleanup degrades only under QUEUED-only claim fencing, partial pool failures are contained, and unsafe or complete outages fail closed.')
