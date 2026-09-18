import assert from 'node:assert/strict'
import { createConnectorRecoveryHandler } from '../lib/orchestration/execution-recovery-connector-handler.ts'

function context(overrides = {}) {
  return {
    recoveryCaseId: 'case-connector', projectId: 'project-1', workflowRunId: 'run-1',
    failingStage: 'CONNECTOR_ESTABLISHMENT', failingCheckpointId: 'connector',
    code: 'CONNECTION_TIMEOUT', retryable: true, blocking: true,
    knownRepairClass: 'TRANSIENT_RETRY', retryAttempt: 0, maxRepairAttempts: 2,
    evidence: [{ type: 'CONNECTOR_ATTEMPT', id: 'attempt-1' }],
    checkpoints: [],
    repairParameters: { jdbcConfig: { jdbcUrl: 'jdbc:postgresql://db.example.test/app', credentialRef: 'secret-ref', schema: 'public', table: 'orders' } },
    ...overrides,
  }
}

let calls = 0
const handler = createConnectorRecoveryHandler({
  validate: async config => {
    calls += 1
    assert.equal(config.credentialRef, 'secret-ref')
    return { valid: true, columns: [], rowCount: 1, details: {}, errors: [], warnings: [] }
  },
})
assert.equal(handler.canHandle(context()), true)
const diagnosis = await handler.diagnose(context())
assert.equal(diagnosis.repairClass, 'TRANSIENT_RETRY')
const repair = await handler.proposeRepair(context(), diagnosis)
assert.equal(repair.toolKey, 'validateJdbcConnection')
await handler.apply(context(), repair)
const validation = await handler.validate(context(), repair)
assert.equal(validation.valid, true)
assert.equal(validation.code, 'CONNECTOR_REESTABLISHED')
assert.equal(calls, 1)

assert.equal(handler.canHandle(context({ knownRepairClass: 'SAFE_CONFIGURATION_RECONCILIATION' })), false)
assert.equal(handler.canHandle(context({ repairParameters: { jdbcConfig: { jdbcUrl: 'jdbc:postgresql://db.example.test/app', table: 'orders' } } })), false)

const failing = createConnectorRecoveryHandler({
  validate: async () => ({ valid: false, columns: [], rowCount: null, details: {}, errors: ['timeout'], warnings: [] }),
})
const failedContext = context({ recoveryCaseId: 'case-failed' })
const failedRepair = await failing.proposeRepair(failedContext, await failing.diagnose(failedContext))
await failing.apply(failedContext, failedRepair)
assert.equal((await failing.validate(failedContext, failedRepair)).valid, false)

console.log('Connector recovery handler tests passed.')
