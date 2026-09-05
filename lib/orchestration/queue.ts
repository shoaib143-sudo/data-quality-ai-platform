import { createAdminClient } from '@/lib/supabase/admin'

export type DurableJobType = 'PROFILING' | 'DATA_QUALITY' | 'NOTIFICATION' | 'OBSERVABILITY' | 'DISCOVERY' | 'LINEAGE_ENRICHMENT' | 'SEMANTIC_INDEX' | 'GOVERNANCE_AGENT'

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
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString()
  const [{ count: runningCount }, { count: hourlyCount }, targets] = await Promise.all([
    admin.schema('orchestration').from('job_queue').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId).eq('status', 'RUNNING'),
    admin.schema('orchestration').from('job_queue').select('id', { count: 'exact', head: true }).eq('project_id', input.projectId).gte('created_at', oneHourAgo),
    resolveCapacity(input.projectId),
  ])

  const { data, error } = await admin.schema('orchestration').from('job_queue').insert({
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
    running_jobs: runningCount ?? 0,
    jobs_last_hour: hourlyCount ?? 0,
    advisory_concurrent_target_exceeded: (runningCount ?? 0) >= targets.maxConcurrentJobs,
    advisory_hourly_target_exceeded: (hourlyCount ?? 0) >= targets.maxJobsPerHour,
    capacity_mode: 'ADVISORY_ONLY',
  })
  return data
}

export async function claimDurableJobs(workerId: string, limit = 2) {
  const admin = createAdminClient()
  await admin.schema('orchestration').rpc('release_stale_jobs')
  const { data, error } = await admin.schema('orchestration').rpc('claim_jobs', {
    p_worker: workerId,
    p_limit: limit,
  })
  if (error) throw new Error(`Unable to claim durable jobs: ${error.message}`)
  return (data ?? []) as DurableJob[]
}

export async function markDurableJobSucceeded(job: Pick<DurableJob, 'id' | 'project_id' | 'job_type' | 'created_at' | 'started_at'> | string) {
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
  return data as DurableJob
}

export async function getProjectCapacityPolicy(projectId: string) {
  return resolveCapacity(projectId)
}
