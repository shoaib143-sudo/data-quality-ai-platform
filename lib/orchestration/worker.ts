import { executePreparedProfilingJob } from '@/lib/agents/run-profiling-job'
import { executeQualityAutomation } from '@/lib/data-quality/automation'
import { evaluateObservabilitySignals } from '@/lib/observability/evaluate'
import { deliverNotificationJob } from '@/lib/observability/notifications'
import { executeMetadataDiscovery } from '@/lib/catalog/discovery'
import {
  markDurableJobFailed,
  markDurableJobSucceeded,
  type DurableJob,
} from '@/lib/orchestration/queue'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function executeDurableJob(job: DurableJob) {
  const payload = job.payload ?? {}

  if (job.job_type === 'PROFILING') {
    const userId = text(payload.userId)
    const projectId = text(payload.projectId)
    const datasetVersionId = text(payload.datasetVersionId)
    const agentDefinitionId = text(payload.agentDefinitionId)
    const agentVersion = text(payload.agentVersion)
    const agentRunId = text(payload.agentRunId)
    const profilingRunId = text(payload.profilingRunId)
    const requestInput = payload.requestInput && typeof payload.requestInput === 'object' && !Array.isArray(payload.requestInput)
      ? payload.requestInput as Record<string, unknown>
      : {}
    if (!userId || !projectId || !datasetVersionId || !agentDefinitionId || !agentVersion || !agentRunId || !profilingRunId) {
      throw new Error('Durable profiling job payload is incomplete.')
    }
    await executePreparedProfilingJob({ userId, projectId, datasetVersionId, agentDefinitionId, agentVersion, agentRunId, profilingRunId, requestInput })
    return
  }

  if (job.job_type === 'DATA_QUALITY') {
    const datasetVersionId = text(payload.datasetVersionId)
    const profileRunId = text(payload.profileRunId)
    const userId = text(payload.userId)
    const agentRunId = text(payload.agentRunId)
    if (!datasetVersionId || !profileRunId || !agentRunId) throw new Error('Durable data quality job payload is incomplete.')
    await executeQualityAutomation({
      datasetVersionId,
      profileRunId,
      userId: userId || null,
      existingAgentRunId: agentRunId,
    })
    await evaluateObservabilitySignals(datasetVersionId, profileRunId)
    return
  }

  if (job.job_type === 'OBSERVABILITY') {
    const datasetVersionId = text(payload.datasetVersionId)
    const profileRunId = text(payload.profileRunId)
    if (!datasetVersionId || !profileRunId) throw new Error('Durable observability job payload is incomplete.')
    await evaluateObservabilitySignals(datasetVersionId, profileRunId)
    return
  }

  if (job.job_type === 'NOTIFICATION') {
    const deliveryId = text(payload.deliveryId)
    if (!deliveryId) throw new Error('Durable notification job payload is incomplete.')
    await deliverNotificationJob(deliveryId)
    return
  }

  if (job.job_type === 'DISCOVERY') {
    const sourceId = text(payload.sourceId) || text(job.entity_id)
    if (!sourceId) throw new Error('Durable metadata discovery job payload is incomplete.')
    await executeMetadataDiscovery(sourceId)
    return
  }

  throw new Error(`Unsupported durable job type: ${job.job_type}`)
}

export async function processDurableJobs(jobs: DurableJob[]) {
  const results: Array<Record<string, unknown>> = []
  for (const job of jobs) {
    try {
      await executeDurableJob(job)
      await markDurableJobSucceeded(job)
      results.push({ jobId: job.id, agentRunId: job.agent_run_id, status: 'SUCCEEDED' })
    } catch (error) {
      await markDurableJobFailed(job, error)
      results.push({
        jobId: job.id,
        agentRunId: job.agent_run_id,
        status: job.attempts >= job.max_attempts ? 'DEAD' : 'RETRY',
        error: error instanceof Error ? error.message : 'Job execution failed.',
      })
    }
  }
  return results
}
