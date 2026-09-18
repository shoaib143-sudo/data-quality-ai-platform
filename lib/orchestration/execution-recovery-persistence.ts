import { createAdminClient } from '@/lib/supabase/admin'
import type { CanonicalRecoveryRecord, RecoveryFailureContext } from './execution-recovery-contract'
import { executeAuthorizedRecovery, type ExecutionRecoveryHandlerRegistry } from './execution-recovery-runtime'

function recoveryCaseUpdate(record: CanonicalRecoveryRecord) {
  return {
    original_workflow_run_id: record.original_workflow_run_id,
    failing_stage: record.failing_stage,
    failing_checkpoint_id: record.failing_checkpoint_id,
    severity: record.severity,
    root_cause_diagnosis: record.root_cause_diagnosis,
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

export async function persistClosedLoopRecoveryRecord(projectId: string, record: CanonicalRecoveryRecord) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').from('recovery_cases')
    .update(recoveryCaseUpdate(record))
    .eq('id', record.recovery_case_id)
    .eq('project_id', projectId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Unable to persist closed-loop recovery case: ${error.message}`)
  if (!data) throw new Error('Closed-loop recovery case was not found in project scope.')
}

async function recordAction(input: {
  recoveryCaseId: string
  projectId: string
  actionType: 'AUTO_REPAIR' | 'VALIDATE' | 'RESUME'
  idempotencyKey: string
  outcome: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const { error } = await admin.schema('orchestration').from('recovery_actions').upsert({
    recovery_case_id: input.recoveryCaseId,
    project_id: input.projectId,
    action_type: input.actionType,
    consent_source: 'SYSTEM',
    status: 'EXECUTED',
    idempotency_key: input.idempotencyKey,
    outcome: input.outcome,
    executed_at: new Date().toISOString(),
  }, { onConflict: 'recovery_case_id,idempotency_key', ignoreDuplicates: true })
  if (error) throw new Error(`Unable to persist recovery ${input.actionType} evidence: ${error.message}`)
}

export async function executePersistedAuthorizedRecovery(input: {
  context: RecoveryFailureContext
  failureClassification: string
  registry: ExecutionRecoveryHandlerRegistry
}) {
  const result = await executeAuthorizedRecovery(input)
  await persistClosedLoopRecoveryRecord(input.context.projectId, result.record)

  if (result.mutationId && result.record.repair_action_tool) {
    await recordAction({
      recoveryCaseId: input.context.recoveryCaseId,
      projectId: input.context.projectId,
      actionType: 'AUTO_REPAIR',
      idempotencyKey: `auto-repair:${input.context.retryAttempt}:${result.record.repair_action_tool}`,
      outcome: { mutation_id: result.mutationId, repair_action_tool: result.record.repair_action_tool, mutation_scope: result.record.mutation_scope },
    })
  }

  if (result.record.post_repair_validation_result !== 'NOT_RUN') {
    await recordAction({
      recoveryCaseId: input.context.recoveryCaseId,
      projectId: input.context.projectId,
      actionType: 'VALIDATE',
      idempotencyKey: `validate:${input.context.retryAttempt}:${result.record.post_repair_validation_result}`,
      outcome: { validation_result: result.record.post_repair_validation_result },
    })
  }

  if (result.record.post_repair_validation_result === 'PASSED' && result.record.retry_stage) {
    await recordAction({
      recoveryCaseId: input.context.recoveryCaseId,
      projectId: input.context.projectId,
      actionType: 'RESUME',
      idempotencyKey: `resume:${input.context.retryAttempt}:${result.record.retry_stage}:${result.record.retry_checkpoint_id ?? 'none'}`,
      outcome: { retry_stage: result.record.retry_stage, retry_checkpoint_id: result.record.retry_checkpoint_id },
    })
  }

  return result
}
