import assert from 'node:assert/strict'

import {
  createLeaseReconciliationRecoveryHandler,
  createProfilingReadinessRecoveryHandler,
  createSourceReadinessRecoveryHandler,
} from '../lib/orchestration/execution-recovery-handlers.ts'
import {
  ExecutionRecoveryHandlerRegistry,
  executeAuthorizedRecovery,
} from '../lib/orchestration/execution-recovery-runtime.ts'

function context(overrides = {}) {
  return {
    recoveryCaseId: 'case-specialist-1',
    projectId: 'project-1',
    workflowRunId: 'agent-run-1',
    failingStage: 'CONNECTOR_ESTABLISHMENT',
    failingCheckpointId: 'connector',
    code: 'CONNECT_TIMEOUT',
    retryable: false,
    blocking: true,
    knownRepairClass: 'SOURCE_READINESS_RECONCILIATION',
    retryAttempt: 0,
    maxRepairAttempts: 2,
    evidence: [{ type: 'SOURCE_VALIDATION', id: 'evidence-1' }],
    checkpoints: [
      { id: 'dataset', stage: 'SOURCE_ONBOARDING', valid: true, completed: true },
      { id: 'connector', stage: 'CONNECTOR_ESTABLISHMENT', valid: false, completed: false },
    ],
    repairParameters: { sourceId: 'source-1' },
    ...overrides,
  }
}

let sourceRepairs = 0
let sourceVerifications = 0
const sourceHandler = createSourceReadinessRecoveryHandler({
  async repair(input) {
    sourceRepairs += 1
    assert.deepEqual(input, { projectId: 'project-1', sourceId: 'source-1' })
    return { operational: true, code: 'SOURCE_READY' }
  },
  async verify(input) {
    sourceVerifications += 1
    assert.deepEqual(input, { projectId: 'project-1', sourceId: 'source-1' })
    return { valid: true, code: 'SOURCE_READINESS_RESTORED' }
  },
})

assert.equal(sourceHandler.canHandle(context()), true)
assert.equal(sourceHandler.canHandle(context({ repairParameters: {} })), false)

const connectorRecovered = await executeAuthorizedRecovery({
  context: context(),
  failureClassification: 'TRANSIENT_EXTERNAL',
  registry: new ExecutionRecoveryHandlerRegistry([sourceHandler]),
})
assert.equal(sourceRepairs, 1)
assert.equal(sourceVerifications, 1)
assert.equal(connectorRecovered.record.post_repair_validation_result, 'PASSED')
assert.equal(connectorRecovered.record.retry_stage, 'CONNECTOR_ESTABLISHMENT')
assert.equal(connectorRecovered.record.final_outcome, 'OPEN')

const sourceValidationFailureHandler = createSourceReadinessRecoveryHandler({
  async repair() {
    return { operational: true, code: 'SOURCE_READY' }
  },
  async verify() {
    return { valid: false, code: 'EXECUTION_SOURCE_NOT_BOUND' }
  },
})
const sourceValidationFailure = await executeAuthorizedRecovery({
  context: { ...context(), recoveryCaseId: 'case-source-validation-failure' },
  failureClassification: 'CONFIGURATION',
  registry: new ExecutionRecoveryHandlerRegistry([sourceValidationFailureHandler]),
})
assert.equal(sourceValidationFailure.record.post_repair_validation_result, 'FAILED')
assert.equal(sourceValidationFailure.record.escalation_reason, 'REPAIR_VALIDATION_FAILED')

let profilingRepairs = 0
let profilingVerifications = 0
const profilingHandler = createProfilingReadinessRecoveryHandler({
  async repair(input) {
    profilingRepairs += 1
    assert.deepEqual(input, {
      projectId: 'project-1',
      datasetVersionId: 'version-1',
      agentRunId: 'agent-run-1',
    })
    return {
      status: 'REMEDIATED',
      executed: true,
      approval_required: false,
      after_state: 'READY',
      readiness: { state: 'READY', profiling_ready: true },
    }
  },
  async verify(input) {
    profilingVerifications += 1
    assert.deepEqual(input, { projectId: 'project-1', datasetVersionId: 'version-1' })
    return { state: 'READY', profiling_ready: true }
  },
})

const profilingContext = context({
  recoveryCaseId: 'case-profile-1',
  failingStage: 'METRIC_EXECUTION',
  failingCheckpointId: 'metric-execution',
  knownRepairClass: 'PROFILING_READINESS_RECONCILIATION',
  repairParameters: { datasetVersionId: 'version-1', agentRunId: 'agent-run-1' },
  checkpoints: [
    { id: 'dataset', stage: 'SOURCE_ONBOARDING', valid: true, completed: true },
    { id: 'schema', stage: 'SCHEMA_DISCOVERY', valid: true, completed: true },
    { id: 'metric-execution', stage: 'METRIC_EXECUTION', valid: false, completed: false },
  ],
})

assert.equal(profilingHandler.canHandle(profilingContext), true)
const profilingRecovered = await executeAuthorizedRecovery({
  context: profilingContext,
  failureClassification: 'CONFIGURATION',
  registry: new ExecutionRecoveryHandlerRegistry([profilingHandler]),
})
assert.equal(profilingRepairs, 1)
assert.equal(profilingVerifications, 1)
assert.equal(profilingRecovered.record.post_repair_validation_result, 'PASSED')
assert.equal(profilingRecovered.record.retry_stage, 'METRIC_EXECUTION')
assert.equal(profilingRecovered.record.retry_checkpoint_id, 'metric-execution')

const approvalBlockedHandler = createProfilingReadinessRecoveryHandler({
  async repair() {
    return {
      status: 'APPROVAL_REQUIRED',
      executed: false,
      approval_required: true,
      after_state: 'BLOCKED',
      readiness: { state: 'BLOCKED', profiling_ready: false },
    }
  },
  async verify() {
    throw new Error('validation must not run after approval boundary')
  },
})
const approvalBlocked = await executeAuthorizedRecovery({
  context: { ...profilingContext, recoveryCaseId: 'case-profile-approval' },
  failureClassification: 'CONFIGURATION',
  registry: new ExecutionRecoveryHandlerRegistry([approvalBlockedHandler]),
})
assert.equal(approvalBlocked.record.final_outcome, 'ESCALATED')
assert.equal(approvalBlocked.record.escalation_reason, 'REPAIR_APPLICATION_FAILED')

let failedIndependentValidation = 0
const validationFailureHandler = createProfilingReadinessRecoveryHandler({
  async repair() {
    return {
      status: 'REMEDIATED',
      executed: true,
      approval_required: false,
      after_state: 'READY',
      readiness: { state: 'READY', profiling_ready: true },
    }
  },
  async verify() {
    failedIndependentValidation += 1
    return { state: 'BLOCKED', profiling_ready: false }
  },
})
const failedValidation = await executeAuthorizedRecovery({
  context: { ...profilingContext, recoveryCaseId: 'case-profile-validation-failure' },
  failureClassification: 'CONFIGURATION',
  registry: new ExecutionRecoveryHandlerRegistry([validationFailureHandler]),
})
assert.equal(failedIndependentValidation, 1)
assert.equal(failedValidation.record.post_repair_validation_result, 'FAILED')
assert.equal(failedValidation.record.final_outcome, 'ESCALATED')
assert.equal(failedValidation.record.escalation_reason, 'REPAIR_VALIDATION_FAILED')


let leaseReconciliations = 0
let leaseValidations = 0
const leaseHandler = createLeaseReconciliationRecoveryHandler({
  async reconcile(input) {
    leaseReconciliations += 1
    assert.deepEqual(input, { projectId: 'project-1', durableJobId: 'job-1' })
    return { reconciled: true }
  },
  async verify(input) {
    leaseValidations += 1
    assert.deepEqual(input, { projectId: 'project-1', durableJobId: 'job-1' })
    return { status: 'DEAD', leaseOwner: null, leaseExpiresAt: null }
  },
})
const leaseContext = context({
  recoveryCaseId: 'case-lease-1',
  failingStage: 'GOVERNED_WORKFLOW',
  knownRepairClass: 'LEASE_RECONCILIATION',
  repairParameters: { durableJobId: 'job-1' },
})
assert.equal(leaseHandler.canHandle(leaseContext), true)
const leaseRecovered = await executeAuthorizedRecovery({
  context: leaseContext,
  failureClassification: 'ORCHESTRATION',
  registry: new ExecutionRecoveryHandlerRegistry([leaseHandler]),
})
assert.equal(leaseReconciliations, 1)
assert.equal(leaseValidations, 1)
assert.equal(leaseRecovered.record.post_repair_validation_result, 'PASSED')
assert.equal(leaseRecovered.record.retry_stage, 'GOVERNED_WORKFLOW')

const activeLeaseHandler = createLeaseReconciliationRecoveryHandler({
  async reconcile() {
    return { reconciled: true }
  },
  async verify() {
    return { status: 'DEAD', leaseOwner: 'worker-2', leaseExpiresAt: '2026-09-18T12:00:00Z' }
  },
})
const activeLease = await executeAuthorizedRecovery({
  context: { ...leaseContext, recoveryCaseId: 'case-lease-active' },
  failureClassification: 'ORCHESTRATION',
  registry: new ExecutionRecoveryHandlerRegistry([activeLeaseHandler]),
})
assert.equal(activeLease.record.post_repair_validation_result, 'FAILED')
assert.equal(activeLease.record.final_outcome, 'ESCALATED')
assert.equal(activeLease.record.escalation_reason, 'REPAIR_VALIDATION_FAILED')

console.log('Execution Recovery Agent specialist handler tests passed.')
