import { ExecutionRecoveryHandlerRegistry } from './execution-recovery-runtime'
import {
  createProfileReadinessRecoveryHandler,
  createSourceReadinessRecoveryHandler,
} from './execution-recovery-handlers'
import { executePersistedRecovery } from './execution-recovery-persistence'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DurableJob } from './queue'
import type { RecoveryFailureContext, RecoveryStage } from './execution-recovery-contract'

export type ExecutionRecoveryAgentInput = {
  context: RecoveryFailureContext
  failureClassification: string
}

export function createExecutionRecoveryAgentRegistry() {
  return new ExecutionRecoveryHandlerRegistry([
    createSourceReadinessRecoveryHandler(),
    createProfileReadinessRecoveryHandler(),
  ])
}

/**
 * Existing Execution Recovery Agent closed-loop entry point.
 *
 * Mutation authority remains deterministic and P0/P1-only. Specialist handlers
 * reuse existing governed repair implementations and the persistence layer fences
 * duplicate mutations before any handler can apply a repair.
 */
export async function executeExecutionRecoveryAgent(input: ExecutionRecoveryAgentInput) {
  return executePersistedRecovery({
    context: input.context,
    failureClassification: input.failureClassification,
    registry: createExecutionRecoveryAgentRegistry(),
  })
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function activeReadinessBlockers(readiness: Record<string, unknown>) {
  const blockers = object(readiness.blockers)
  return Object.entries(blockers).filter(([, active]) => active === true).map(([code]) => code)
}

function readinessApprovalRequired(readiness: Record<string, unknown>) {
  const remediation = object(readiness.remediation)
  return activeReadinessBlockers(readiness).some(code => object(remediation[code]).approval_required === true)
}

function recoveryStageForFailure(job: DurableJob, error: Record<string, unknown>): RecoveryStage {
  if (text(error.code) === 'PROFILE_READINESS_GATE_BLOCKED' && job.job_type === 'PROFILING') return 'PROFILE_RUN'
  return 'GOVERNED_WORKFLOW'
}

async function loadRecoveryCaseForDurableJob(jobId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('orchestration')
    .from('recovery_cases')
    .select('id,classification,retry_attempt,status,final_outcome')
    .eq('durable_job_id', jobId)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve terminal execution recovery case: ${error.message}`)
  return data
}

async function resumeValidatedRecoveryCase(recoveryCaseId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').rpc('resume_execution_recovery_job', {
    p_case_id: recoveryCaseId,
  })
  if (error) throw new Error(`Unable to resume validated execution recovery: ${error.message}`)
  const result = object(data)
  return {
    resumed: result.resumed === true,
    reason: text(result.reason) || null,
    retryStage: text(result.retry_stage) || null,
    retryCheckpointId: text(result.retry_checkpoint_id) || null,
  }
}

export async function recoverTerminalDurableJobFailure(job: DurableJob, failure: unknown) {
  if (job.attempts < job.max_attempts) {
    return { attempted: false, reason: 'JOB_NOT_TERMINAL' as const }
  }

  const recoveryCase = await loadRecoveryCaseForDurableJob(job.id)
  if (!recoveryCase) return { attempted: false, reason: 'RECOVERY_CASE_NOT_CAPTURED' as const }
  if (recoveryCase.status === 'RETRY_QUEUED') return { attempted: false, reason: 'RESUME_ALREADY_QUEUED' as const }
  if (recoveryCase.final_outcome === 'RECOVERED') return { attempted: false, reason: 'ALREADY_RECOVERED' as const }

  const error = object(failure)
  const payload = object(job.payload)
  const readiness = object(error.readiness)
  const errorCode = text(error.code)
  const failingStage = recoveryStageForFailure(job, error)
  const datasetVersionId = text(readiness.dataset_version_id) || text(payload.datasetVersionId)
  const sourceId = text(readiness.source_id)
  const agentRunId = text(payload.agentRunId) || text(job.agent_run_id)
  const profileReadinessFailure = errorCode === 'PROFILE_READINESS_GATE_BLOCKED'
    && job.job_type === 'PROFILING'
    && Boolean(datasetVersionId)
    && Boolean(agentRunId)

  const knownRepairClass = profileReadinessFailure ? 'PROFILING_READINESS_RECONCILIATION' as const : null
  const approvalRequired = readinessApprovalRequired(readiness)
  const failingCheckpointId = failingStage === 'PROFILE_RUN'
    ? `profile-run:${text(payload.profilingRunId) || job.id}:readiness`
    : `durable-job:${job.id}`

  const context: RecoveryFailureContext = {
    recoveryCaseId: recoveryCase.id,
    projectId: job.project_id,
    workflowRunId: job.agent_run_id ?? job.id,
    failingStage,
    failingCheckpointId,
    code: errorCode || null,
    retryable: profileReadinessFailure,
    blocking: true,
    securityRelevant: recoveryCase.classification === 'AUTHORIZATION',
    credentialMissing: activeReadinessBlockers(readiness).some(code => /CREDENTIAL/i.test(code)),
    privilegeExpansionRequired: recoveryCase.classification === 'AUTHORIZATION',
    destructiveMutationRequired: false,
    policyBlocked: approvalRequired,
    productionMutationRequired: false,
    knownRepairClass,
    retryAttempt: Number(recoveryCase.retry_attempt ?? 0),
    maxRepairAttempts: 2,
    evidence: [
      { type: 'DURABLE_JOB', id: job.id },
      ...(job.agent_run_id ? [{ type: 'AGENT_RUN', id: job.agent_run_id }] : []),
    ],
    checkpoints: [
      { id: failingCheckpointId, stage: failingStage, valid: false, completed: false },
    ],
    repairParameters: {
      datasetVersionId,
      sourceId,
      agentRunId,
    },
  }

  const result = await executeExecutionRecoveryAgent({
    context,
    failureClassification: text(recoveryCase.classification) || 'UNKNOWN',
  })

  if (result.replayState === 'RESUME_PENDING' || result.replayState === 'RECOVERED' || result.replayState === 'TERMINAL') {
    return { attempted: true, recovery: result, resume: null }
  }

  if (result.record.post_repair_validation_result !== 'PASSED' || !result.record.retry_stage) {
    return { attempted: true, recovery: result, resume: null }
  }

  const resume = await resumeValidatedRecoveryCase(recoveryCase.id)
  return { attempted: true, recovery: result, resume }
}
