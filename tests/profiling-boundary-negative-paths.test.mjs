import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Isolated mutation/negative-path contract tests. No network, database, or
// production profiling execution is performed by this suite.
const job = readFileSync('lib/agents/run-profiling-job.ts', 'utf8')
const executor = readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')
const inputs = readFileSync('scripts/test-profiling-request-input.mjs', 'utf8')

const toolCalls = ['profile_dataset', 'execute_metrics', 'investigate_profile']
function nativeInput(source, operation) {
  const escaped = operation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp("executeProfilingExecutor\\('"+escaped+"',\\s*(\\{[^}]*\\})")
  const match = source.match(expression)
  assert.ok(match, 'native call absent for '+operation)
  return match[1].replace(/\s+/g, ' ').trim()
}

test('all three native operation inputs are exactly two identifiers', () => {
  for (const operation of toolCalls) {
    assert.equal(nativeInput(job, operation), '{ datasetVersionId, profilingRunId }')
  }
})

test('adversarial extra metadata insertion is rejected by the boundary assertion', () => {
  for (const operation of toolCalls) {
    const tampered = job.replace(
      nativeInput(job, operation),
      '{ ...requestInput, datasetVersionId, profilingRunId }',
    )
    assert.notEqual(nativeInput(tampered, operation), '{ datasetVersionId, profilingRunId }')
    assert.match(nativeInput(tampered, operation), /\.\.\.requestInput/)
  }
})

test('adversarial forged metrics and source rows are never passed into metric execution', () => {
  assert.match(executor, /executeProfilingMetrics\(datasetVersionId, profilingRunId, \{\}\)/)
  assert.doesNotMatch(executor, /executeProfilingMetrics\(datasetVersionId, profilingRunId, (?:input|toolInput)\)/)
  for (const property of ['rows', 'metrics', 'findings', 'score', 'source', 'secret']) {
    assert.match(inputs, new RegExp("assert\\.equal\\('"+property+"' in sanitized, false\\)"))
  }
})

test('readiness and native admission precede each mutable source operation', () => {
  const readiness = executor.indexOf('await assertDatasetVersionProfileReady(')
  const admission = executor.indexOf('await admitNativeToolInvocation(')
  const dispatch = executor.indexOf('switch (operation)')
  assert.ok(readiness >= 0 && admission > readiness && dispatch > admission)
  assert.match(executor, /PROFILE_READINESS_GATED_OPERATIONS\s*=\s*new Set\(\[[\s\S]*?'profile_dataset'[\s\S]*?'execute_metrics'/)
})

test('cancellation checks occur after each native step and preserve terminal state', () => {
  for (const operation of toolCalls) {
    const start = job.indexOf("executeProfilingExecutor('"+operation+"'")
    assert.ok(start >= 0)
    const next = job.slice(start, start + 600)
    assert.match(next, /await isRunCancelled\(agentRunId\)/)
    assert.match(next, /await preserveCancellation\(agentRunId, profilingRunId/)
  }
  assert.match(job, /profile_runs'\)\.update\(\{ status: 'CANCELLED'/)
  assert.match(job, /\.eq\('status', 'RUNNING'\)/)
})

test('failed native execution persists failure and proposes bounded negative evidence', () => {
  const handler = job.slice(job.lastIndexOf('} catch (error) {'))
  assert.match(handler, /status: 'FAILED', error_code: 'PROFILING_EXECUTION_FAILED'/)
  assert.match(handler, /await proposeNegativeCaseFromFailedAgentRun\(/)
  assert.match(handler, /negative-case learning failed safely/)
  assert.match(handler, /try \{ cancelled = await isRunCancelled\(agentRunId\)/)
})

test('profile and metric dispatch retain replay-safe wrappers', () => {
  for (const helper of [
    'executeProfileDatasetReplaySafe',
    'executeProfilingMetricsReplaySafe',
    'investigateProfilingRunReplaySafe',
  ]) assert.ok(executor.includes(helper+'({'), helper+' replay wrapper missing')
})
