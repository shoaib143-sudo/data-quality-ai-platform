import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueDurableJob } from '@/lib/orchestration/queue'

export async function queueDataQualityAutomation(input: {
  projectId: string
  datasetId: string
  datasetVersionId: string
  profileRunId: string
  userId?: string | null
  parentRunId?: string | null
  requestedByUser?: boolean
}) {
  const admin = createAdminClient()
  const idempotencyKey = `data-quality:profile:${input.profileRunId}`

  const { data: existingJob, error: existingJobError } = await admin
    .schema('orchestration')
    .from('job_queue')
    .select('id,status,agent_run_id,available_at,idempotency_key')
    .eq('project_id', input.projectId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existingJobError) throw new Error(`Unable to resolve existing data quality job: ${existingJobError.message}`)
  if (existingJob?.agent_run_id) {
    return {
      agentRunId: existingJob.agent_run_id,
      durableJobId: existingJob.id,
      status: existingJob.status,
      reused: true,
    }
  }

  const { data: agentDefinition, error: agentError } = await admin
    .schema('agent')
    .from('agent_definitions')
    .select('id,version')
    .eq('agent_key', 'data_quality_agent')
    .eq('version', '1.0')
    .eq('enabled', true)
    .maybeSingle()
  if (agentError || !agentDefinition) throw new Error(`Data Quality Agent 1.0 is unavailable: ${agentError?.message ?? 'not registered'}`)

  const { data: run, error: runError } = await admin.schema('agent').from('agent_runs').insert({
    agent_definition_id: agentDefinition.id,
    project_id: input.projectId,
    dataset_id: input.datasetId,
    dataset_version_id: input.datasetVersionId,
    parent_run_id: input.parentRunId ?? null,
    status: 'QUEUED',
    input: {
      datasetVersionId: input.datasetVersionId,
      profileRunId: input.profileRunId,
      automation: true,
      requested_by_user: input.requestedByUser ?? false,
      source_event: input.requestedByUser ? 'USER_REQUEST' : 'PROFILE_COMPLETED',
    },
  }).select('id').single()
  if (runError || !run) throw new Error(`Unable to create data quality agent run: ${runError?.message ?? 'unknown error'}`)

  try {
    const durableJob = await enqueueDurableJob({
      projectId: input.projectId,
      jobType: 'DATA_QUALITY',
      entityId: input.datasetVersionId,
      agentRunId: run.id,
      idempotencyKey,
      payload: {
        datasetVersionId: input.datasetVersionId,
        profileRunId: input.profileRunId,
        userId: input.userId ?? '',
        agentRunId: run.id,
      },
      maxAttempts: 3,
    })

    if (durableJob.agent_run_id && durableJob.agent_run_id !== run.id) {
      await admin.schema('agent').from('agent_runs').delete().eq('id', run.id).eq('status', 'QUEUED')
      return {
        agentRunId: durableJob.agent_run_id,
        durableJobId: durableJob.id,
        status: durableJob.status,
        reused: true,
      }
    }

    return {
      agentRunId: run.id,
      durableJobId: durableJob.id,
      status: durableJob.status,
      reused: false,
    }
  } catch (error) {
    await admin.schema('agent').from('agent_runs').update({
      status: 'FAILED',
      error_code: 'DATA_QUALITY_QUEUE_FAILED',
      error_message: error instanceof Error ? error.message : 'Unable to enqueue data quality job.',
      completed_at: new Date().toISOString(),
    }).eq('id', run.id).eq('status', 'QUEUED')
    throw error
  }
}
