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

function stageForProfilingStep(stepName: string): RecoveryStage {
  if (stepName === 'profile_dataset') return 'PROFILE_RUN'
  if (stepName === 'execute_metrics') return 'METRIC_EXECUTION'
  if (stepName === 'investigate_profile') return 'FINDINGS_GENERATION'
  return 'GOVERNED_WORKFLOW'
}

function recoveryStageForFailure(job: DurableJob, error: Record<string, unknown>, failedStepName?: string | null): RecoveryStage {
  if (failedStepName) return stageForProfilingStep(failedStepName)
  if (text(error.code) === 'PROFILE_READINESS_GATE_BLOCKED' && job.job_type === 'PROFILING') return 'PROFILE_RUN'
  return 'GOVERNED_WORKFLOW'
}

function isConcreteTransientFailure(message: string) {
  return /(connection timeout|connect timeout|connection reset|temporar|timed out|timeout|network|econnreset|econnrefused|fetch failed|socket)/i.test(message)
}

async function loadAgentRecoverySteps(agentRunId: string) {
  if (!agentRunId) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_run_steps')
    .select('id,step_name,step_order,status,error_code,error_message,attempt')
    .eq('agent_run_id', agentRunId)
    .order('step_order', { ascending: true })
  if (error) throw new Error(`Unable to load profiling recovery checkpoints: ${error.message}`)
  return data ?? []
}

async function loadCurrentReadiness(projectId: string, datasetVersionId: string) {
  if (!projectId || !datasetVersionId) return {}
  const admin = createAdminClient()
  const { data, error } = await admin.schema('catalog').rpc('verify_dataset_version_profile_readiness', {
    p_project_id: projectId,
    p_dataset_version_id: datasetVersionId,
  })
  if (error) throw new Error(`Unable to load current profiling readiness evidence: ${error.message}`)
  return object(data)
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
  const errorCode = text(error.code)
  const datasetVersionId = text(object(error.readiness).dataset_version_id) || text(payload.datasetVersionId)
  const agentRunId = text(payload.agentRunId) || text(job.agent_run_id)
  const [agentSteps, currentReadiness] = await Promise.all([
    loadAgentRecoverySteps(agentRunId),
    loadCurrentReadiness(job.project_id, datasetVersionId),
  ])
  const readinessFromError = object(error.readiness)
  const readiness = Object.keys(readinessFromError).length ? readinessFromError : currentReadiness
  const sourceId = text(readiness.source_id)
  const failedStep = [...agentSteps].reverse().find(step => step.status === 'FAILED') ?? null
  const failingStage = recoveryStageForFailure(job, error, failedStep?.step_name ?? null)
  const errorMessage = text(error.message) || text(failedStep?.error_message)
  const profileReadinessFailure = errorCode === 'PROFILE_READINESS_GATE_BLOCKED'
    && job.job_type === 'PROFILING'
    && Boolean(datasetVersionId)
    && Boolean(agentRunId)
  const transientMetricFailure = failingStage === 'METRIC_EXECUTION'
    && isConcreteTransientFailure(errorMessage)
    && Boolean(sourceId)

  const knownRepairClass = profileReadinessFailure
    ? 'PROFILING_READINESS_RECONCILIATION' as const
    : transientMetricFailure
      ? 'SOURCE_READINESS_RECONCILIATION' as const
      : null
  const approvalRequired = readinessApprovalRequired(readiness)
  const failingCheckpointId = failedStep?.id
    ?? (failingStage === 'PROFILE_RUN'
      ? `profile-run:${text(payload.profilingRunId) || job.id}:readiness`
      : `durable-job:${job.id}`)

  const context: RecoveryFailureContext = {
    recoveryCaseId: recoveryCase.id,
    projectId: job.project_id,
    workflowRunId: job.agent_run_id ?? job.id,
    failingStage,
    failingCheckpointId,
    code: errorCode || null,
    retryable: profileReadinessFailure || transientMetricFailure,
    blocking: true,
    securityRelevant: recoveryCase.classification === 'AUTHORIZATION',
    credentialMissing: activeReadinessBlockers(readiness).some(code => /CREDENTIAL/i.test(code)) || /missing.*credential|credential.*missing/i.test(errorMessage),
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
    checkpoints: agentSteps.length
      ? agentSteps.map(step => ({
          id: step.id,
          stage: stageForProfilingStep(text(step.step_name)),
          valid: step.status === 'SUCCEEDED',
          completed: step.status === 'SUCCEEDED',
        }))
      : [{ id: failingCheckpointId, stage: failingStage, valid: false, completed: false }],
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
