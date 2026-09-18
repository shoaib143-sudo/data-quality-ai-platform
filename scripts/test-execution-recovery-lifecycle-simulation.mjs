import assert from 'node:assert/strict'

import { ExecutionRecoveryHandlerRegistry, executeAuthorizedRecovery } from '../lib/orchestration/execution-recovery-runtime.ts'

const counts = {
  dataset: 0,
  version: 0,
  readiness: 0,
  profileRun: 0,
  schema: 0,
  metric: 0,
  findings: 0,
  score: 0,
  governance: 0,
}

const ids = {
  datasetId: 'dataset-1',
  versionId: 'version-1',
  profileRunId: 'profile-run-1',
  schemaCheckpointId: 'schema-checkpoint-1',
}

let connectorHealthy = false

async function runStage(stage) {
  counts[stage] += 1
  if (stage === 'metric' && !connectorHealthy) {
    throw Object.assign(new Error('connection timeout while executing metric batch'), { code: 'CONNECTION_TIMEOUT' })
  }
}

for (const stage of ['dataset', 'version', 'readiness', 'profileRun', 'schema']) await runStage(stage)

let metricFailure = null
try {
  await runStage('metric')
} catch (error) {
  metricFailure = error
}
assert.ok(metricFailure)

const context = {
  recoveryCaseId: 'case-metric-p1',
  projectId: 'project-1',
  workflowRunId: 'workflow-1',
  failingStage: 'METRIC_EXECUTION',
  failingCheckpointId: 'metric-checkpoint-1',
  code: metricFailure.code,
  retryable: true,
  blocking: true,
  knownRepairClass: 'SOURCE_READINESS_RECONCILIATION',
  retryAttempt: 0,
  maxRepairAttempts: 2,
  evidence: [{ type: 'AGENT_RUN', id: 'workflow-1' }],
  checkpoints: [
    { id: 'dataset-checkpoint-1', stage: 'SOURCE_ONBOARDING', valid: true, completed: true, upstreamIds: { datasetId: ids.datasetId } },
    { id: ids.schemaCheckpointId, stage: 'SCHEMA_DISCOVERY', valid: true, completed: true, upstreamIds: { datasetId: ids.datasetId, versionId: ids.versionId, profileRunId: ids.profileRunId } },
    { id: 'metric-checkpoint-1', stage: 'METRIC_EXECUTION', valid: false, completed: false },
  ],
}

const handler = {
  key: 'source-readiness-reconciliation',
  canHandle: value => value.knownRepairClass === 'SOURCE_READINESS_RECONCILIATION',
  async diagnose() {
    return { rootCause: 'Persisted execution evidence shows a transient source connection failure.', repairClass: 'SOURCE_READINESS_RECONCILIATION', evidenceIds: ['workflow-1'] }
  },
  async proposeRepair() {
    return { repairClass: 'SOURCE_READINESS_RECONCILIATION', toolKey: 'revalidate-source', mutationScope: 'project:project-1:source:source-1', payload: {} }
  },
  async apply() {
    connectorHealthy = true
    return { mutationId: 'source-revalidation-1' }
  },
  async validate() {
    return { valid: connectorHealthy, code: connectorHealthy ? 'SOURCE_OPERATIONAL' : 'SOURCE_STILL_BLOCKED' }
  },
  sameStageRetrySafe() {
    return true
  },
}

const recovery = await executeAuthorizedRecovery({
  context,
  failureClassification: 'TRANSIENT_EXTERNAL',
  registry: new ExecutionRecoveryHandlerRegistry([handler]),
})

assert.equal(recovery.record.post_repair_validation_result, 'PASSED')
assert.equal(recovery.record.retry_stage, 'METRIC_EXECUTION')
assert.equal(recovery.record.retry_checkpoint_id, 'metric-checkpoint-1')
assert.equal(recovery.record.pre_repair_checkpoint_id, ids.schemaCheckpointId)
assert.equal(recovery.record.final_outcome, 'OPEN')

await runStage('metric')
for (const stage of ['findings', 'score', 'governance']) await runStage(stage)

assert.deepEqual(counts, {
  dataset: 1,
  version: 1,
  readiness: 1,
  profileRun: 1,
  schema: 1,
  metric: 2,
  findings: 1,
  score: 1,
  governance: 1,
})

assert.deepEqual(ids, {
  datasetId: 'dataset-1',
  versionId: 'version-1',
  profileRunId: 'profile-run-1',
  schemaCheckpointId: 'schema-checkpoint-1',
})

const connectorCounts = { registration: 0, connector: 0, validation: 0, downstream: 0 }
let connectorEstablished = false
connectorCounts.registration += 1
connectorCounts.connector += 1

const connectorRecovery = await executeAuthorizedRecovery({
  context: {
    ...context,
    recoveryCaseId: 'case-connector-p1',
    workflowRunId: 'workflow-connector-1',
    failingStage: 'CONNECTOR_ESTABLISHMENT',
    failingCheckpointId: 'connector-checkpoint-1',
    knownRepairClass: 'SOURCE_READINESS_RECONCILIATION',
    checkpoints: [
      { id: 'registration-checkpoint-1', stage: 'SOURCE_ONBOARDING', valid: true, completed: true },
      { id: 'connector-checkpoint-1', stage: 'CONNECTOR_ESTABLISHMENT', valid: false, completed: false },
    ],
  },
  failureClassification: 'TRANSIENT_EXTERNAL',
  registry: new ExecutionRecoveryHandlerRegistry([{
    ...handler,
    async apply() { connectorEstablished = true; return { mutationId: 'connector-repair-1' } },
    async validate() { connectorCounts.validation += 1; return { valid: connectorEstablished, code: 'CONNECTOR_VALIDATED' } },
  }]),
})

assert.equal(connectorRecovery.record.retry_stage, 'CONNECTOR_ESTABLISHMENT')
connectorCounts.connector += 1
connectorCounts.downstream += 1
assert.deepEqual(connectorCounts, { registration: 1, connector: 2, validation: 1, downstream: 1 })

console.log('Execution Recovery Agent lifecycle recovery simulation passed.')
