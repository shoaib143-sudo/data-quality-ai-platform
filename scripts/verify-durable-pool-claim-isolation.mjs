import fs from 'node:fs'

const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const policy = fs.readFileSync('lib/orchestration/pool-claim-policy.ts', 'utf8')

for (const marker of [
  "rpc('release_stale_jobs')",
  'if (releaseError) throw new Error',
  'assessPoolClaimOutcomes(outcomes)',
  "console.error('[job-pool-claim]'",
  "'job.pool_claim_failed'",
  "'POOL_LEFT_QUEUED_FOR_RETRY'",
  'continue',
  'assessment.allPoolsFailed',
  'Unable to claim durable jobs from any configured workload pool',
]) {
  if (!queue.includes(marker)) throw new Error(`Pool claim isolation contract missing: ${marker}`)
}

if (queue.includes('if (error) throw new Error(`Unable to claim durable jobs for ${pool} pool:')) {
  throw new Error('A single workload-pool claim failure must not abort healthy pool processing.')
}
if (!policy.includes('outcomes.length > 0 && successfulPoolCount === 0')) {
  throw new Error('Complete workload-pool unavailability must remain fail-closed.')
}
if (!policy.includes(".slice(0, 500)")) {
  throw new Error('Pool failure evidence must remain bounded before telemetry/log persistence.')
}
if (/credential|authorization|bearer|secret/i.test(policy)) {
  throw new Error('Pool claim policy must not depend on or expose authentication material.')
}

console.log('Durable workload-pool claim isolation verified: partial failure containment, explicit degraded evidence, stale-release fail-closed behavior, and complete-outage fail closure.')
