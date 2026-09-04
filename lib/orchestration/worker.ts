import { executePreparedProfilingJob } from '@/lib/agents/run-profiling-job'
import { executeQualityAutomation } from '@/lib/data-quality/automation'
import { evaluateObservabilitySignals } from '@/lib/observability/evaluate'
import { deliverNotificationJob } from '@/lib/observability/notifications'
import { executeMetadataDiscovery } from '@/lib/catalog/discovery'
import { verifyRemediationOutcome } from '@/lib/profiling/remediation-verification'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import {
  markDurableJobFailed,
  markDurableJobSucceeded,
  type DurableJob,
} from '@/lib/orchestration/queue'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

async function recordAutomaticVerificationError(input: {
  workflowInstanceId: string
  projectId: string
  userId: string
  profilingRunId: string
  error: unknown
}) {
  const admin = createAdminClient()
  const message = input.error instanceof Error ? input.error.message : 'Automatic remediation verification failed.'
  const now = new Date().toISOString()

  const { data: existing } = await admin
    .schema('governance')
    .from('profiling_remediation_outcomes')
    .select('outcome,checks')
    .eq('workflow_instance_id', input.workflowInstanceId)
    .maybeSingle()
  const priorOutcome = existing?.outcome && typeof existing.outcome === 'object' && !Array.isArray(existing.outcome) ? existing.outcome as Record<string, unknown> : {}
  const priorChecks = existing?.checks && typeof existing.checks === 'object' && !Array.isArray(existing.checks) ? existing.checks as Record<string, unknown> : {}

  await admin.schema('governance').from('profiling_remediation_outcomes').update({
    status: 'VERIFICATION_FAILED',
    checks: {
      ...priorChecks,
      automatic_reprofile_completed: { passed: false, profiling_run_id: input.profilingRunId, error: message },
    },
    outcome: {
      ...priorOutcome,
      verification_passed: false,
      recommendation_effective: false,
      verification_source: 'AUTOMATIC_WORKER',
      verification_error: message,
    },
    updated_at: now,
    verified_at: now,
  }).eq('workflow_instance_id', input.workflowInstanceId)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.userId,
    actorType: 'SYSTEM',
    eventType: 'PROFILING_REMEDIATION_AUTOMATIC_VERIFICATION_ERROR',
    entityType: 'PROFILE_RUN',
    entityId: input.profilingRunId,
    correlationId: input.workflowInstanceId,
    metadata: { workflow_instance_id: input.workflowInstanceId, verification_profile_run_id: input.profilingRunId, error: message },
  })
}

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

    if (text(requestInput.trigger) === 'PROFILING_REMEDIATION_VERIFICATION') {
      const workflowInstanceId = text(requestInput.workflowInstanceId)
      if (!workflowInstanceId) throw new Error('Automatic remediation verification payload is missing workflowInstanceId.')

      const admin = createAdminClient()
      const { data: completedRun, error: completedRunError } = await admin
        .schema('profiling')
        .from('profile_runs')
        .select('id,status,error_code,error_message')
        .eq('id', profilingRunId)
        .maybeSingle()

      if (completedRunError || !completedRun) {
        await recordAutomaticVerificationError({
          workflowInstanceId,
          projectId,
          userId,
          profilingRunId,
          error: new Error(`Unable to resolve automatic verification profiling run: ${completedRunError?.message ?? 'not found'}`),
        })
      } else if (completedRun.status !== 'COMPLETED') {
        await recordAutomaticVerificationError({
          workflowInstanceId,
          projectId,
          userId,
          profilingRunId,
          error: new Error(completedRun.error_message || completedRun.error_code || `Verification profiling run ended as ${completedRun.status}.`),
        })
      } else {
        try {
          await verifyRemediationOutcome({
            workflowInstanceId,
            verificationProfileRunId: profilingRunId,
            actorUserId: userId,
            verificationSource: 'AUTOMATIC_WORKER',
          })
        } catch (verificationError) {
          await recordAutomaticVerificationError({ workflowInstanceId, projectId, userId, profilingRunId, error: verificationError })
        }
      }
    }
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
