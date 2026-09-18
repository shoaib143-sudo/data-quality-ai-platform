import { ExecutionRecoveryHandlerRegistry } from './execution-recovery-runtime'
import {
  createProfileReadinessRecoveryHandler,
  createSourceReadinessRecoveryHandler,
} from './execution-recovery-handlers'
import { executePersistedRecovery } from './execution-recovery-persistence'
import type { RecoveryFailureContext } from './execution-recovery-contract'

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
