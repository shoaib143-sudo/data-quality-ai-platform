import { createAdminClient } from '@/lib/supabase/admin'

export type LearningExperimentArm = 'BASELINE' | 'CANDIDATE'
export type LearningExperimentAttemptStatus =
  | 'PREPARED'
  | 'DISPATCHED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RECONCILIATION_REQUIRED'

export type PreparedLearningExperimentAttempt = {
  attemptId: string
  runId: string
  executionKey: string
  status: LearningExperimentAttemptStatus
  reused: boolean
}

export type LearningExperimentExecutionResult = {
  terminalStatus: Exclude<LearningExperimentAttemptStatus, 'PREPARED' | 'DISPATCHED'>
  outputEvidenceRef?: string | null
  reservationId?: string | null
  costEventId?: string | null
  errorCode?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXECUTION_KEY = /^sha256:[a-f0-9]{64}$/

function requiredUuid(value: string, label: string) {
  const normalized = value.trim()
  if (!UUID.test(normalized)) throw new Error(`${label} must be a canonical UUID`)
  return normalized
}
function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}
function parseStatus(value: unknown): LearningExperimentAttemptStatus {
  const status = String(value)
  if (!['PREPARED','DISPATCHED','COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED'].includes(status)) {
    throw new Error(`Invalid learning experiment attempt status: ${status}`)
  }
  return status as LearningExperimentAttemptStatus
}
function parsePrepared(data: unknown): PreparedLearningExperimentAttempt {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid learning experiment preparation evidence')
  const row = data as Record<string, unknown>
  const attemptId = requiredUuid(String(row.attemptId ?? ''), 'attemptId')
  const runId = requiredUuid(String(row.runId ?? ''), 'runId')
  const executionKey = String(row.executionKey ?? '')
  if (!EXECUTION_KEY.test(executionKey)) throw new Error('executionKey must be an immutable SHA-256 binding')
  return { attemptId, runId, executionKey, status: parseStatus(row.status), reused: row.reused === true }
}

export async function prepareGovernedLearningExperimentAttempt(input: {
  projectId: string
  policyId: string
  candidateId: string
  datasetManifestId: string
  caseKey: string
  arm: LearningExperimentArm
  agentDefinitionId: string
  version: string
  inputEvidenceRef: string
}): Promise<PreparedLearningExperimentAttempt> {
  const projectId = requiredUuid(input.projectId, 'projectId')
  const policyId = requiredUuid(input.policyId, 'policyId')
  const candidateId = requiredUuid(input.candidateId, 'candidateId')
  const datasetManifestId = requiredUuid(input.datasetManifestId, 'datasetManifestId')
  const agentDefinitionId = requiredUuid(input.agentDefinitionId, 'agentDefinitionId')
  const caseKey = input.caseKey.trim()
  if (!/^[a-f0-9]{64}$/.test(caseKey)) throw new Error('caseKey must be a SHA-256 digest')
  if (!['BASELINE','CANDIDATE'].includes(input.arm)) throw new Error('arm must be BASELINE or CANDIDATE')

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('prepare_learning_experiment_attempt', {
    p_project_id: projectId,
    p_policy_id: policyId,
    p_candidate_id: candidateId,
    p_dataset_manifest_id: datasetManifestId,
    p_case_key: caseKey,
    p_arm: input.arm,
    p_agent_definition_id: agentDefinitionId,
    p_version: requiredText(input.version, 'version'),
    p_input_evidence_ref: requiredText(input.inputEvidenceRef, 'inputEvidenceRef'),
    p_synthetic: false,
  })
  if (error) throw new Error(`Unable to prepare learning experiment attempt: ${error.message}`)
  return parsePrepared(data)
}

export async function beginGovernedLearningExperimentDispatch(input: {
  projectId: string
  attemptId: string
  executionKey: string
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('begin_learning_experiment_dispatch', {
    p_project_id: requiredUuid(input.projectId, 'projectId'),
    p_attempt_id: requiredUuid(input.attemptId, 'attemptId'),
    p_execution_key: requiredText(input.executionKey, 'executionKey'),
  })
  if (error) throw new Error(`Unable to commit learning experiment dispatch: ${error.message}`)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid learning experiment dispatch evidence')
  const row = data as Record<string, unknown>
  return {
    admitted: row.admitted === true,
    reason: requiredText(String(row.reason ?? ''), 'dispatch reason'),
    runId: requiredUuid(String(row.runId ?? ''), 'runId'),
    status: parseStatus(row.status),
  }
}

export async function completeGovernedLearningExperimentAttempt(input: {
  projectId: string
  attemptId: string
  executionKey: string
  result: LearningExperimentExecutionResult
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('complete_learning_experiment_attempt', {
    p_project_id: requiredUuid(input.projectId, 'projectId'),
    p_attempt_id: requiredUuid(input.attemptId, 'attemptId'),
    p_execution_key: requiredText(input.executionKey, 'executionKey'),
    p_terminal_status: input.result.terminalStatus,
    p_output_evidence_ref: input.result.outputEvidenceRef?.trim() || null,
    p_reservation_id: input.result.reservationId ? requiredUuid(input.result.reservationId, 'reservationId') : null,
    p_cost_event_id: input.result.costEventId ? requiredUuid(input.result.costEventId, 'costEventId') : null,
    p_error_code: input.result.errorCode?.trim() || null,
  })
  if (error) throw new Error(`Unable to complete learning experiment attempt: ${error.message}`)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid learning experiment completion evidence')
  const row = data as Record<string, unknown>
  return {
    status: parseStatus(row.status),
    idempotent: row.idempotent === true,
    runId: requiredUuid(String(row.runId ?? ''), 'runId'),
  }
}

/**
 * Server-owned orchestration envelope for one immutable held-out case arm.
 *
 * No live executor is registered here. Callers must provide a trusted server-only
 * executor that uses the existing governed runtime and learning budget adapter.
 * Any exception after dispatch becomes RECONCILIATION_REQUIRED so a retry can
 * never silently issue a second ambiguous paid attempt.
 */
export async function executeGovernedLearningExperimentArm(
  input: Parameters<typeof prepareGovernedLearningExperimentAttempt>[0],
  executor: (context: PreparedLearningExperimentAttempt) => Promise<LearningExperimentExecutionResult>,
) {
  const prepared = await prepareGovernedLearningExperimentAttempt(input)
  const dispatch = await beginGovernedLearningExperimentDispatch({
    projectId: input.projectId,
    attemptId: prepared.attemptId,
    executionKey: prepared.executionKey,
  })
  if (!dispatch.admitted) {
    const error = new Error(`Learning experiment dispatch blocked: ${dispatch.reason}`)
    error.name = 'LearningExperimentResumeBlockedError'
    throw error
  }

  try {
    const result = await executor({ ...prepared, status: 'DISPATCHED' })
    return await completeGovernedLearningExperimentAttempt({
      projectId: input.projectId,
      attemptId: prepared.attemptId,
      executionKey: prepared.executionKey,
      result,
    })
  } catch (error) {
    try {
      await completeGovernedLearningExperimentAttempt({
        projectId: input.projectId,
        attemptId: prepared.attemptId,
        executionKey: prepared.executionKey,
        result: {
          terminalStatus: 'RECONCILIATION_REQUIRED',
          errorCode: error instanceof Error ? error.name : 'UNKNOWN_EXECUTOR_FAILURE',
        },
      })
    } catch {
      // The durable DISPATCHED row remains visible and blocks re-dispatch.
      // Never hide the original executor failure with a secondary persistence error.
    }
    throw error
  }
}
