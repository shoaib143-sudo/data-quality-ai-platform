import {
  authorizeRecoveryRepair,
  initialRecoveryRecord,
  retryTarget,
  type CanonicalRecoveryRecord,
  type RecoveryFailureContext,
  type RecoveryRepairClass,
} from './execution-recovery-contract'

export type RecoveryDiagnosis = {
  rootCause: string
  repairClass: RecoveryRepairClass
  evidenceIds: string[]
}

export type RecoveryRepair = {
  repairClass: RecoveryRepairClass
  toolKey: string
  mutationScope: string
  payload: Record<string, unknown>
}

export type RecoveryValidation = {
  valid: boolean
  code: string
  evidenceIds?: string[]
}

export type RecoveryHandler = {
  key: string
  canHandle(context: RecoveryFailureContext): boolean
  diagnose(context: RecoveryFailureContext): Promise<RecoveryDiagnosis>
  proposeRepair(context: RecoveryFailureContext, diagnosis: RecoveryDiagnosis): Promise<RecoveryRepair>
  apply(context: RecoveryFailureContext, repair: RecoveryRepair): Promise<{ mutationId: string }>
  validate(context: RecoveryFailureContext, repair: RecoveryRepair): Promise<RecoveryValidation>
  sameStageRetrySafe(context: RecoveryFailureContext, repair: RecoveryRepair): boolean
}

export type RecoveryExecutionResult = {
  record: CanonicalRecoveryRecord
  mutationId?: string
}

export class ExecutionRecoveryHandlerRegistry {
  private readonly handlers: RecoveryHandler[]

  constructor(handlers: RecoveryHandler[]) {
    this.handlers = [...handlers]
  }

  resolve(context: RecoveryFailureContext) {
    return this.handlers.find(handler => handler.canHandle(context)) ?? null
  }
}

export async function executeAuthorizedRecovery(input: {
  context: RecoveryFailureContext
  failureClassification: string
  registry: ExecutionRecoveryHandlerRegistry
}): Promise<RecoveryExecutionResult> {
  const record = initialRecoveryRecord(input.context, input.failureClassification)
  const authorization = authorizeRecoveryRepair(input.context)

  if (!authorization.authorized) {
    return { record }
  }

  const handler = input.registry.resolve(input.context)
  if (!handler) {
    return {
      record: {
        ...record,
        authorization_decision: 'ESCALATE',
        final_outcome: 'ESCALATED',
        escalation_reason: 'NO_REPAIR_HANDLER',
      },
    }
  }

  let diagnosis: RecoveryDiagnosis
  let repair: RecoveryRepair
  try {
    diagnosis = await handler.diagnose(input.context)
    repair = await handler.proposeRepair(input.context, diagnosis)
  } catch {
    return {
      record: {
        ...record,
        final_outcome: 'ESCALATED',
        authorization_decision: 'ESCALATE',
        escalation_reason: 'DIAGNOSIS_OR_REPAIR_PLANNING_FAILED',
      },
    }
  }

  if (repair.repairClass !== authorization.repairClass || diagnosis.repairClass !== authorization.repairClass) {
    return {
      record: {
        ...record,
        root_cause_diagnosis: diagnosis.rootCause,
        final_outcome: 'ESCALATED',
        authorization_decision: 'ESCALATE',
        escalation_reason: 'REPAIR_CLASS_MISMATCH',
      },
    }
  }

  let mutationId: string
  try {
    const applied = await handler.apply(input.context, repair)
    mutationId = applied.mutationId
  } catch {
    return {
      record: {
        ...record,
        root_cause_diagnosis: diagnosis.rootCause,
        repair_action_tool: repair.toolKey,
        mutation_scope: repair.mutationScope,
        final_outcome: 'ESCALATED',
        authorization_decision: 'ESCALATE',
        escalation_reason: 'REPAIR_APPLICATION_FAILED',
      },
    }
  }

  const validation = await handler.validate(input.context, repair)
  if (!validation.valid) {
    return {
      mutationId,
      record: {
        ...record,
        root_cause_diagnosis: diagnosis.rootCause,
        repair_action_tool: repair.toolKey,
        mutation_scope: repair.mutationScope,
        post_repair_validation_result: 'FAILED',
        final_outcome: 'ESCALATED',
        authorization_decision: 'ESCALATE',
        escalation_reason: 'REPAIR_VALIDATION_FAILED',
      },
    }
  }

  const target = retryTarget(input.context, handler.sameStageRetrySafe(input.context, repair))
  return {
    mutationId,
    record: {
      ...record,
      root_cause_diagnosis: diagnosis.rootCause,
      repair_action_tool: repair.toolKey,
      mutation_scope: repair.mutationScope,
      post_repair_validation_result: 'PASSED',
      retry_stage: target.stage,
      retry_checkpoint_id: target.checkpointId,
      final_outcome: 'RECOVERED',
      escalation_reason: null,
    },
  }
}
