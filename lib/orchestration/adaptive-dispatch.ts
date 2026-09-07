import { processGovernanceAgentJobs } from '@/lib/agents/governance-job-worker'
import { processSemanticIndexJobs } from '@/lib/governance/semantic-job-worker'
import {
  claimDurableJobs,
  getProjectCapacityPolicy,
  type DurableJob,
} from '@/lib/orchestration/queue'
import { processDurableJobs } from '@/lib/orchestration/worker'
import {
  characterizeDurableJobs,
  recordWorkloadTelemetry,
} from '@/lib/orchestration/workload'
import {
  computeCriticalPathProfiles,
  orderJobsByCriticalPath,
  recordCriticalPathTelemetry,
} from '@/lib/orchestration/critical-path'
import {
  resolveAdaptiveSourceLimits,
  resolveJobSourceResources,
  type JobSourceResource,
} from '@/lib/orchestration/source-concurrency'
import {
  recordIncrementalEligibilityTelemetry,
  resolveIncrementalEligibility,
} from '@/lib/orchestration/incremental-eligibility'
import { createAdminClient } from '@/lib/supabase/admin'

type DispatchOptions = {
  claimBatchSize?: number
  maxConcurrency?: number
  maxRounds?: number
  perSourceConcurrency?: number
  perSourceMaxConcurrency?: number
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

function configuredPerSourceConcurrency(override?: number) {
  return boundedInteger(
    override ?? process.env.ORCHESTRATION_PER_SOURCE_CONCURRENCY,
    2,
    1,
    16,
  )
}

function configuredPerSourceMaxConcurrency(override?: number) {
  return boundedInteger(
    override ?? process.env.ORCHESTRATION_PER_SOURCE_MAX_CONCURRENCY,
    4,
    1,
    16,
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

function selectResourceBoundedBatch(
  pending: DurableJob[],
  resources: Map<string, JobSourceResource>,
  globalLimit: number,
  initialPerSourceLimit: number,
  sourceLimits: Map<string, number>,
) {
  const selected: DurableJob[] = []
  const sourceCounts = new Map<string, number>()

  for (const job of pending) {
    if (selected.length >= globalLimit) break
    const resource = resources.get(job.id)
    const key = resource?.key ?? null
    if (key && resource) {
      const stateKey = `${resource.projectId}:${key}`
      const limit = Math.max(1, sourceLimits.get(stateKey) ?? initialPerSourceLimit)
      const count = sourceCounts.get(stateKey) ?? 0
      if (count >= limit) continue
      sourceCounts.set(stateKey, count + 1)
    }
    selected.push(job)
  }

  if (selected.length === 0 && pending.length > 0) selected.push(pending[0])
  return selected
}

async function recordPlannerFallback(jobs: DurableJob[], error: unknown) {
  if (jobs.length === 0) return
  const admin = createAdminClient()
  const message = error instanceof Error ? error.message : 'Planner enrichment failed.'
  const rows = [...new Set(jobs.map((job) => job.project_id))].map((projectId) => ({
    project_id: projectId,
    metric_key: 'planner.safe_fallback',
    numeric_value: 1,
    dimensions: {
      mode: 'SEQUENTIAL_SAFE_FALLBACK',
      claimed_jobs: jobs.filter((job) => job.project_id === projectId).length,
      error: message.slice(0, 500),
    },
  }))
  const { error: telemetryError } = await admin.schema('orchestration').from('platform_telemetry').insert(rows)
  if (telemetryError) console.error('[planner-fallback-telemetry]', telemetryError.message)
}

async function processCoreJobsSafeFallback(jobs: DurableJob[], error: unknown) {
  console.error('[adaptive-planner]', error instanceof Error ? error.message : error)
  await recordPlannerFallback(jobs, error)
  const results: Array<Record<string, unknown>> = []
  for (const job of jobs) {
    const rows = await processDurableJobs([job])
    results.push(...rows)
  }
  return results
}

async function processCoreJobsBounded(
  jobs: DurableJob[],
  requestedConcurrency: number,
  requestedPerSourceConcurrency: number,
  requestedPerSourceMaxConcurrency: number,
) {
  if (jobs.length === 0) return [] as Array<Record<string, unknown>>

  try {
    const hardPerSourceMax = Math.max(1, requestedPerSourceMaxConcurrency)
    const initialPerSourceConcurrency = Math.max(1, Math.min(requestedPerSourceConcurrency, hardPerSourceMax))
    const [concurrency, resources, workload, incrementalEligibility] = await Promise.all([
      resolveCoreConcurrency(jobs, requestedConcurrency),
      resolveJobSourceResources(jobs),
      characterizeDurableJobs(jobs),
      resolveIncrementalEligibility(jobs),
    ])
    const [criticalPath, sourceLimits] = await Promise.all([
      computeCriticalPathProfiles(jobs, workload),
      resolveAdaptiveSourceLimits(resources, initialPerSourceConcurrency, hardPerSourceMax),
    ])
    await Promise.all([
      recordWorkloadTelemetry(jobs, workload),
      recordCriticalPathTelemetry(jobs, criticalPath),
      recordIncrementalEligibilityTelemetry(jobs, incrementalEligibility),
    ])

    const pending = orderJobsByCriticalPath(jobs, criticalPath, workload)
    const results: Array<Record<string, unknown>> = []

    while (pending.length > 0) {
      const batch = selectResourceBoundedBatch(
        pending,
        resources,
        concurrency,
        initialPerSourceConcurrency,
        sourceLimits,
      )
      const selectedIds = new Set(batch.map((job) => job.id))
      const settled = await Promise.all(batch.map((job) => processDurableJobs([job])))
      for (const rows of settled) results.push(...rows)
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (selectedIds.has(pending[index].id)) pending.splice(index, 1)
      }
    }
    return results
  } catch (plannerError) {
    return processCoreJobsSafeFallback(jobs, plannerError)
  }
}

export async function dispatchAdaptiveRound(workerId: string, options: DispatchOptions = {}) {
  const claimBatchSize = configuredClaimBatch(options.claimBatchSize)
  const maxConcurrency = configuredConcurrency(options.maxConcurrency)
  const perSourceConcurrency = configuredPerSourceConcurrency(options.perSourceConcurrency)
  const perSourceMaxConcurrency = configuredPerSourceMaxConcurrency(options.perSourceMaxConcurrency)
  const jobs = await claimDurableJobs(workerId, claimBatchSize)
  const semanticJobs = jobs.filter((job) => job.job_type === 'SEMANTIC_INDEX')
  const governanceAgentJobs = jobs.filter((job) => job.job_type === 'GOVERNANCE_AGENT')
  const coreJobs = jobs.filter((job) => job.job_type !== 'SEMANTIC_INDEX' && job.job_type !== 'GOVERNANCE_AGENT')

  const [results, semanticResults, governanceAgentResults] = await Promise.all([
    processCoreJobsBounded(coreJobs, maxConcurrency, perSourceConcurrency, perSourceMaxConcurrency),
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
