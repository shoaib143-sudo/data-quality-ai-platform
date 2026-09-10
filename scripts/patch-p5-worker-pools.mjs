import fs from 'node:fs'

const path = 'lib/orchestration/queue.ts'
let source = fs.readFileSync(path, 'utf8')

const typeNeedle = "export type DurableJobType = 'PROFILING' | 'DATA_QUALITY' | 'NOTIFICATION' | 'OBSERVABILITY' | 'DISCOVERY' | 'LINEAGE_ENRICHMENT' | 'SEMANTIC_INDEX' | 'GOVERNANCE_AGENT'\n"
if (!source.includes(typeNeedle)) throw new Error('DurableJobType declaration not found')
source = source.replace(typeNeedle, `${typeNeedle}export type DurableWorkloadPool = 'CORE' | 'SEMANTIC' | 'GOVERNANCE'\n`)

const oldClaim = `export async function claimDurableJobs(workerId: string, limit = 2) {
  const admin = createAdminClient()
  await admin.schema('orchestration').rpc('release_stale_jobs')
  const { data, error } = await admin.schema('orchestration').rpc('claim_jobs', {
    p_worker: workerId,
    p_limit: limit,
  })
  if (error) throw new Error(\`Unable to claim durable jobs: \${error.message}\`)
  const jobs = (data ?? []) as DurableJob[]
  await recordClaimTelemetry(jobs)
  return jobs
}
`

const newClaim = `function configuredWorkloadPools(poolOverride?: DurableWorkloadPool) {
  if (poolOverride) return [poolOverride]
  const configured = process.env.ORCHESTRATION_WORKLOAD_POOL?.trim().toUpperCase()
  if (configured === 'CORE' || configured === 'SEMANTIC' || configured === 'GOVERNANCE') {
    return [configured as DurableWorkloadPool]
  }
  return ['CORE', 'SEMANTIC', 'GOVERNANCE'] satisfies DurableWorkloadPool[]
}

export async function claimDurableJobs(workerId: string, limit = 2, poolOverride?: DurableWorkloadPool) {
  const admin = createAdminClient()
  await admin.schema('orchestration').rpc('release_stale_jobs')

  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 16))
  const pools = configuredWorkloadPools(poolOverride)
  const jobs: DurableJob[] = []

  for (let index = 0; index < pools.length && jobs.length < boundedLimit; index += 1) {
    const remaining = boundedLimit - jobs.length
    const remainingPools = pools.length - index
    const poolLimit = Math.max(1, Math.ceil(remaining / remainingPools))
    const pool = pools[index]
    const { data, error } = await admin.schema('orchestration').rpc('claim_jobs_by_pool', {
      p_worker: \`\${workerId}:\${pool.toLowerCase()}\`,
      p_pool: pool,
      p_limit: poolLimit,
    })
    if (error) throw new Error(\`Unable to claim durable jobs for \${pool} pool: \${error.message}\`)
    jobs.push(...((data ?? []) as DurableJob[]))
  }

  await recordClaimTelemetry(jobs)
  return jobs
}
`

if (!source.includes(oldClaim)) throw new Error('claimDurableJobs implementation not found')
source = source.replace(oldClaim, newClaim)
fs.writeFileSync(path, source)
