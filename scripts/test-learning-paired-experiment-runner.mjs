import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { setResponses, getCalls } from './fixtures/learning-experiment-runner-admin.mjs'

const mockUrl = new URL('./fixtures/learning-experiment-runner-admin.mjs', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@/lib/supabase/admin') return next(mockUrl, context)
  return next(specifier, context)
} })

const {
  executeGovernedLearningExperimentArm,
  prepareGovernedLearningExperimentAttempt,
  beginGovernedLearningExperimentDispatch,
} = await import('../lib/agents/governed-learning-paired-experiment-runner.ts')

const ids = {
  projectId: '11111111-1111-4111-8111-111111111111',
  policyId: '22222222-2222-4222-8222-222222222222',
  candidateId: '33333333-3333-4333-8333-333333333333',
  datasetManifestId: '44444444-4444-4444-8444-444444444444',
  agentDefinitionId: '55555555-5555-4555-8555-555555555555',
  attemptId: '66666666-6666-4666-8666-666666666666',
  runId: '77777777-7777-4777-8777-777777777777',
  reservationId: '88888888-8888-4888-8888-888888888888',
  costEventId: '99999999-9999-4999-8999-999999999999',
}
const executionKey = `sha256:${'a'.repeat(64)}`
const input = {
  projectId: ids.projectId,
  policyId: ids.policyId,
  candidateId: ids.candidateId,
  datasetManifestId: ids.datasetManifestId,
  caseKey: 'b'.repeat(64),
  arm: 'CANDIDATE',
  agentDefinitionId: ids.agentDefinitionId,
  version: '2',
  inputEvidenceRef: 'artifact:input:fixture',
}

const ok = data => ({ data, error: null })

setResponses([
  ok({ attemptId: ids.attemptId, runId: ids.runId, executionKey, status: 'PREPARED', reused: false }),
  ok({ admitted: true, reason: 'DISPATCH_COMMITTED', runId: ids.runId, status: 'DISPATCHED' }),
  ok({ status: 'COMPLETED', idempotent: false, runId: ids.runId }),
])
let executorCalls = 0
const completed = await executeGovernedLearningExperimentArm(input, async context => {
  executorCalls += 1
  assert.equal(context.runId, ids.runId)
  assert.equal(context.status, 'DISPATCHED')
  return {
    terminalStatus: 'COMPLETED',
    outputEvidenceRef: 'artifact:output:fixture',
    reservationId: ids.reservationId,
    costEventId: ids.costEventId,
  }
})
assert.equal(completed.status, 'COMPLETED')
assert.equal(executorCalls, 1)
assert.deepEqual(getCalls().map(call => call.fn), [
  'prepare_learning_experiment_attempt',
  'begin_learning_experiment_dispatch',
  'complete_learning_experiment_attempt',
])
assert.equal(getCalls()[0].args.p_synthetic, false)

setResponses([
  ok({ attemptId: ids.attemptId, runId: ids.runId, executionKey, status: 'DISPATCHED', reused: true }),
  ok({ admitted: false, reason: 'AMBIGUOUS_PRIOR_DISPATCH_REQUIRES_RECONCILIATION', runId: ids.runId, status: 'DISPATCHED' }),
])
executorCalls = 0
await assert.rejects(
  executeGovernedLearningExperimentArm(input, async () => {
    executorCalls += 1
    throw new Error('must not execute')
  }),
  { name: 'LearningExperimentResumeBlockedError' },
)
assert.equal(executorCalls, 0, 'ambiguous prior dispatch must never issue a second executor call')

setResponses([
  ok({ attemptId: ids.attemptId, runId: ids.runId, executionKey, status: 'PREPARED', reused: false }),
  ok({ admitted: true, reason: 'DISPATCH_COMMITTED', runId: ids.runId, status: 'DISPATCHED' }),
  ok({ status: 'RECONCILIATION_REQUIRED', idempotent: false, runId: ids.runId }),
])
await assert.rejects(
  executeGovernedLearningExperimentArm(input, async () => {
    throw Object.assign(new Error('provider process lost after dispatch'), { name: 'ProviderProcessLostError' })
  }),
  /provider process lost after dispatch/,
)
const failureCalls = getCalls()
assert.equal(failureCalls[2].fn, 'complete_learning_experiment_attempt')
assert.equal(failureCalls[2].args.p_terminal_status, 'RECONCILIATION_REQUIRED')
assert.equal(failureCalls[2].args.p_error_code, 'ProviderProcessLostError')

setResponses([
  { data: null, error: { message: 'database unavailable' } },
])
await assert.rejects(prepareGovernedLearningExperimentAttempt(input), /Unable to prepare learning experiment attempt/)

setResponses([
  ok({ attemptId: ids.attemptId, runId: ids.runId, executionKey, status: 'DISPATCHED', reused: true }),
])
const prepared = await prepareGovernedLearningExperimentAttempt(input)
assert.equal(prepared.reused, true)
assert.equal(prepared.status, 'DISPATCHED')

setResponses([
  ok({ admitted: false, reason: 'ATTEMPT_ALREADY_TERMINAL', runId: ids.runId, status: 'COMPLETED' }),
])
const terminal = await beginGovernedLearningExperimentDispatch({
  projectId: ids.projectId,
  attemptId: ids.attemptId,
  executionKey,
})
assert.equal(terminal.admitted, false)
assert.equal(terminal.reason, 'ATTEMPT_ALREADY_TERMINAL')

console.log('Paired experiment coordinator commits dispatch before execution, blocks ambiguous replay, and fail-closes executor failures.')
