import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { setResponses, getCalls } from './fixtures/learning-experiment-runner-admin.mjs'
import { setArtifactResponses, getArtifactCalls } from './fixtures/learning-experiment-runner-artifact.mjs'

const adminUrl = new URL('./fixtures/learning-experiment-runner-admin.mjs', import.meta.url).href
const artifactUrl = new URL('./fixtures/learning-experiment-runner-artifact.mjs', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@/lib/supabase/admin') return next(adminUrl, context)
  if (specifier === '@/lib/agents/run-result-artifact') return next(artifactUrl, context)
  return next(specifier, context)
} })

const { executeGovernedLearningExperimentArm, reconcileGovernedLearningExperimentAttempt } = await import('../lib/agents/governed-learning-paired-experiment-runner.ts')

const ids = {
  projectId: '11111111-1111-4111-8111-111111111111',
  policyId: '22222222-2222-4222-8222-222222222222',
  candidateId: '33333333-3333-4333-8333-333333333333',
  datasetManifestId: '44444444-4444-4444-8444-444444444444',
  agentDefinitionId: '55555555-5555-4555-8555-555555555555',
  attemptId: '66666666-6666-4666-8666-666666666666',
  runId: '77777777-7777-4777-8777-777777777777',
  artifactId: '88888888-8888-4888-8888-888888888888',
  reservationId: '99999999-9999-4999-8999-999999999999',
  costEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}
const executionKey = `sha256:${'b'.repeat(64)}`
const contentHash = `sha256:${'c'.repeat(64)}`
const input = {
  projectId: ids.projectId,
  policyId: ids.policyId,
  candidateId: ids.candidateId,
  datasetManifestId: ids.datasetManifestId,
  caseKey: 'd'.repeat(64),
  arm: 'CANDIDATE',
  agentDefinitionId: ids.agentDefinitionId,
  version: '2',
  inputEvidenceRef: 'fixture:input:evidence',
}
const ok = data => ({ data, error: null })
const prepare = () => ok({ attemptId: ids.attemptId, runId: ids.runId, executionKey, status: 'PREPARED', reused: false })
const dispatch = () => ok({ admitted: true, reason: 'DISPATCH_COMMITTED', runId: ids.runId, status: 'DISPATCHED' })

// Successful completion persists one canonical artifact and binds its ID through v2 completion.
setResponses([
  prepare(),
  dispatch(),
  ok({
    status: 'COMPLETED', idempotent: false, runId: ids.runId,
    resultArtifactId: ids.artifactId, resultContentHash: contentHash,
  }),
])
setArtifactResponses([{ artifactId: ids.artifactId, contentHash, createdAt: '2026-10-01T00:00:00Z' }])
const result = await executeGovernedLearningExperimentArm(input, async () => ({
  terminalStatus: 'COMPLETED',
  output: { answer: 'governed fixture output', evidence: ['fixture:evidence:1'] },
  reservationId: ids.reservationId,
  costEventId: ids.costEventId,
}))
assert.equal(result.status, 'COMPLETED')
assert.equal(result.resultArtifactId, ids.artifactId)
assert.equal(getArtifactCalls().length, 1)
assert.equal(getArtifactCalls()[0].agentRunId, ids.runId)
assert.deepEqual(getArtifactCalls()[0].output, { answer: 'governed fixture output', evidence: ['fixture:evidence:1'] })
const successCalls = getCalls()
assert.deepEqual(successCalls.map(call => call.fn), [
  'prepare_learning_experiment_attempt',
  'begin_learning_experiment_dispatch',
  'complete_learning_experiment_attempt_v2',
])
assert.equal(successCalls[2].args.p_result_artifact_id, ids.artifactId)

// A completed result without structured output is not allowed to reach COMPLETED.
setResponses([
  prepare(),
  dispatch(),
  ok({ status: 'RECONCILIATION_REQUIRED', idempotent: false, runId: ids.runId, resultArtifactId: null, resultContentHash: null }),
])
setArtifactResponses([])
await assert.rejects(
  executeGovernedLearningExperimentArm(input, async () => ({ terminalStatus: 'COMPLETED' })),
  /requires structured canonical output/,
)
assert.equal(getArtifactCalls().length, 0)
assert.equal(getCalls().at(-1).args.p_terminal_status, 'RECONCILIATION_REQUIRED')

// Artifact persistence conflict/failure also forces reconciliation-required.
setResponses([
  prepare(),
  dispatch(),
  ok({ status: 'RECONCILIATION_REQUIRED', idempotent: false, runId: ids.runId, resultArtifactId: null, resultContentHash: null }),
])
setArtifactResponses([{ error: 'artifact integrity conflict' }])
await assert.rejects(
  executeGovernedLearningExperimentArm(input, async () => ({
    terminalStatus: 'COMPLETED',
    output: { answer: 'different output' },
  })),
  /artifact integrity conflict/,
)
assert.equal(getCalls().at(-1).args.p_terminal_status, 'RECONCILIATION_REQUIRED')

// A database refusal during final canonical binding must surface; it cannot be
// turned into success merely because the artifact was persisted.
setResponses([
  prepare(),
  dispatch(),
  { data: null, error: { message: 'canonical artifact binding rejected' } },
  ok({ status: 'RECONCILIATION_REQUIRED', idempotent: false, runId: ids.runId, resultArtifactId: null, resultContentHash: null }),
])
setArtifactResponses([{ artifactId: ids.artifactId, contentHash, createdAt: '2026-10-01T00:00:00Z' }])
await assert.rejects(
  executeGovernedLearningExperimentArm(input, async () => ({
    terminalStatus: 'COMPLETED',
    output: { answer: 'persisted but not bound' },
  })),
  /canonical artifact binding rejected/,
)
assert.equal(getCalls().at(-1).fn, 'complete_learning_experiment_attempt_v2')
assert.equal(getCalls().at(-1).args.p_terminal_status, 'RECONCILIATION_REQUIRED')

console.log('Learning runner canonical evidence binding persists one content-addressed result artifact and fails closed on missing/conflicting evidence.')


// Delayed authoritative accounting can reconcile evidence without executor re-dispatch.
setResponses([
  ok({
    status: 'COMPLETED', idempotent: false, runId: ids.runId,
    resultArtifactId: ids.artifactId, resultContentHash: contentHash,
  }),
])
const reconciled = await reconcileGovernedLearningExperimentAttempt({
  projectId: ids.projectId,
  attemptId: ids.attemptId,
  executionKey,
  resultArtifactId: ids.artifactId,
  reservationId: ids.reservationId,
  costEventId: ids.costEventId,
})
assert.equal(reconciled.status, 'COMPLETED')
assert.equal(getCalls().length, 1)
assert.equal(getCalls()[0].fn, 'reconcile_learning_experiment_attempt')
assert.equal(getArtifactCalls().length, 1, 'reconciliation must not repersist or re-execute output')

console.log('Delayed accounting reconciliation binds existing canonical evidence without provider redispatch.')
