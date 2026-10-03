import assert from 'node:assert/strict'
import './lib/register-typescript-resolution.mjs'
const { ObservableIntelligentRouter } = await import('../lib/ai/observable-intelligent-router.ts')
const request = { task: 'general', system: 'synthetic', input: {} }
const context = { projectId: 'p', task: 'general', executionCorrelationId: '11111111-1111-4111-8111-111111111111' }
const telemetry = { async record() {} }
function router(generateJson, budget, admission, accounting) {
  return new ObservableIntelligentRouter({ async route() { return { source: 'ENVIRONMENT_FALLBACK', reason: 'NO_ACTIVE_GOVERNED_CANDIDATES', provider: { id: 'test', generateJson }, evidence: null } } }, telemetry, budget, admission, accounting)
}
let calls = 0
const stopped = AbortSignal.abort(new DOMException('stopped', 'AbortError'))
let decision = await router(async () => { calls++ }).route({ ...context, signal: stopped })
await assert.rejects(decision.provider.generateJson(request), { name: 'AbortError' })
assert.equal(calls, 0)

const execution = new AbortController()
const caller = new AbortController()
decision = await router(async (input) => {
  calls++
  assert.notEqual(input.signal, caller.signal)
  execution.abort(new DOMException('deadline', 'TimeoutError'))
  input.signal.throwIfAborted()
}).route({ ...context, signal: execution.signal })
await assert.rejects(decision.provider.generateJson({ ...request, signal: caller.signal }), { name: 'TimeoutError' })
assert.equal(calls, 1)

const duringAdmission = new AbortController()
let releases = 0
decision = await router(async () => { calls++ }, { async resolveProjectBudget() { return { policyId: 'b', maxOutputTokens: 10, maxRequestsPerMinute: 1, maxConcurrentExecutions: 1 } } }, {
  async acquire() { duringAdmission.abort(new DOMException('deadline', 'TimeoutError')); return { admitted: true, reason: 'ADMITTED', leaseId: 'lease' } },
  async release() { releases++ },
}).route({ ...context, signal: duringAdmission.signal })
await assert.rejects(decision.provider.generateJson(request), { name: 'TimeoutError' })
assert.equal(calls, 1)
assert.equal(releases, 1)

const raced = new AbortController()
let accounted = 0
decision = await router(async () => {
  raced.abort(new DOMException('stopped', 'AbortError'))
  return { provider: 'test', model: 'test', result: {}, latencyMs: 1, usage: { totalTokens: 4 } }
}, undefined, undefined, { async recordInvocation(input) { accounted++; assert.equal(input.usage.totalTokens, 4); return { accountingStatus: 'USAGE_UNAVAILABLE' } } }).route({ ...context, signal: raced.signal })
await assert.rejects(decision.provider.generateJson(request), { name: 'AbortError' })
assert.equal(accounted, 1)
console.log('Execution cancellation routing, lease cleanup, and late accounting passed')
