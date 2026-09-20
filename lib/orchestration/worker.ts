import { proposePgclCaseFromVerifiedAgentRun } from '@/lib/agents/proactive-governed-case-learning-runtime'
import { executePreparedProfilingJob } from '@/lib/agents/run-profiling-job'
import { executeQualityAutomation } from '@/lib/data-quality/automation'
import { investigateDataQualityRun } from '@/lib/data-quality/autonomous-operations'
import { queueDataQualityVerificationAfterFreshProfile } from '@/lib/data-quality/remediation-reprofile'
import { verifyDataQualityRemediation } from '@/lib/data-quality/remediation-verification'
import { correlateObservabilityIncidents } from '@/lib/observability/cross-dataset-correlation'
import { evaluateObservabilitySignals } from '@/lib/observability/evaluate'
import { investigateObservabilityIncident } from '@/lib/observability/incident-intelligence'
import { deliverNotificationJob } from '@/lib/observability/notifications'
import { executeMetadataDiscovery } from '@/lib/catalog/discovery'
import { executeLineageEnrichment } from '@/lib/catalog/lineage-enrichment'
import { enrichObservabilityIncidentWithLineageImpact } from '@/lib/governance/lineage-impact'
import { verifyRemediationOutcome } from '@/lib/profiling/remediation-verification'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { createDefaultExecutionRecoveryRegistry } from '@/lib/orchestration/execution-recovery-handler-bindings'
import { executePersistedRecoveryAndQueueResume } from '@/lib/orchestration/execution-recovery-persistence'
import type { RecoveryFailureContext, RecoveryStage } from '@/lib/orchestration/execution-recovery-contract'
import { classifyTerminalRecoveryRoute, recoveryUnsafeFlags } from '@/lib/orchestration/execution-recovery-routing'
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

async function loadDataQualityOutcomeEvidence(workflowInstanceId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .schema('governance')
    .from('data_quality_remediation_outcomes')
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

async function recordDataQualityReprofileError(input: {
  workflowInstanceId: string
  projectId: string
  userId: string
  profilingRunId: string
  error: unknown
}) {
  const admin = createAdminClient()
  const message = input.error instanceof Error ? input.error.message : 'Data Quality verification re-profile failed.'
  const now = new Date().toISOString()
  const existing = await loadDataQualityOutcomeEvidence(input.workflowInstanceId)

  await admin.schema('governance').from('data_quality_remediation_outcomes').update({
    status: 'VERIFICATION_ERROR',
    checks: {
      ...existing.checks,
      fresh_profile_completed: { passed: false, retryable: true, profiling_run_id: input.profilingRunId, error: message },
    },
    outcome: {
      ...existing.outcome,
      verification_phase: 'FRESH_PROFILE_ERROR',
      verification_profile_run_id: input.profilingRunId,
      verification_error: message,
      verification_retryable: true,
    },
    updated_at: now,
    verified_at: null,
  }).eq('workflow_instance_id', input.workflowInstanceId)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.userId,
    actorType: 'SYSTEM',
    eventType: 'DATA_QUALITY_REMEDIATION_REPROFILE_ERROR',
    entityType: 'PROFILE_RUN',
    entityId: input.profilingRunId,
    correlationId: input.workflowInstanceId,
    metadata: { workflow_instance_id: input.workflowInstanceId, verification_profile_run_id: input.profilingRunId, retryable: true, error: message },
  })
}

async function recordDataQualityReprofileCancellation(input: {
  workflowInstanceId: string
  projectId: string
  userId: string
  profilingRunId: string
}) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const existing = await loadDataQualityOutcomeEvidence(input.workflowInstanceId)

  await admin.schema('governance').from('data_quality_remediation_outcomes').update({
    status: 'CANCELLED',
    checks: {
      ...existing.checks,
      fresh_profile_cancelled: { cancelled: true, profiling_run_id: input.profilingRunId, cancelled_at: now },
    },
    outcome: {
      ...existing.outcome,
      verification_phase: 'FRESH_PROFILE_CANCELLED',
      verification_profile_run_id: input.profilingRunId,
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
    eventType: 'DATA_QUALITY_REMEDIATION_REPROFILE_CANCELLED',
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

async function enrichIncidentImpact(input: {
  incident: Awaited<ReturnType<typeof investigateObservabilityIncident>>
  userId?: string | null
}) {
  if (!input.incident.incidentId || input.incident.status === 'RESOLVED') return null
  if (!('projectId' in input.incident) || !input.incident.projectId) return null
  return enrichObservabilityIncidentWithLineageImpact({
    incidentId: input.incident.incidentId,
    projectId: input.incident.projectId,
    datasetId: input.incident.datasetId,
    severity: 'severity' in input.incident ? input.incident.severity : null,
    actorUserId: input.userId ?? null,
  })
}

async function correlateIncidentProject(input: {
  incident: Awaited<ReturnType<typeof investigateObservabilityIncident>>
  userId?: string | null
}) {
  if (!('projectId' in input.incident) || !input.incident.projectId) return null
  return correlateObservabilityIncidents({ projectId: input.incident.projectId, actorUserId: input.userId ?? null })
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
    const baseRequestInput = payload.requestInput && typeof payload.requestInput === 'object' && !Array.isArray(payload.requestInput)
      ? payload.requestInput as Record<string, unknown>
      : {}
    const recoveryResume = payload.recoveryResume && typeof payload.recoveryResume === 'object' && !Array.isArray(payload.recoveryResume)
      ? payload.recoveryResume as Record<string, unknown>
      : null
    const requestInput = recoveryResume
      ? { ...baseRequestInput, recoveryResume }
      : baseRequestInput
    if (!userId || !projectId || !datasetVersionId || !agentDefinitionId || !agentVersion || !agentRunId || !profilingRunId) {
      throw new Error('Durable profiling job payload is incomplete.')
    }

    const trigger = text(requestInput.trigger)
    const automaticVerification = trigger === 'PROFILING_REMEDIATION_VERIFICATION'
    const dataQualityFreshProfileVerification = trigger === 'DATA_QUALITY_REMEDIATION_VERIFICATION_PROFILE'
    const governedVerification = automaticVerification || dataQualityFreshProfileVerification
    const workflowInstanceId = governedVerification ? text(requestInput.workflowInstanceId) : ''
    if (governedVerification && !workflowInstanceId) throw new Error('Automatic remediation verification payload is missing workflowInstanceId.')

    const preparation = await prepareProfilingAttempt({ agentRunId, profilingRunId })
    if (preparation.status === 'CANCELLED') {
      if (automaticVerification) {
        await recordAutomaticVerificationCancellation({ workflowInstanceId, projectId, userId, profilingRunId })
      } else if (dataQualityFreshProfileVerification) {
        await recordDataQualityReprofileCancellation({ workflowInstanceId, projectId, userId, profilingRunId })
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
      if (dataQualityFreshProfileVerification) await recordDataQualityReprofileError({ workflowInstanceId, projectId, userId, profilingRunId, error: technicalError })
      throw technicalError
    }
    if (completedRun.status === 'CANCELLED') {
      if (automaticVerification) {
        await recordAutomaticVerificationCancellation({ workflowInstanceId, projectId, userId, profilingRunId })
      } else if (dataQualityFreshProfileVerification) {
        await recordDataQualityReprofileCancellation({ workflowInstanceId, projectId, userId, profilingRunId })
      }
      return
    }
    if (completedRun.status !== 'COMPLETED') {
      const technicalError = new Error(completedRun.error_message || completedRun.error_code || `Profiling run ended as ${completedRun.status}.`)
      if (automaticVerification) await recordAutomaticVerificationError({ workflowInstanceId, projectId, userId, profilingRunId, error: technicalError })
      if (dataQualityFreshProfileVerification) await recordDataQualityReprofileError({ workflowInstanceId, projectId, userId, profilingRunId, error: technicalError })
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
    } else if (dataQualityFreshProfileVerification) {
      try {
        await queueDataQualityVerificationAfterFreshProfile({
          workflowInstanceId,
          verificationProfileRunId: profilingRunId,
          userId,
        })
      } catch (verificationError) {
        await recordDataQualityReprofileError({ workflowInstanceId, projectId, userId, profilingRunId, error: verificationError })
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
    const incident = await investigateObservabilityIncident({ datasetVersionId, profileRunId, userId: userId || null })
    await enrichIncidentImpact({ incident, userId: userId || null })
    await correlateIncidentProject({ incident, userId: userId || null })

    try {
      await proposePgclCaseFromVerifiedAgentRun({
        projectId: job.project_id,
        agentRunId: result.agentRunId,
        runMode: text(payload.learningRunMode) === 'SUPERVISED' ? 'SUPERVISED' : 'HANDSFREE',
        verificationEvidenceRefs: [
          `agent_run:${result.agentRunId}:succeeded`,
          `profile_run:${profileRunId}`,
        ],
        actorUserId: userId || null,
      })
    } catch (learningError) {
      console.error('[data-quality-worker] PGCL evaluation failed without changing data-quality success:', learningError)
    }
    return
  }

  if (job.job_type === 'OBSERVABILITY') {
    const datasetVersionId = text(payload.datasetVersionId)
    const profileRunId = text(payload.profileRunId)
    const userId = text(payload.userId)
    if (!datasetVersionId || !profileRunId) throw new Error('Durable observability job payload is incomplete.')
    await evaluateObservabilitySignals(datasetVersionId, profileRunId)
    const incident = await investigateObservabilityIncident({ datasetVersionId, profileRunId, userId: userId || null })
    await enrichIncidentImpact({ incident, userId: userId || null })
    await correlateIncidentProject({ incident, userId: userId || null })
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
    const userId = text(payload.userId) || text(payload.user_id)
    if (!sourceId) throw new Error('Durable metadata discovery job payload is incomplete.')
    await executeMetadataDiscovery(sourceId, userId || null, job.id)
    return
  }

  if (job.job_type === 'LINEAGE_ENRICHMENT') {
    const sourceId = text(payload.sourceId) || text(job.entity_id)
    const discoveryRunId = text(payload.discoveryRunId)
    const userId = text(payload.userId) || text(payload.user_id)
    if (!sourceId || !discoveryRunId) throw new Error('Durable lineage enrichment job payload is incomplete.')
    await executeLineageEnrichment({ sourceId, discoveryRunId, actorUserId: userId || null })
    return
  }

  throw new Error(`Unsupported durable job type: ${job.job_type}`)
}


function stepStage(stepName: string): RecoveryStage | null {
  const value = stepName.toLowerCase()
  if (/connector|connection/.test(value)) return 'CONNECTOR_ESTABLISHMENT'
  if (/source.*onboard|dataset.*register/.test(value)) return 'SOURCE_ONBOARDING'
  if (/readiness/.test(value)) return 'SOURCE_READINESS'
  if (/schema/.test(value)) return 'SCHEMA_DISCOVERY'
  if (/column/.test(value)) return 'PROFILE_COLUMNS'
  if (/metric/.test(value)) return 'METRIC_EXECUTION'
  if (/finding/.test(value)) return 'FINDINGS_GENERATION'
  if (/score|scoring/.test(value)) return 'QUALITY_SCORING'
  if (/governance.*insight|insight/.test(value)) return 'GOVERNANCE_INSIGHTS'
  if (/profile/.test(value)) return 'PROFILE_RUN'
  return null
}

async function loadRecoveryCheckpoints(job: DurableJob) {
  if (!job.agent_run_id) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_run_steps')
    .select('id,step_name,step_order,status,output')
    .eq('agent_run_id', job.agent_run_id)
    .order('step_order', { ascending: true })
  if (error) throw new Error(`Unable to load recovery checkpoints: ${error.message}`)

  return (data ?? []).flatMap(step => {
    const stage = stepStage(String(step.step_name ?? ''))
    if (!stage) return []
    const output = step.output && typeof step.output === 'object' && !Array.isArray(step.output)
      ? step.output as Record<string, unknown>
      : {}
    const upstreamIds = Object.fromEntries(
      Object.entries(output)
        .filter(([key, value]) => /id$/i.test(key) && typeof value === 'string' && value.trim())
        .map(([key, value]) => [key, String(value)]),
    )
    return [{
      id: String(step.id),
      stage,
      valid: step.status === 'SUCCEEDED',
      completed: step.status === 'SUCCEEDED',
      upstreamIds,
    }]
  })
}

async function attemptClosedLoopRecoveryAfterDeadJob(job: DurableJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'Durable job execution failed.')
  const route = classifyTerminalRecoveryRoute(job.job_type, message)
  if (!route) return { attempted: false, reason: 'NO_ALLOWLISTED_REPAIR_CLASS' as const }

  const admin = createAdminClient()
  const { data: recoveryCase, error: caseError } = await admin
    .schema('orchestration')
    .from('recovery_cases')
    .select('id,classification,retry_attempt')
    .eq('durable_job_id', job.id)
    .maybeSingle()
  if (caseError) throw new Error(`Unable to resolve terminal recovery case: ${caseError.message}`)
  if (!recoveryCase) throw new Error('Terminal durable job did not create a recovery case.')

  const payload = job.payload ?? {}
  const stage = route.stage
  const repairClass = route.repairClass
  const unsafe = recoveryUnsafeFlags(message)
  const checkpoints = await loadRecoveryCheckpoints(job)
  const sourceId = text(payload.sourceId) || text(job.entity_id)
  const datasetVersionId = text(payload.datasetVersionId)
  const agentRunId = text(payload.agentRunId) || text(job.agent_run_id)

  const context: RecoveryFailureContext = {
    recoveryCaseId: String(recoveryCase.id),
    projectId: job.project_id,
    workflowRunId: agentRunId || job.id,
    failingStage: stage,
    failingCheckpointId: null,
    code: message.slice(0, 500),
    retryable: false,
    blocking: true,
    securityRelevant: unsafe.securityRelevant,
    credentialMissing: unsafe.credentialMissing,
    privilegeExpansionRequired: unsafe.privilegeExpansionRequired,
    destructiveMutationRequired: unsafe.destructiveMutationRequired,
    policyBlocked: unsafe.policyBlocked,
    productionMutationRequired: false,
    knownRepairClass: repairClass,
    retryAttempt: Number(recoveryCase.retry_attempt ?? 0),
    maxRepairAttempts: 2,
    evidence: [
      { type: 'DURABLE_JOB', id: job.id },
      ...(job.agent_run_id ? [{ type: 'AGENT_RUN', id: job.agent_run_id }] : []),
    ],
    checkpoints,
    repairParameters: {
      durableJobId: job.id,
      restartScope: route.restartScope,
      ...(sourceId ? { sourceId } : {}),
      ...(datasetVersionId ? { datasetVersionId } : {}),
      ...(agentRunId ? { agentRunId } : {}),
    },
  }

  const recovery = await executePersistedRecoveryAndQueueResume({
    context,
    failureClassification: String(recoveryCase.classification ?? 'UNKNOWN'),
    registry: createDefaultExecutionRecoveryRegistry(),
  })

  return {
    attempted: true,
    recoveryCaseId: recovery.record.recovery_case_id,
    outcome: recovery.record.final_outcome,
    validation: recovery.record.post_repair_validation_result,
    retryStage: recovery.record.retry_stage,
    retryCheckpointId: route.restartScope === 'WHOLE_JOB' ? null : recovery.record.retry_checkpoint_id,
    restartScope: route.restartScope,
    resumeQueued: recovery.resume?.queued === true,
    resumeReason: recovery.resume?.reason ?? null,
  }
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
      let recovery: Record<string, unknown> | null = null
      if (job.attempts >= job.max_attempts) {
        try {
          recovery = await attemptClosedLoopRecoveryAfterDeadJob(job, error)
        } catch (recoveryError) {
          const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : 'Closed-loop recovery failed.'
          console.error('[execution-recovery-agent]', recoveryMessage.slice(0, 2000))
          recovery = { attempted: true, outcome: 'RECOVERY_ENGINE_ERROR', error: recoveryMessage }
        }
      }
      const status = recovery?.resumeQueued === true
        ? 'RECOVERY_QUEUED'
        : job.attempts >= job.max_attempts ? 'DEAD' : 'RETRY'
      results.push({
        jobId: job.id,
        agentRunId: job.agent_run_id,
        status,
        error: error instanceof Error ? error.message : 'Job execution failed.',
        recovery,
      })
    }
  }
  return results
}
