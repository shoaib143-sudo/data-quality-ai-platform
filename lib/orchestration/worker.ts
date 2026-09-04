import { executePreparedProfilingJob } from '@/lib/agents/run-profiling-job'
import { executeQualityAutomation } from '@/lib/data-quality/automation'
import { investigateDataQualityRun } from '@/lib/data-quality/autonomous-operations'
import { verifyDataQualityRemediation } from '@/lib/data-quality/remediation-verification'
import { evaluateObservabilitySignals } from '@/lib/observability/evaluate'
import { investigateObservabilityIncident } from '@/lib/observability/incident-intelligence'
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

async function loadOutcomeEvidence(workflowInstanceId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .schema('governance')
    .from('profiling_remediation_outcomes')
    .select('outcome,checks')
    .eq('workflow_instance_id', workflowInstanceId)
    .maybeSingle()
  return {
    outcome: data?.outcome && typeof data.outcome === 'object' && !Array.isArray(data.outcome) ? data.outcome as Record<string, unknown> : {},
    checks: data?.checks && typeof data.checks === 'object' && !Array.isArray(data.checks) ? data.checks as Record<string, unknown> : {},
  }
}

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
  const existing = await loadOutcomeEvidence(input.workflowInstanceId)

  await admin.schema('governance').from('profiling_remediation_outcomes').update({
    status: 'VERIFICATION_QUEUED',
    checks: {
      ...existing.checks,
      automatic_reprofile_completed: { passed: false, retryable: true, profiling_run_id: input.profilingRunId, error: message },
    },
    outcome: {
      ...existing.outcome,
      verification_passed: null,
      recommendation_effective: null,
      verification_source: 'AUTOMATIC_WORKER',
      verification_error: message,
      verification_cancelled: false,
      verification_retryable: true,
    },
    updated_at: now,
    verified_at: null,
  }).eq('workflow_instance_id', input.workflowInstanceId)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.userId,
    actorType: 'SYSTEM',
    eventType: 'PROFILING_REMEDIATION_AUTOMATIC_VERIFICATION_ERROR',
    entityType: 'PROFILE_RUN',
    entityId: input.profilingRunId,
    correlationId: input.workflowInstanceId,
    metadata: { workflow_instance_id: input.workflowInstanceId, verification_profile_run_id: input.profilingRunId, retryable: true, error: message },
  })
}

async function recordAutomaticVerificationCancellation(input: {
  workflowInstanceId: string
  projectId: string
  userId: string
  profilingRunId: string
}) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const existing = await loadOutcomeEvidence(input.workflowInstanceId)

  await admin.schema('governance').from('profiling_remediation_outcomes').update({
    status: 'VERIFICATION_CANCELLED',
    checks: {
      ...existing.checks,
      automatic_reprofile_cancelled: { cancelled: true, profiling_run_id: input.profilingRunId, cancelled_at: now },
    },
    outcome: {
      ...existing.outcome,
      verification_passed: null,
      recommendation_effective: null,
      verification_source: 'AUTOMATIC_WORKER',
      verification_error: null,
      verification_cancelled: true,
      verification_cancelled_at: now,
      verification_retryable: true,
    },
    updated_at: now,
    verified_at: null,
  }).eq('workflow_instance_id', input.workflowInstanceId)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.userId,
    actorType: 'SYSTEM',
    eventType: 'PROFILING_REMEDIATION_AUTOMATIC_VERIFICATION_CANCELLED',
    entityType: 'PROFILE_RUN',
    entityId: input.profilingRunId,
    correlationId: input.workflowInstanceId,
    metadata: { workflow_instance_id: input.workflowInstanceId, verification_profile_run_id: input.profilingRunId, restartable: true },
  })
}

async function prepareProfilingAttempt(input: { agentRunId: string; profilingRunId: string }) {
  const admin = createAdminClient()
  const [{ data: profileRun, error: profileError }, { data: agentRun, error: agentError }] = await Promise.all([
    admin.schema('profiling').from('profile_runs').select('id,status,error_code,error_message').eq('id', input.profilingRunId).maybeSingle(),
    admin.schema('agent').from('agent_runs').select('id,status').eq('id', input.agentRunId).maybeSingle(),
  ])
  if (profileError || !profileRun) throw new Error(`Unable to resolve durable profiling run: ${profileError?.message ?? 'not found'}`)
  if (agentError || !agentRun) throw new Error(`Unable to resolve durable profiling agent run: ${agentError?.message ?? 'not found'}`)

  if (profileRun.status === 'COMPLETED') {
    if (agentRun.status !== 'SUCCEEDED' && agentRun.status !== 'CANCELLED') {
      await admin.schema('agent').from('agent_runs').update({
        status: 'SUCCEEDED',
        error_code: null,
        error_message: null,
        completed_at: new Date().toISOString(),
      }).eq('id', input.agentRunId)
    }
    return { execute: false, status: profileRun.status }
  }

  if (profileRun.status === 'CANCELLED' || agentRun.status === 'CANCELLED') {
    return { execute: false, status: 'CANCELLED' }
  }

  if (profileRun.status === 'FAILED') {
    await admin.schema('profiling').from('profile_runs').update({
      status: 'RUNNING',
      error_code: null,
      error_message: null,
      completed_at: null,
      started_at: new Date().toISOString(),
    }).eq('id', input.profilingRunId)
    await admin.schema('agent').from('agent_runs').update({
      status: 'QUEUED',
      error_code: null,
      error_message: null,
      completed_at: null,
    }).eq('id', input.agentRunId).neq('status', 'CANCELLED')
  } else if (agentRun.status === 'FAILED') {
    await admin.schema('agent').from('agent_runs').update({
      status: 'QUEUED',
      error_code: null,
      error_message: null,
      completed_at: null,
    }).eq('id', input.agentRunId)
  }

  return { execute: true, status: profileRun.status }
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

    const automaticVerification = text(requestInput.trigger) === 'PROFILING_REMEDIATION_VERIFICATION'
    const workflowInstanceId = automaticVerification ? text(requestInput.workflowInstanceId) : ''
    if (automaticVerification && !workflowInstanceId) throw new Error('Automatic remediation verification payload is missing workflowInstanceId.')

    const preparation = await prepareProfilingAttempt({ agentRunId, profilingRunId })
    if (preparation.status === 'CANCELLED') {
      if (automaticVerification) {
        await recordAutomaticVerificationCancellation({ workflowInstanceId, projectId, userId, profilingRunId })
      }
      return
    }

    if (preparation.execute) {
      await executePreparedProfilingJob({ userId, projectId, datasetVersionId, agentDefinitionId, agentVersion, agentRunId, profilingRunId, requestInput })
    }

    const admin = createAdminClient()
    const { data: completedRun, error: completedRunError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .select('id,status,error_code,error_message')
      .eq('id', profilingRunId)
      .maybeSingle()

    if (completedRunError || !completedRun) {
      const technicalError = new Error(`Unable to resolve durable profiling run after execution: ${completedRunError?.message ?? 'not found'}`)
      if (automaticVerification) await recordAutomaticVerificationError({ workflowInstanceId, projectId, userId, profilingRunId, error: technicalError })
      throw technicalError
    }
    if (completedRun.status === 'CANCELLED') {
      if (automaticVerification) {
        await recordAutomaticVerificationCancellation({ workflowInstanceId, projectId, userId, profilingRunId })
      }
      return
    }
    if (completedRun.status !== 'COMPLETED') {
      const technicalError = new Error(completedRun.error_message || completedRun.error_code || `Profiling run ended as ${completedRun.status}.`)
      if (automaticVerification) await recordAutomaticVerificationError({ workflowInstanceId, projectId, userId, profilingRunId, error: technicalError })
      throw technicalError
    }

    if (automaticVerification) {
      try {
        await verifyRemediationOutcome({
          workflowInstanceId,
          verificationProfileRunId: profilingRunId,
          actorUserId: userId,
          verificationSource: 'AUTOMATIC_WORKER',
        })
      } catch (verificationError) {
        await recordAutomaticVerificationError({ workflowInstanceId, projectId, userId, profilingRunId, error: verificationError })
        throw verificationError
      }
    }
    return
  }

  if (job.job_type === 'DATA_QUALITY') {
    const datasetVersionId = text(payload.datasetVersionId)
    const profileRunId = text(payload.profileRunId)
    const userId = text(payload.userId)
    const agentRunId = text(payload.agentRunId)
    const trigger = text(payload.trigger)
    const workflowInstanceId = text(payload.workflowInstanceId)
    if (!datasetVersionId || !profileRunId || !agentRunId) throw new Error('Durable data quality job payload is incomplete.')
    if (trigger === 'DATA_QUALITY_REMEDIATION_VERIFICATION' && !workflowInstanceId) throw new Error('Data quality verification payload is missing workflowInstanceId.')

    const result = await executeQualityAutomation({
      datasetVersionId,
      profileRunId,
      userId: userId || null,
      existingAgentRunId: agentRunId,
    })

    if (trigger === 'DATA_QUALITY_REMEDIATION_VERIFICATION') {
      await verifyDataQualityRemediation({
        workflowInstanceId,
        verificationAgentRunId: result.agentRunId,
        actorUserId: userId || null,
        verificationSource: 'AUTOMATIC_WORKER',
      })
    } else {
      await investigateDataQualityRun({ agentRunId: result.agentRunId, userId: userId || null })
    }

    await evaluateObservabilitySignals(datasetVersionId, profileRunId)
    await investigateObservabilityIncident({ datasetVersionId, profileRunId, userId: userId || null })
    return
  }

  if (job.job_type === 'OBSERVABILITY') {
    const datasetVersionId = text(payload.datasetVersionId)
    const profileRunId = text(payload.profileRunId)
    const userId = text(payload.userId)
    if (!datasetVersionId || !profileRunId) throw new Error('Durable observability job payload is incomplete.')
    await evaluateObservabilitySignals(datasetVersionId, profileRunId)
    await investigateObservabilityIncident({ datasetVersionId, profileRunId, userId: userId || null })
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