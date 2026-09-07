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
import { createAdminClient } from '@/lib/supabase/admin'

type DispatchOptions = {
  claimBatchSize?: number
  maxConcurrency?: number
  maxRounds?: number
  perSourceConcurrency?: number
}

type JobResource = {
  key: string | null
  sourceType: string | null
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

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
    8,
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

async function resolveJobResources(jobs: DurableJob[]) {
  const resources = new Map<string, JobResource>()
  const datasetVersionJobs = jobs.filter((job) =>
    job.entity_id && (job.job_type === 'PROFILING' || job.job_type === 'DATA_QUALITY'))
  const datasetVersionIds = [...new Set(datasetVersionJobs.map((job) => job.entity_id).filter((value): value is string => Boolean(value)))]

  if (datasetVersionIds.length > 0) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('profiling')
      .from('dataset_execution_sources')
      .select('dataset_version_id,source_type,execution_config')
      .in('dataset_version_id', datasetVersionIds)
      .eq('active', true)
    if (error) throw new Error(`Unable to resolve adaptive source resources: ${error.message}`)

    const byVersion = new Map<string, JobResource>()
    for (const row of data ?? []) {
      const executionConfig = row.execution_config && typeof row.execution_config === 'object' && !Array.isArray(row.execution_config)
        ? row.execution_config as Record<string, unknown>
        : {}
      const sourceId = text(executionConfig.source_id)
      byVersion.set(row.dataset_version_id, {
        key: sourceId ? `source:${sourceId}` : null,
        sourceType: text(row.source_type) || null,
      })
    }
    for (const job of datasetVersionJobs) {
      if (job.entity_id) resources.set(job.id, byVersion.get(job.entity_id) ?? { key: null, sourceType: null })
    }
  }

  for (const job of jobs) {
    if (resources.has(job.id)) continue
    const payloadSourceId = text(job.payload?.sourceId) || text(job.payload?.source_id)
    const sourceBound = job.job_type === 'DISCOVERY' || job.job_type === 'LINEAGE_ENRICHMENT'
    resources.set(job.id, {
      key: payloadSourceId ? `source:${payloadSourceId}` : sourceBound && job.entity_id ? `source:${job.entity_id}` : null,
      sourceType: text(job.payload?.sourceType) || text(job.payload?.source_type) || null,
    })
  }

  return resources
}

function selectResourceBoundedBatch(
  pending: DurableJob[],
  resources: Map<string, JobResource>,
  globalLimit: number,
  perSourceLimit: number,
) {
  const selected: DurableJob[] = []
  const sourceCounts = new Map<string, number>()

  for (const job of pending) {
    if (selected.length >= globalLimit) break
    const resource = resources.get(job.id)
    const key = resource?.key ?? null
    if (key) {
      const count = sourceCounts.get(key) ?? 0
      if (count >= perSourceLimit) continue
      sourceCounts.set(key, count + 1)
    }
    selected.push(job)
  }

  if (selected.length === 0 && pending.length > 0) selected.push(pending[0])
  return selected
}

async function processCoreJobsBounded(jobs: DurableJob[], requestedConcurrency: number, requestedPerSourceConcurrency: number) {
  if (jobs.length === 0) return [] as Array<Record<string, unknown>>
  const [concurrency, resources, workload] = await Promise.all([
    resolveCoreConcurrency(jobs, requestedConcurrency),
    resolveJobResources(jobs),
    characterizeDurableJobs(jobs),
  ])
  const criticalPath = await computeCriticalPathProfiles(jobs, workload)
  await Promise.all([
    recordWorkloadTelemetry(jobs, workload),
    recordCriticalPathTelemetry(jobs, criticalPath),
  ])

  const perSourceConcurrency = Math.max(1, Math.min(requestedPerSourceConcurrency, concurrency))
  const pending = orderJobsByCriticalPath(jobs, criticalPath, workload)
  const results: Array<Record<string, unknown>> = []

  while (pending.length > 0) {
    const batch = selectResourceBoundedBatch(pending, resources, concurrency, perSourceConcurrency)
    const selectedIds = new Set(batch.map((job) => job.id))
    const settled = await Promise.all(batch.map((job) => processDurableJobs([job])))
    for (const rows of settled) results.push(...rows)
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (selectedIds.has(pending[index].id)) pending.splice(index, 1)
    }
  }
  return results
}

export async function dispatchAdaptiveRound(workerId: string, options: DispatchOptions = {}) {
  const claimBatchSize = configuredClaimBatch(options.claimBatchSize)
  const maxConcurrency = configuredConcurrency(options.maxConcurrency)
  const perSourceConcurrency = configuredPerSourceConcurrency(options.perSourceConcurrency)
  const jobs = await claimDurableJobs(workerId, claimBatchSize)
  const semanticJobs = jobs.filter((job) => job.job_type === 'SEMANTIC_INDEX')
  const governanceAgentJobs = jobs.filter((job) => job.job_type === 'GOVERNANCE_AGENT')
  const coreJobs = jobs.filter((job) => job.job_type !== 'SEMANTIC_INDEX' && job.job_type !== 'GOVERNANCE_AGENT')

  const [results, semanticResults, governanceAgentResults] = await Promise.all([
    processCoreJobsBounded(coreJobs, maxConcurrency, perSourceConcurrency),
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
