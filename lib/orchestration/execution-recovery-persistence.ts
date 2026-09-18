import { createAdminClient } from '@/lib/supabase/admin'
import { executeAuthorizedRecovery, type ExecutionRecoveryHandlerRegistry } from './execution-recovery-runtime'
import { initialRecoveryRecord, type CanonicalRecoveryRecord, type RecoveryFailureContext } from './execution-recovery-contract'

type PersistedRecoveryCase = {
  id: string
  status: string | null
  final_outcome: CanonicalRecoveryRecord['final_outcome'] | null
  authorization_decision: CanonicalRecoveryRecord['authorization_decision'] | null
  post_repair_validation_result: CanonicalRecoveryRecord['post_repair_validation_result'] | null
  retry_stage: CanonicalRecoveryRecord['retry_stage'] | null
  retry_checkpoint_id: string | null
  escalation_reason: string | null
}

function canonicalColumns(record: CanonicalRecoveryRecord) {
  return {
    original_workflow_run_id: record.original_workflow_run_id,
    failing_stage: record.failing_stage,
    failing_checkpoint_id: record.failing_checkpoint_id,
    severity: record.severity,
    root_cause_diagnosis: record.root_cause_diagnosis,
    evidence_used: record.evidence_used,
    proposed_repair: record.proposed_repair,
    authorization_decision: record.authorization_decision,
    repair_action_tool: record.repair_action_tool,
    mutation_scope: record.mutation_scope,
    pre_repair_checkpoint_id: record.pre_repair_checkpoint_id,
    post_repair_validation_result: record.post_repair_validation_result,
    retry_stage: record.retry_stage,
    retry_checkpoint_id: record.retry_checkpoint_id,
    retry_attempt: record.retry_attempt,
    final_outcome: record.final_outcome,
    escalation_reason: record.escalation_reason,
    updated_at: new Date().toISOString(),
  }
}

export async function loadPersistedRecoveryCase(recoveryCaseId: string): Promise<PersistedRecoveryCase | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('orchestration')
    .from('recovery_cases')
    .select('id,status,final_outcome,authorization_decision,post_repair_validation_result,retry_stage,retry_checkpoint_id,escalation_reason')
    .eq('id', recoveryCaseId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load execution recovery case: ${error.message}`)
  return data as PersistedRecoveryCase | null
}

export async function persistCanonicalRecoveryRecord(record: CanonicalRecoveryRecord) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('orchestration')
    .from('recovery_cases')
    .update(canonicalColumns(record))
    .eq('id', record.recovery_case_id)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Unable to persist closed-loop execution recovery state: ${error.message}`)
  if (!data) throw new Error('Execution recovery case was not found.')
}

async function seedInitialRecoveryRecord(record: CanonicalRecoveryRecord) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('orchestration')
    .from('recovery_cases')
    .update(canonicalColumns(record))
    .eq('id', record.recovery_case_id)
    .eq('final_outcome', 'OPEN')
    .or('post_repair_validation_result.is.null,post_repair_validation_result.eq.NOT_RUN')
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Unable to seed closed-loop execution recovery state: ${error.message}`)
  return Boolean(data)
}

async function claimAutoRepair(input: {
  recoveryCaseId: string
  retryAttempt: number
  actionKey: string
  mutationScope: string
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').rpc('claim_execution_recovery_auto_repair', {
    p_case_id: input.recoveryCaseId,
    p_repair_attempt: input.retryAttempt,
    p_action_key: input.actionKey,
    p_mutation_scope: input.mutationScope,
  })
  if (error) throw new Error(`Unable to claim autonomous recovery mutation: ${error.message}`)
  const result = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
  return {
    claimed: result.claimed === true,
    reason: typeof result.reason === 'string' ? result.reason : null,
  }
}

async function finalizeAutoRepairEvidence(input: {
  recoveryCaseId: string
  retryAttempt: number
  mutationId?: string
  repairApplied: boolean
  validationResult: CanonicalRecoveryRecord['post_repair_validation_result']
  validationCode?: string | null
}) {
  const admin = createAdminClient()
  const { error } = await admin.schema('orchestration').rpc('finalize_execution_recovery_auto_repair', {
    p_case_id: input.recoveryCaseId,
    p_repair_attempt: input.retryAttempt,
    p_mutation_id: input.mutationId ?? '',
    p_repair_applied: input.repairApplied,
    p_validation_result: input.validationResult,
    p_validation_code: input.validationCode ?? '',
  })
  if (error) throw new Error(`Unable to finalize autonomous recovery evidence: ${error.message}`)
}
export async function executePersistedRecovery(input: {
  context: RecoveryFailureContext
  failureClassification: string
  registry: ExecutionRecoveryHandlerRegistry
}) {
  const existing = await loadPersistedRecoveryCase(input.context.recoveryCaseId)
  if (!existing) throw new Error('Execution recovery case was not found.')

  if (existing.status === 'OPEN' && existing.post_repair_validation_result === 'PASSED' && existing.retry_stage) {
    return {
      replayed: true,
      replayState: 'REPAIR_VALIDATED' as const,
      record: {
        recovery_case_id: input.context.recoveryCaseId,
        original_workflow_run_id: input.context.workflowRunId,
        failing_stage: input.context.failingStage,
        failing_checkpoint_id: input.context.failingCheckpointId ?? null,
        severity: 'P1' as const,
        failure_classification: input.failureClassification,
        root_cause_diagnosis: null,
        evidence_used: input.context.evidence,
        proposed_repair: input.context.knownRepairClass ?? null,
        authorization_decision: existing.authorization_decision ?? 'AUTHORIZED',
        repair_action_tool: null,
        mutation_scope: null,
        pre_repair_checkpoint_id: null,
        post_repair_validation_result: 'PASSED' as const,
        retry_stage: existing.retry_stage,
        retry_checkpoint_id: existing.retry_checkpoint_id,
        retry_attempt: input.context.retryAttempt,
        final_outcome: 'OPEN' as const,
        escalation_reason: null,
      },
    }
  }
  if (existing.status === 'RETRY_QUEUED' && existing.post_repair_validation_result === 'PASSED') {
    return {
      replayed: true,
      replayState: 'RESUME_PENDING' as const,
      record: {
        recovery_case_id: input.context.recoveryCaseId,
        original_workflow_run_id: input.context.workflowRunId,
        failing_stage: input.context.failingStage,
        failing_checkpoint_id: input.context.failingCheckpointId ?? null,
        severity: 'P1' as const,
        failure_classification: input.failureClassification,
        root_cause_diagnosis: null,
        evidence_used: input.context.evidence,
        proposed_repair: input.context.knownRepairClass ?? null,
        authorization_decision: existing.authorization_decision ?? 'AUTHORIZED',
        repair_action_tool: null,
        mutation_scope: null,
        pre_repair_checkpoint_id: null,
        post_repair_validation_result: 'PASSED' as const,
        retry_stage: existing.retry_stage,
        retry_checkpoint_id: existing.retry_checkpoint_id,
        retry_attempt: input.context.retryAttempt,
        final_outcome: 'OPEN' as const,
        escalation_reason: null,
      },
    }
  }

  if (existing.final_outcome === 'ESCALATED' || existing.final_outcome === 'FAILED') {
    return {
      replayed: true,
      replayState: 'TERMINAL' as const,
      record: {
        recovery_case_id: input.context.recoveryCaseId,
        original_workflow_run_id: input.context.workflowRunId,
        failing_stage: input.context.failingStage,
        failing_checkpoint_id: input.context.failingCheckpointId ?? null,
        severity: 'P1' as const,
        failure_classification: input.failureClassification,
        root_cause_diagnosis: null,
        evidence_used: input.context.evidence,
        proposed_repair: input.context.knownRepairClass ?? null,
        authorization_decision: existing.authorization_decision ?? 'ESCALATE',
        repair_action_tool: null,
        mutation_scope: null,
        pre_repair_checkpoint_id: null,
        post_repair_validation_result: existing.post_repair_validation_result ?? 'NOT_RUN',
        retry_stage: existing.retry_stage,
        retry_checkpoint_id: existing.retry_checkpoint_id,
        retry_attempt: input.context.retryAttempt,
        final_outcome: existing.final_outcome,
        escalation_reason: existing.escalation_reason,
      },
    }
  }
  if (existing.final_outcome === 'RECOVERED' && existing.post_repair_validation_result === 'PASSED') {
    return {
      replayed: true,
      replayState: 'RECOVERED' as const,
      record: {
        recovery_case_id: input.context.recoveryCaseId,
        original_workflow_run_id: input.context.workflowRunId,
        failing_stage: input.context.failingStage,
        failing_checkpoint_id: input.context.failingCheckpointId ?? null,
        severity: 'P1' as const,
        failure_classification: input.failureClassification,
        root_cause_diagnosis: null,
        evidence_used: input.context.evidence,
        proposed_repair: input.context.knownRepairClass ?? null,
        authorization_decision: existing.authorization_decision ?? 'AUTHORIZED',
        repair_action_tool: null,
        mutation_scope: null,
        pre_repair_checkpoint_id: null,
        post_repair_validation_result: 'PASSED' as const,
        retry_stage: existing.retry_stage,
        retry_checkpoint_id: existing.retry_checkpoint_id,
        retry_attempt: input.context.retryAttempt,
        final_outcome: 'RECOVERED' as const,
        escalation_reason: null,
      },
    }
  }

  const initial = initialRecoveryRecord(input.context, input.failureClassification)
  const seeded = await seedInitialRecoveryRecord(initial)
  if (!seeded) {
    return { replayed: true, replayState: 'STATE_ADVANCED' as const, record: initial }
  }

  let repairClaimed = false
  let claimReason: string | null = null
  const result = await executeAuthorizedRecovery({
    ...input,
    beforeApply: async ({ repair }) => {
      const claim = await claimAutoRepair({
        recoveryCaseId: input.context.recoveryCaseId,
        retryAttempt: input.context.retryAttempt,
        actionKey: repair.toolKey,
        mutationScope: repair.mutationScope,
      })
      repairClaimed = claim.claimed
      claimReason = claim.reason
      return { proceed: claim.claimed, reason: claim.reason ?? 'RECOVERY_ATTEMPT_ALREADY_CLAIMED' }
    },
  })

  if (!repairClaimed && claimReason === 'ATTEMPT_ALREADY_CLAIMED') {
    return { replayed: true, replayState: 'IN_FLIGHT' as const, record: initial }
  }

  await persistCanonicalRecoveryRecord(result.record)
  if (repairClaimed) {
    await finalizeAutoRepairEvidence({
      recoveryCaseId: input.context.recoveryCaseId,
      retryAttempt: input.context.retryAttempt,
      mutationId: result.mutationId,
      repairApplied: Boolean(result.mutationId),
      validationResult: result.record.post_repair_validation_result,
      validationCode: result.validation?.code ?? result.record.escalation_reason,
    })
  }
  return { replayed: false, replayState: 'EXECUTED' as const, ...result }
}
