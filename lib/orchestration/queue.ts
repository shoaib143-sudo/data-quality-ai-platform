import { createAdminClient } from '@/lib/supabase/admin'
import { recordSourceConcurrencyOutcome } from '@/lib/orchestration/source-concurrency'

export type DurableJobType = 'PROFILING' | 'DATA_QUALITY' | 'NOTIFICATION' | 'OBSERVABILITY' | 'DISCOVERY' | 'LINEAGE_ENRICHMENT' | 'SEMANTIC_INDEX' | 'GOVERNANCE_AGENT'
export type DurableWorkloadPool = 'CORE' | 'SEMANTIC' | 'GOVERNANCE'
export type DurableJobDependencyType = 'SUCCESS' | 'TERMINAL'
export type DurableJobDependency = { jobId: string; dependencyType?: DurableJobDependencyType }

export type DurableJob = {
  id: string
  project_id: string
  job_type: DurableJobType
  entity_id: string | null
  agent_run_id: string | null
  idempotency_key: string | null
  payload: Record<string, unknown>
  status: string
  priority: number
  attempts: number
  max_attempts: number
  available_at: string
  lease_owner: string | null
  lease_expires_at: string | null
  last_error: string | null
  created_at: string
  started_at: string | null
}

async function writeTelemetry(projectId: string | null, metricKey: string, numericValue: number, dimensions: Record<string, unknown> = {}) {
  const admin = createAdminClient()
  const { error } = await admin.schema('orchestration').from('platform_telemetry').insert({
    project_id: projectId,
    metric_key: metricKey,
    numeric_value: numericValue,
    dimensions,
  })
  if (error) console.error('[platform-telemetry]', error.message)
}

async function recordClaimTelemetry(jobs: DurableJob[]) {
  await Promise.all(jobs.map(async (job) => {
    if (!job.started_at) return
    const createdAt = new Date(job.created_at).getTime()
    const startedAt = new Date(job.started_at).getTime()
    if (!Number.isFinite(createdAt) || !Number.isFinite(startedAt)) return
    await writeTelemetry(job.project_id, 'job.queue_wait_ms', Math.max(0, startedAt - createdAt), {
      job_type: job.job_type,
      priority: job.priority,
      attempts: job.attempts,
      dispatch_mode: job.lease_owner?.startsWith('event-worker:') ? 'EVENT_DRIVEN' : 'WORKER_CLAIM',
    })
  }))
}

async function resolveCapacity(projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').from('capacity_policies').select('*').eq('project_id', projectId).maybeSingle()
  if (error) throw new Error(`Unable to resolve project operating targets: ${error.message}`)
  return {
    maxConcurrentJobs: Number(data?.max_concurrent_jobs ?? 4),
    maxJobsPerHour: Number(data?.max_jobs_per_hour ?? 120),
    maxProfileRows: Number(data?.max_profile_rows ?? 10_000),
    maxFileBytes: Number(data?.max_file_bytes ?? 52_428_800),
    maxNotificationsPerHour: Number(data?.max_notifications_per_hour ?? 500),
  }
}

function normalizedDependencies(dependencies: DurableJobDependency[] | undefined) {
  const seen = new Set<string>()
  const rows: Array<{ job_id: string; dependency_type: DurableJobDependencyType }> = []
  for (const dependency of dependencies ?? []) {
    const jobId = dependency.jobId?.trim()
    if (!jobId || seen.has(jobId)) continue
    seen.add(jobId)
    rows.push({ job_id: jobId, dependency_type: dependency.dependencyType ?? 'SUCCESS' })
  }
  return rows
}

export async function enqueueDurableJob(input: {
  projectId: string
  jobType: DurableJobType
  entityId?: string | null
  agentRunId?: string | null
  idempotencyKey?: string | null
  payload: Record<string, unknown>
  priority?: number
  maxAttempts?: number
  availableAt?: string
  dependencies?: DurableJobDependency[]
}) {
  const admin = createAdminClient()
  const idempotencyKey = input.idempotencyKey?.trim() || null

  if (idempotencyKey) {
    const { data: existing, error: existingError } = await admin
      .schema('orchestration')
      .from('job_queue')
      .select('id,status,attempts,max_attempts,available_at,agent_run_id,idempotency_key')
      .eq('project_id', input.projectId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existingError) throw new Error(`Unable to check durable job idempotency: ${existingError.message}`)
    if (existing) return existing
  }

  const requestedAvailableAt = input.availableAt ? new Date(input.availableAt) : new Date()
  const availableAt = Number.isFinite(requestedAvailableAt.getTime()) ? requestedAvailableAt.toISOString() : new Date().toISOString()
  const dependencies = normalizedDependencies(input.dependencies)
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString()
  const [{ count: runningCount }, { count: hourlyCount }, targets] = await Promise.all([
    admin.schema('orchestration').from('job_queue').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId).eq('status', 'RUNNING'),
    admin.schema('orchestration').from('job_queue').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId).gte('created_at', oneHourAgo),
    resolveCapacity(input.projectId),
  ])

  const insertResult = dependencies.length > 0
    ? await admin.schema('orchestration').rpc('enqueue_job_with_dependencies', {
        p_project_id: input.projectId,
        p_job_type: input.jobType,
        p_entity_id: input.entityId ?? null,
        p_agent_run_id: input.agentRunId ?? null,
        p_idempotency_key: idempotencyKey,
        p_payload: input.payload,
        p_priority: input.priority ?? 100,
        p_max_attempts: input.maxAttempts ?? 3,
        p_available_at: availableAt,
        p_dependencies: dependencies,
      })
    : await admin.schema('orchestration').from('job_queue').insert({
        project_id: input.projectId,
        job_type: input.jobType,
        entity_id: input.entityId ?? null,
        agent_run_id: input.agentRunId ?? null,
        idempotency_key: idempotencyKey,
        payload: input.payload,
        priority: input.priority ?? 100,
        max_attempts: input.maxAttempts ?? 3,
        available_at: availableAt,
      }).select('id,status,attempts,max_attempts,available_at,agent_run_id,idempotency_key').single()

  const data = Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data
  const error = insertResult.error
  if (error) {
    if (idempotencyKey && error.code === '23505') {
      const { data: existing } = await admin.schema('orchestration').from('job_queue').select('id,status,attempts,max_attempts,available_at,agent_run_id,idempotency_key').eq('project_id', input.projectId).eq('idempotency_key', idempotencyKey).maybeSingle()
      if (existing) return existing
    }
    throw new Error(`Unable to enqueue durable job: ${error.message}`)
  }
  if (!data) throw new Error('Unable to enqueue durable job: no job record returned.')

  await writeTelemetry(input.projectId, 'job.queued', 1, {
    job_type: input.jobType,
    priority: input.priority ?? 100,
    dependency_count: dependencies.length,
    running_jobs: runningCount ?? 0,
    jobs_last_hour: hourlyCount ?? 0,
    advisory_concurrent_target_exceeded: (runningCount ?? 0) >= targets.maxConcurrentJobs,
    advisory_hourly_target_exceeded: (hourlyCount ?? 0) >= targets.maxJobsPerHour,
    capacity_mode: 'ADVISORY_ONLY',
  })
  return data
}

function configuredWorkloadPools(poolOverride?: DurableWorkloadPool) {
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
      p_worker: `${workerId}:${pool.toLowerCase()}`,
      p_pool: pool,
      p_limit: poolLimit,
    })
    if (error) throw new Error(`Unable to claim durable jobs for ${pool} pool: ${error.message}`)
    jobs.push(...((data ?? []) as DurableJob[]))
  }

  await recordClaimTelemetry(jobs)
  return jobs
}

export async function markDurableJobSucceeded(job: DurableJob | string) {
  const admin = createAdminClient()
  const now = new Date()
  const jobId = typeof job === 'string' ? job : job.id
  const { error } = await admin.schema('orchestration').from('job_queue').update({
    status: 'SUCCEEDED',
    completed_at: now.toISOString(),
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    updated_at: now.toISOString(),
  }).eq('id', jobId)
  if (error) throw new Error(`Unable to finalize durable job: ${error.message}`)

  if (typeof job !== 'string') {
    const start = new Date(job.started_at ?? job.created_at).getTime()
    await writeTelemetry(job.project_id, 'job.duration_ms', Math.max(0, now.getTime() - start), { job_type: job.job_type, status: 'SUCCEEDED' })
    await writeTelemetry(job.project_id, 'job.succeeded', 1, { job_type: job.job_type })
    try {
      await recordSourceConcurrencyOutcome(job, 'SUCCESS')
    } catch (controllerError) {
      console.error('[source-concurrency-controller]', controllerError instanceof Error ? controllerError.message : controllerError)
    }
  }
}

export async function markDurableJobFailed(job: DurableJob, error: unknown) {
  const admin = createAdminClient()
  const message = error instanceof Error ? error.message : 'Durable job execution failed.'
  const exhausted = job.attempts >= job.max_attempts
  const backoffMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, job.attempts - 1)))
  const now = new Date()
  const availableAt = new Date(now.getTime() + backoffMinutes * 60_000).toISOString()
  const { error: updateError } = await admin.schema('orchestration').from('job_queue').update({
    status: exhausted ? 'DEAD' : 'QUEUED',
    available_at: exhausted ? job.available_at : availableAt,
    completed_at: exhausted ? now.toISOString() : null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: message,
    updated_at: now.toISOString(),
  }).eq('id', job.id)
  if (updateError) throw new Error(`Unable to persist durable job failure: ${updateError.message}`)

  await writeTelemetry(job.project_id, exhausted ? 'job.dead' : 'job.retry', 1, {
    job_type: job.job_type,
    attempts: job.attempts,
    backoff_minutes: backoffMinutes,
    error: message.slice(0, 500),
  })
  try {
    await recordSourceConcurrencyOutcome(job, 'FAILURE', error)
  } catch (controllerError) {
    console.error('[source-concurrency-controller]', controllerError instanceof Error ? controllerError.message : controllerError)
  }
}

export function numericSetting(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export async function claimDurableJobByAgentRun(workerId: string, agentRunId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').rpc('claim_job_by_agent_run', {
    p_worker: workerId,
    p_agent_run_id: agentRunId,
  })
  if (error) throw new Error(`Unable to claim durable job for run ${agentRunId}: ${error.message}`)
  if (!data) return null
  const job = data as DurableJob
  await recordClaimTelemetry([job])
  return job
}

export async function getProjectCapacityPolicy(projectId: string) {
  return resolveCapacity(projectId)
}
