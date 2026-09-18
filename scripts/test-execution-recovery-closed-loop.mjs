import assert from 'node:assert/strict'

import {
  authorizeRecoveryRepair,
  classifyRecoverySeverity,
  nearestValidRecoveryCheckpoint,
  retryTarget,
} from '../lib/orchestration/execution-recovery-contract.ts'
import {
  ExecutionRecoveryHandlerRegistry,
  executeAuthorizedRecovery,
} from '../lib/orchestration/execution-recovery-runtime.ts'

function context(overrides = {}) {
  return {
    recoveryCaseId: 'case-1',
    projectId: 'project-1',
    workflowRunId: 'run-1',
    failingStage: 'METRIC_EXECUTION',
    failingCheckpointId: 'metric-execution',
    code: 'TRANSIENT_CONNECTOR_TIMEOUT',
    retryable: true,
    blocking: true,
    securityRelevant: false,
    credentialMissing: false,
    privilegeExpansionRequired: false,
    destructiveMutationRequired: false,
    policyBlocked: false,
    productionMutationRequired: false,
    knownRepairClass: 'TRANSIENT_RETRY',
    retryAttempt: 0,
    maxRepairAttempts: 2,
    evidence: [{ type: 'AGENT_RUN', id: 'run-1' }],
    checkpoints: [
      { id: 'dataset', stage: 'SOURCE_ONBOARDING', valid: true, completed: true, upstreamIds: { datasetId: 'd1' } },
      { id: 'schema', stage: 'SCHEMA_DISCOVERY', valid: true, completed: true, upstreamIds: { datasetId: 'd1', versionId: 'v1' } },
      { id: 'metric-execution', stage: 'METRIC_EXECUTION', valid: false, completed: false },
    ],
    ...overrides,
  }
}

assert.equal(classifyRecoverySeverity(context()), 'P1')
assert.equal(authorizeRecoveryRepair(context()).authorized, true)

const p2 = context({ blocking: false, retryable: false, knownRepairClass: null })
assert.equal(classifyRecoverySeverity(p2), 'P2')
assert.equal(authorizeRecoveryRepair(p2).authorized, false)
assert.equal(authorizeRecoveryRepair(p2).escalationReason, null)

for (const blocked of [
  { credentialMissing: true, expected: 'MISSING_CREDENTIALS' },
  { privilegeExpansionRequired: true, expected: 'PRIVILEGE_EXPANSION_REQUIRED' },
  { destructiveMutationRequired: true, expected: 'DESTRUCTIVE_MUTATION_REQUIRED' },
  { policyBlocked: true, expected: 'POLICY_BLOCKED' },
  { productionMutationRequired: true, expected: 'PRODUCTION_MUTATION_REQUIRES_APPROVAL' },
]) {
  const decision = authorizeRecoveryRepair(context({ [Object.keys(blocked)[0]]: true }))
  assert.equal(decision.authorized, false)
  assert.equal(decision.escalationReason, blocked.expected)
}

const exhausted = authorizeRecoveryRepair(context({ retryAttempt: 2, maxRepairAttempts: 2 }))
assert.equal(exhausted.authorized, false)
assert.equal(exhausted.escalationReason, 'REPAIR_ATTEMPT_LIMIT_EXHAUSTED')

assert.equal(nearestValidRecoveryCheckpoint(context())?.id, 'schema')
assert.deepEqual(retryTarget(context(), true), {
  stage: 'METRIC_EXECUTION',
  checkpointId: 'metric-execution',
  usedFallback: false,
})
assert.deepEqual(retryTarget(context(), false), {
  stage: 'SCHEMA_DISCOVERY',
  checkpointId: 'schema',
  usedFallback: true,
})

let applies = 0
const handler = {
  key: 'transient-retry',
  canHandle: value => value.knownRepairClass === 'TRANSIENT_RETRY',
  async diagnose() {
    return { rootCause: 'Observed transient connector timeout.', repairClass: 'TRANSIENT_RETRY', evidenceIds: ['run-1'] }
  },
  async proposeRepair() {
    return { repairClass: 'TRANSIENT_RETRY', toolKey: 'connector_retry_reconcile', mutationScope: 'run:run-1', payload: {} }
  },
  async apply() {
    applies += 1
    return { mutationId: 'mutation-1' }
  },
  async validate() {
    return { valid: true, code: 'ROOT_CAUSE_CLEARED', evidenceIds: ['validation-1'] }
  },
  sameStageRetrySafe() {
    return true
  },
}

const registry = new ExecutionRecoveryHandlerRegistry([handler])
const recovered = await executeAuthorizedRecovery({
  context: context(),
  failureClassification: 'TRANSIENT_EXTERNAL',
  registry,
})
assert.equal(applies, 1)
assert.equal(recovered.record.post_repair_validation_result, 'PASSED')
assert.equal(recovered.record.retry_stage, 'METRIC_EXECUTION')
assert.equal(recovered.record.retry_checkpoint_id, 'metric-execution')
assert.equal(recovered.record.final_outcome, 'OPEN')

const p2Result = await executeAuthorizedRecovery({
  context: p2,
  failureClassification: 'NON_BLOCKING_DEFECT',
  registry,
})
assert.equal(applies, 1)
assert.equal(p2Result.record.authorization_decision, 'BLOCKED')
assert.equal(p2Result.record.final_outcome, 'OPEN')

const unsafe = await executeAuthorizedRecovery({
  context: context({ credentialMissing: true }),
  failureClassification: 'CREDENTIAL_CONFIGURATION',
  registry,
})
assert.equal(applies, 1)
assert.equal(unsafe.record.final_outcome, 'ESCALATED')
assert.equal(unsafe.record.escalation_reason, 'MISSING_CREDENTIALS')

const invalidatingHandler = {
  ...handler,
  key: 'checkpoint-fallback',
  sameStageRetrySafe() {
    return false
  },
}
const fallback = await executeAuthorizedRecovery({
  context: context(),
  failureClassification: 'RUNTIME_SYSTEM_DEFECT',
  registry: new ExecutionRecoveryHandlerRegistry([invalidatingHandler]),
})
assert.equal(fallback.record.retry_stage, 'SCHEMA_DISCOVERY')
assert.equal(fallback.record.retry_checkpoint_id, 'schema')

let failedValidationApplies = 0
const failedValidation = await executeAuthorizedRecovery({
  context: context({ retryAttempt: 1 }),
  failureClassification: 'CONFIGURATION',
  registry: new ExecutionRecoveryHandlerRegistry([{
    ...handler,
    async apply() {
      failedValidationApplies += 1
      return { mutationId: 'mutation-failed-validation' }
    },
    async validate() {
      return { valid: false, code: 'ROOT_CAUSE_STILL_PRESENT' }
    },
  }]),
})
assert.equal(failedValidationApplies, 1)
assert.equal(failedValidation.record.post_repair_validation_result, 'FAILED')
assert.equal(failedValidation.record.final_outcome, 'ESCALATED')
assert.equal(failedValidation.record.escalation_reason, 'REPAIR_VALIDATION_FAILED')

const mismatch = await executeAuthorizedRecovery({
  context: context(),
  failureClassification: 'CONFIGURATION',
  registry: new ExecutionRecoveryHandlerRegistry([{
    ...handler,
    async proposeRepair() {
      return {
        repairClass: 'SAFE_CONFIGURATION_RECONCILIATION',
        toolKey: 'configuration_reconcile',
        mutationScope: 'run:run-1',
        payload: {},
      }
    },
  }]),
})
assert.equal(mismatch.record.final_outcome, 'ESCALATED')
assert.equal(mismatch.record.escalation_reason, 'REPAIR_CLASS_MISMATCH')

let gatedApplies = 0
const gatedHandler = {
  ...handler,
  async apply() {
    gatedApplies += 1
    return { mutationId: 'should-not-run' }
  },
}
const claimRejected = await executeAuthorizedRecovery({
  context: context(),
  failureClassification: 'TRANSIENT_EXTERNAL',
  registry: new ExecutionRecoveryHandlerRegistry([gatedHandler]),
  beforeApply: async () => ({ proceed: false, reason: 'ATTEMPT_ALREADY_CLAIMED' }),
})
assert.equal(gatedApplies, 0)
assert.equal(claimRejected.record.final_outcome, 'ESCALATED')
assert.equal(claimRejected.record.escalation_reason, 'ATTEMPT_ALREADY_CLAIMED')

console.log('Execution Recovery Agent closed-loop contract tests passed.')
