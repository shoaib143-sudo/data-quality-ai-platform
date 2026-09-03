import { createAdminClient } from '@/lib/supabase/admin'

export type DurableJobType = 'PROFILING' | 'DATA_QUALITY' | 'NOTIFICATION' | 'OBSERVABILITY'

export type DurableJob = {
  id: string
  project_id: string
  job_type: DurableJobType
  entity_id: string | null
  agent_run_id: string | null
  payload: Record<string, unknown>
  status: string
  priority: number
  attempts: number
  max_attempts: number
  available_at: string
  lease_owner: string | null
  lease_expires_at: string | null
  last_error: string | null
}

export async function enqueueDurableJob(input: {
  projectId: string
  jobType: DurableJobType
  entityId?: string | null
  agentRunId?: string | null
  payload: Record<string, unknown>
  priority?: number
  maxAttempts?: number
  availableAt?: string
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').from('job_queue').insert({
    project_id: input.projectId,
    job_type: input.jobType,
    entity_id: input.entityId ?? null,
    agent_run_id: input.agentRunId ?? null,
    payload: input.payload,
    priority: input.priority ?? 100,
    max_attempts: input.maxAttempts ?? 3,
    available_at: input.availableAt ?? new Date().toISOString(),
  }).select('id,status,attempts,max_attempts,available_at').single()
  if (error || !data) throw new Error(`Unable to enqueue durable job: ${error?.message ?? 'unknown error'}`)
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

export async function markDurableJobSucceeded(jobId: string) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin.schema('orchestration').from('job_queue').update({
    status: 'SUCCEEDED',
    completed_at: now,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    updated_at: now,
  }).eq('id', jobId)
  if (error) throw new Error(`Unable to finalize durable job: ${error.message}`)
}

export async function markDurableJobFailed(job: DurableJob, error: unknown) {
  const admin = createAdminClient()
  const message = error instanceof Error ? error.message : 'Durable job execution failed.'
  const exhausted = job.attempts >= job.max_attempts
  const backoffMinutes = Math.min(60, Math.max(1, job.attempts * 5))
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
