import { processGovernanceAgentJobs } from '@/lib/agents/governance-job-worker'
import { processSemanticIndexJobs } from '@/lib/governance/semantic-job-worker'
import {
  claimDurableJobs,
  getProjectCapacityPolicy,
  type DurableJob,
} from '@/lib/orchestration/queue'
import { processDurableJobs } from '@/lib/orchestration/worker'

type DispatchOptions = {
  claimBatchSize?: number
  maxConcurrency?: number
  maxRounds?: number
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.floor(numeric)))
}

function configuredConcurrency(override?: number) {
  return boundedInteger(
    override ?? process.env.ORCHESTRATION_WORKER_CONCURRENCY,
    4,
    1,
    12,
  )
}

function configuredClaimBatch(override?: number) {
  return boundedInteger(
    override ?? process.env.ORCHESTRATION_CLAIM_BATCH_SIZE,
    8,
    1,
    24,
  )
}

function configuredRounds(override?: number) {
  return boundedInteger(
    override ?? process.env.ORCHESTRATION_DRAIN_ROUNDS,
    3,
    1,
    6,
  )
}

async function resolveCoreConcurrency(jobs: DurableJob[], requested: number) {
  if (jobs.length === 0) return 1
  const projectIds = [...new Set(jobs.map((job) => job.project_id))]
  const policies = await Promise.all(projectIds.map(async (projectId) => ({
    projectId,
    policy: await getProjectCapacityPolicy(projectId),
  })))
  const strictestProjectLimit = policies.reduce(
    (limit, row) => Math.min(limit, Math.max(1, row.policy.maxConcurrentJobs)),
    requested,
  )
  return Math.max(1, Math.min(requested, strictestProjectLimit, jobs.length))
}

async function processCoreJobsBounded(jobs: DurableJob[], requestedConcurrency: number) {
  if (jobs.length === 0) return [] as Array<Record<string, unknown>>
  const concurrency = await resolveCoreConcurrency(jobs, requestedConcurrency)
  const results: Array<Record<string, unknown>> = []

  for (let index = 0; index < jobs.length; index += concurrency) {
    const batch = jobs.slice(index, index + concurrency)
    const settled = await Promise.all(batch.map((job) => processDurableJobs([job])))
    for (const rows of settled) results.push(...rows)
  }
  return results
}

export async function dispatchAdaptiveRound(workerId: string, options: DispatchOptions = {}) {
  const claimBatchSize = configuredClaimBatch(options.claimBatchSize)
  const maxConcurrency = configuredConcurrency(options.maxConcurrency)
  const jobs = await claimDurableJobs(workerId, claimBatchSize)
  const semanticJobs = jobs.filter((job) => job.job_type === 'SEMANTIC_INDEX')
  const governanceAgentJobs = jobs.filter((job) => job.job_type === 'GOVERNANCE_AGENT')
  const coreJobs = jobs.filter((job) => job.job_type !== 'SEMANTIC_INDEX' && job.job_type !== 'GOVERNANCE_AGENT')

  const [results, semanticResults, governanceAgentResults] = await Promise.all([
    processCoreJobsBounded(coreJobs, maxConcurrency),
    processSemanticIndexJobs(semanticJobs),
    processGovernanceAgentJobs(governanceAgentJobs),
  ])

  return {
    claimed: jobs.length,
    results,
    semanticResults,
    governanceAgentResults,
  }
}

export async function dispatchAdaptiveRounds(workerId: string, options: DispatchOptions = {}) {
  const maxRounds = configuredRounds(options.maxRounds)
  const rounds = [] as Awaited<ReturnType<typeof dispatchAdaptiveRound>>[]

  for (let round = 0; round < maxRounds; round += 1) {
    const result = await dispatchAdaptiveRound(`${workerId}:round:${round + 1}`, options)
    rounds.push(result)
    if (result.claimed === 0) break
  }

  return {
    rounds: rounds.length,
    claimed: rounds.reduce((sum, row) => sum + row.claimed, 0),
    results: rounds.flatMap((row) => row.results),
    semanticResults: rounds.flatMap((row) => row.semanticResults),
    governanceAgentResults: rounds.flatMap((row) => row.governanceAgentResults),
  }
}
