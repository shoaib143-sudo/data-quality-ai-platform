import assert from 'node:assert/strict'

import {
  authorizeRecoveryRepair,
  retryTarget,
} from '../lib/orchestration/execution-recovery-contract.ts'
import {
  ExecutionRecoveryHandlerRegistry,
  executeAuthorizedRecovery,
} from '../lib/orchestration/execution-recovery-runtime.ts'

function makeContext(id, overrides = {}) {
  return {
    recoveryCaseId: `case-${id}`,
    projectId: `project-${id}`,
    workflowRunId: `run-${id}`,
    failingStage: 'METRIC_EXECUTION',
    failingCheckpointId: `metric-${id}`,
    retryable: true,
    blocking: true,
    knownRepairClass: 'RETRY_SAFE_RUNTIME_REPAIR',
    retryAttempt: 0,
    maxRepairAttempts: 2,
    evidence: [{ type: 'AGENT_RUN', id: `run-${id}` }],
    checkpoints: [
      { id: `dataset-${id}`, stage: 'SOURCE_ONBOARDING', valid: true, completed: true, upstreamIds: { datasetId: `dataset-${id}` } },
      { id: `schema-${id}`, stage: 'SCHEMA_DISCOVERY', valid: true, completed: true, upstreamIds: { datasetId: `dataset-${id}`, versionId: `version-${id}` } },
      { id: `metric-${id}`, stage: 'METRIC_EXECUTION', valid: false, completed: false },
    ],
    ...overrides,
  }
}

const unknown = authorizeRecoveryRepair(makeContext('unknown', {
  retryable: false,
  blocking: true,
  knownRepairClass: null,
}))
assert.equal(unknown.authorized, false)
assert.equal(unknown.escalationReason, 'NO_AUTHORIZED_REPAIR')

const p2 = authorizeRecoveryRepair(makeContext('p2', {
  retryable: false,
  blocking: false,
  knownRepairClass: null,
}))
assert.equal(p2.authorized, false)
assert.equal(p2.severity, 'P2')

const maxed = authorizeRecoveryRepair(makeContext('maxed', { retryAttempt: 2, maxRepairAttempts: 2 }))
assert.equal(maxed.authorized, false)
assert.equal(maxed.escalationReason, 'REPAIR_ATTEMPT_LIMIT_EXHAUSTED')

const fallbackContext = makeContext('fallback', {
  checkpoints: [
    { id: 'dataset-fallback', stage: 'SOURCE_ONBOARDING', valid: true, completed: true, upstreamIds: { datasetId: 'dataset-fallback' } },
    { id: 'schema-fallback', stage: 'SCHEMA_DISCOVERY', valid: false, completed: true, upstreamIds: { datasetId: 'dataset-fallback', versionId: 'version-fallback' } },
    { id: 'metric-fallback', stage: 'METRIC_EXECUTION', valid: false, completed: false },
  ],
})
assert.deepEqual(retryTarget(fallbackContext, false), {
  stage: 'SOURCE_ONBOARDING',
  checkpointId: 'dataset-fallback',
  usedFallback: true,
})

const mutations = []
const handler = {
  key: 'run-scoped-runtime-repair',
  canHandle: context => context.knownRepairClass === 'RETRY_SAFE_RUNTIME_REPAIR',
  async diagnose(context) {
    return {
      rootCause: `Runtime defect scoped to ${context.workflowRunId}`,
      repairClass: 'RETRY_SAFE_RUNTIME_REPAIR',
      evidenceIds: context.evidence.map(item => item.id),
    }
  },
  async proposeRepair(context) {
    return {
      repairClass: 'RETRY_SAFE_RUNTIME_REPAIR',
      toolKey: 'runtime_reconcile',
      mutationScope: `project:${context.projectId}:run:${context.workflowRunId}`,
      payload: { workflowRunId: context.workflowRunId },
    }
  },
  async apply(context) {
    mutations.push({ projectId: context.projectId, workflowRunId: context.workflowRunId })
    return { mutationId: `mutation-${context.workflowRunId}` }
  },
  async validate(context) {
    return { valid: true, code: `VALIDATED_${context.workflowRunId}` }
  },
  sameStageRetrySafe() {
    return true
  },
}

const registry = new ExecutionRecoveryHandlerRegistry([handler])
const [runA, runB] = await Promise.all([
  executeAuthorizedRecovery({ context: makeContext('a'), failureClassification: 'RUNTIME_SYSTEM_DEFECT', registry }),
  executeAuthorizedRecovery({ context: makeContext('b'), failureClassification: 'RUNTIME_SYSTEM_DEFECT', registry }),
])

assert.equal(runA.record.final_outcome, 'RECOVERED')
assert.equal(runB.record.final_outcome, 'RECOVERED')
assert.equal(runA.record.retry_checkpoint_id, 'metric-a')
assert.equal(runB.record.retry_checkpoint_id, 'metric-b')
assert.deepEqual(mutations.sort((a, b) => a.workflowRunId.localeCompare(b.workflowRunId)), [
  { projectId: 'project-a', workflowRunId: 'run-a' },
  { projectId: 'project-b', workflowRunId: 'run-b' },
])

const unsafeHandler = {
  ...handler,
  async proposeRepair(context) {
    return {
      repairClass: 'SAFE_CONFIGURATION_RECONCILIATION',
      toolKey: 'unexpected_repair',
      mutationScope: `project:${context.projectId}`,
      payload: {},
    }
  },
}
const mismatch = await executeAuthorizedRecovery({
  context: makeContext('mismatch'),
  failureClassification: 'RUNTIME_SYSTEM_DEFECT',
  registry: new ExecutionRecoveryHandlerRegistry([unsafeHandler]),
})
assert.equal(mismatch.record.final_outcome, 'ESCALATED')
assert.equal(mismatch.record.escalation_reason, 'REPAIR_CLASS_MISMATCH')

for (const [flag, expected] of [
  ['credentialMissing', 'MISSING_CREDENTIALS'],
  ['privilegeExpansionRequired', 'PRIVILEGE_EXPANSION_REQUIRED'],
  ['destructiveMutationRequired', 'DESTRUCTIVE_MUTATION_REQUIRED'],
  ['policyBlocked', 'POLICY_BLOCKED'],
  ['productionMutationRequired', 'PRODUCTION_MUTATION_REQUIRES_APPROVAL'],
]) {
  const result = await executeAuthorizedRecovery({
    context: makeContext(flag, { [flag]: true }),
    failureClassification: 'GOVERNED_EXCEPTION',
    registry,
  })
  assert.equal(result.record.final_outcome, 'ESCALATED')
  assert.equal(result.record.escalation_reason, expected)
}

console.log('Execution Recovery Agent adversarial policy and run-isolation tests passed.')
