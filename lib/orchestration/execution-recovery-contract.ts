export type RecoverySeverity = 'P0' | 'P1' | 'P2' | 'P3'

export type RecoveryStage =
  | 'CONNECTOR_ESTABLISHMENT'
  | 'SOURCE_ONBOARDING'
  | 'SOURCE_READINESS'
  | 'PROFILE_RUN'
  | 'SCHEMA_DISCOVERY'
  | 'PROFILE_COLUMNS'
  | 'METRIC_EXECUTION'
  | 'METRIC_PERSISTENCE'
  | 'FINDINGS_GENERATION'
  | 'QUALITY_SCORING'
  | 'GOVERNANCE_INSIGHTS'
  | 'GOVERNED_WORKFLOW'

export type RecoveryRepairClass =
  | 'TRANSIENT_RETRY'
  | 'LEASE_RECONCILIATION'
  | 'SAFE_CONFIGURATION_RECONCILIATION'
  | 'SOURCE_READINESS_RECONCILIATION'
  | 'PROFILING_READINESS_RECONCILIATION'
  | 'RETRY_SAFE_RUNTIME_REPAIR'

export type RecoveryEvidenceRef = {
  type: string
  id: string
  hash?: string | null
}

export type RecoveryCheckpoint = {
  id: string
  stage: RecoveryStage
  valid: boolean
  completed: boolean
  upstreamIds?: Record<string, string>
}

export type RecoveryFailureContext = {
  recoveryCaseId: string
  projectId: string
  workflowRunId: string
  failingStage: RecoveryStage
  failingCheckpointId?: string | null
  code?: string | null
  retryable?: boolean | null
  blocking?: boolean | null
  securityRelevant?: boolean | null
  credentialMissing?: boolean | null
  privilegeExpansionRequired?: boolean | null
  destructiveMutationRequired?: boolean | null
  policyBlocked?: boolean | null
  productionMutationRequired?: boolean | null
  knownRepairClass?: RecoveryRepairClass | null
  retryAttempt: number
  maxRepairAttempts: number
  evidence: RecoveryEvidenceRef[]
  checkpoints: RecoveryCheckpoint[]
}

export type RecoveryAuthorizationDecision = {
  authorized: boolean
  severity: RecoverySeverity
  repairClass: RecoveryRepairClass | null
  reason: string
  escalationReason?: string | null
}

export type CanonicalRecoveryRecord = {
  recovery_case_id: string
  original_workflow_run_id: string
  failing_stage: RecoveryStage
  failing_checkpoint_id: string | null
  severity: RecoverySeverity
  failure_classification: string
  root_cause_diagnosis: string | null
  evidence_used: RecoveryEvidenceRef[]
  proposed_repair: RecoveryRepairClass | null
  authorization_decision: 'AUTHORIZED' | 'BLOCKED' | 'ESCALATE'
  repair_action_tool: string | null
  mutation_scope: string | null
  pre_repair_checkpoint_id: string | null
  post_repair_validation_result: 'NOT_RUN' | 'PASSED' | 'FAILED'
  retry_stage: RecoveryStage | null
  retry_checkpoint_id: string | null
  retry_attempt: number
  final_outcome: 'OPEN' | 'RECOVERED' | 'FAILED' | 'ESCALATED'
  escalation_reason: string | null
}

const AUTO_REPAIRABLE_SEVERITIES = new Set<RecoverySeverity>(['P0', 'P1'])
const AUTO_REPAIRABLE_CLASSES = new Set<RecoveryRepairClass>([
  'TRANSIENT_RETRY',
  'LEASE_RECONCILIATION',
  'SAFE_CONFIGURATION_RECONCILIATION',
  'SOURCE_READINESS_RECONCILIATION',
  'PROFILING_READINESS_RECONCILIATION',
  'RETRY_SAFE_RUNTIME_REPAIR',
])

export function classifyRecoverySeverity(input: RecoveryFailureContext): RecoverySeverity {
  if (input.securityRelevant) return 'P0'
  if (input.blocking === true) return input.failingStage === 'GOVERNED_WORKFLOW' ? 'P0' : 'P1'
  if (input.retryable === true || input.knownRepairClass) return 'P1'
  return 'P2'
}

export function authorizeRecoveryRepair(input: RecoveryFailureContext): RecoveryAuthorizationDecision {
  const severity = classifyRecoverySeverity(input)

  if (input.credentialMissing) {
    return { authorized: false, severity, repairClass: null, reason: 'Credentials are missing.', escalationReason: 'MISSING_CREDENTIALS' }
  }
  if (input.privilegeExpansionRequired) {
    return { authorized: false, severity, repairClass: null, reason: 'Repair would require privilege expansion.', escalationReason: 'PRIVILEGE_EXPANSION_REQUIRED' }
  }
  if (input.destructiveMutationRequired) {
    return { authorized: false, severity, repairClass: null, reason: 'Repair would require a destructive or irreversible mutation.', escalationReason: 'DESTRUCTIVE_MUTATION_REQUIRED' }
  }
  if (input.policyBlocked) {
    return { authorized: false, severity, repairClass: null, reason: 'Deterministic policy blocks autonomous repair.', escalationReason: 'POLICY_BLOCKED' }
  }
  if (input.productionMutationRequired) {
    return { authorized: false, severity, repairClass: null, reason: 'Production mutation requires explicit approval.', escalationReason: 'PRODUCTION_MUTATION_REQUIRES_APPROVAL' }
  }
  if (!AUTO_REPAIRABLE_SEVERITIES.has(severity)) {
    return { authorized: false, severity, repairClass: null, reason: 'P2 and below are evidence-only and are not autonomously repaired.', escalationReason: null }
  }
  if (input.retryAttempt >= input.maxRepairAttempts) {
    return { authorized: false, severity, repairClass: null, reason: 'Bounded autonomous repair attempts are exhausted.', escalationReason: 'REPAIR_ATTEMPT_LIMIT_EXHAUSTED' }
  }

  const repairClass = input.knownRepairClass ?? (input.retryable ? 'TRANSIENT_RETRY' : null)
  if (!repairClass || !AUTO_REPAIRABLE_CLASSES.has(repairClass)) {
    return { authorized: false, severity, repairClass: null, reason: 'No deterministic allowlisted repair class is available.', escalationReason: 'NO_AUTHORIZED_REPAIR' }
  }

  return { authorized: true, severity, repairClass, reason: 'Repair is P0/P1, allowlisted, bounded, and within existing authority.', escalationReason: null }
}

export function nearestValidRecoveryCheckpoint(input: RecoveryFailureContext): RecoveryCheckpoint | null {
  const failingIndex = input.checkpoints.findIndex(checkpoint =>
    checkpoint.id === input.failingCheckpointId || checkpoint.stage === input.failingStage,
  )
  const start = failingIndex >= 0 ? failingIndex - 1 : input.checkpoints.length - 1
  for (let index = start; index >= 0; index -= 1) {
    const checkpoint = input.checkpoints[index]
    if (checkpoint.completed && checkpoint.valid) return checkpoint
  }
  return null
}

export function retryTarget(input: RecoveryFailureContext, sameStageSafe: boolean) {
  if (sameStageSafe) {
    return { stage: input.failingStage, checkpointId: input.failingCheckpointId ?? null, usedFallback: false }
  }
  const checkpoint = nearestValidRecoveryCheckpoint(input)
  return checkpoint
    ? { stage: checkpoint.stage, checkpointId: checkpoint.id, usedFallback: true }
    : { stage: input.failingStage, checkpointId: input.failingCheckpointId ?? null, usedFallback: false }
}

export function initialRecoveryRecord(
  input: RecoveryFailureContext,
  failureClassification: string,
): CanonicalRecoveryRecord {
  const authorization = authorizeRecoveryRepair(input)
  return {
    recovery_case_id: input.recoveryCaseId,
    original_workflow_run_id: input.workflowRunId,
    failing_stage: input.failingStage,
    failing_checkpoint_id: input.failingCheckpointId ?? null,
    severity: authorization.severity,
    failure_classification: failureClassification,
    root_cause_diagnosis: null,
    evidence_used: input.evidence,
    proposed_repair: authorization.repairClass,
    authorization_decision: authorization.authorized ? 'AUTHORIZED' : authorization.escalationReason ? 'ESCALATE' : 'BLOCKED',
    repair_action_tool: null,
    mutation_scope: null,
    pre_repair_checkpoint_id: nearestValidRecoveryCheckpoint(input)?.id ?? null,
    post_repair_validation_result: 'NOT_RUN',
    retry_stage: null,
    retry_checkpoint_id: null,
    retry_attempt: input.retryAttempt,
    final_outcome: authorization.escalationReason ? 'ESCALATED' : 'OPEN',
    escalation_reason: authorization.escalationReason ?? null,
  }
}
