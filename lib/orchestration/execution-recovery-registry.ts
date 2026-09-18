import { createSourceReadinessRecoveryHandler } from './execution-recovery-handlers'
import { createConnectorRecoveryHandler } from './execution-recovery-connector-handler'
import { createMetricExecutionRecoveryHandler } from './execution-recovery-profiling-handler'
import { ExecutionRecoveryHandlerRegistry } from './execution-recovery-runtime'

export function createExecutionRecoveryHandlerRegistry() {
  return new ExecutionRecoveryHandlerRegistry([
    createConnectorRecoveryHandler(),
    createSourceReadinessRecoveryHandler(),
    createMetricExecutionRecoveryHandler(),
  ])
}
