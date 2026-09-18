import assert from 'node:assert/strict'
import { createMetricExecutionRecoveryHandler } from '../lib/orchestration/execution-recovery-profiling-handler.ts'

function context(overrides = {}) {
  return {
    recoveryCaseId: 'case-metric', projectId: 'project-1', workflowRunId: 'run-1',
    failingStage: 'METRIC_EXECUTION', failingCheckpointId: 'metric-execution',
    code: 'RUNTIME_RETRY_SAFE', retryable: true, blocking: true,
    knownRepairClass: 'RETRY_SAFE_RUNTIME_REPAIR', retryAttempt: 0, maxRepairAttempts: 2,
    evidence: [{ type: 'PROFILE_RUN', id: 'profile-run-1' }],
    checkpoints: [
      { id: 'schema', stage: 'SCHEMA_DISCOVERY', valid: true, completed: true },
      { id: 'metric-execution', stage: 'METRIC_EXECUTION', valid: false, completed: false },
    ],
    repairParameters: {
      datasetVersionId: 'version-1', profilingRunId: 'profile-run-1', agentRunId: 'agent-run-1',
      stepId: 'step-2', agentDefinitionId: 'agent-definition-1', agentVersion: '2.0',
    },
    ...overrides,
  }
}

let calls = 0
const handler = createMetricExecutionRecoveryHandler({
  execute: async (operation, payload, toolContext) => {
    calls += 1
    assert.equal(operation, 'execute_metrics')
    assert.equal(payload.datasetVersionId, 'version-1')
    assert.equal(payload.profilingRunId, 'profile-run-1')
    assert.equal(toolContext.stepId, 'step-2')
    return { status: 'COMPLETED', dataset_version_id: 'version-1', profiling_run_id: 'profile-run-1', metrics_persisted: 8, findings_persisted: 2, score: { overall_score: 97 } }
  },
})
const ctx = context()
assert.equal(handler.canHandle(ctx), true)
const diagnosis = await handler.diagnose(ctx)
assert.equal(diagnosis.repairClass, 'RETRY_SAFE_RUNTIME_REPAIR')
const repair = await handler.proposeRepair(ctx, diagnosis)
assert.equal(repair.toolKey, 'profiling-executor:execute_metrics')
await handler.apply(ctx, repair)
const validation = await handler.validate(ctx, repair)
assert.equal(validation.valid, true)
assert.equal(validation.code, 'METRIC_EXECUTION_RECOVERED')
assert.equal(calls, 1)
assert.equal(handler.sameStageRetrySafe(ctx, repair), true)

assert.equal(handler.canHandle(context({ failingStage: 'FINDINGS_GENERATION' })), false)
assert.equal(handler.canHandle(context({ repairParameters: {} })), false)

const failedHandler = createMetricExecutionRecoveryHandler({
  execute: async () => ({ status: 'FAILED', metrics_persisted: 0 }),
})
const failedCtx = context({ recoveryCaseId: 'case-metric-failed' })
const failedRepair = await failedHandler.proposeRepair(failedCtx, await failedHandler.diagnose(failedCtx))
await failedHandler.apply(failedCtx, failedRepair)
assert.equal((await failedHandler.validate(failedCtx, failedRepair)).valid, false)

console.log('Profiling metric recovery handler tests passed.')
