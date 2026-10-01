import assert from 'node:assert/strict'
import './lib/register-typescript-resolution.mjs'
const { executeLearningExperimentInvocation } = await import('../lib/ai/learning-experiment-budget.ts')
const { ObservableIntelligentRouter } = await import('../lib/ai/observable-intelligent-router.ts')
const { ResilientReasoningProvider } = await import('../lib/ai/provider-resilience.ts')
const { GOVERNED_AGENT_KEYS } = await import('../lib/agents/governed-agent-registry.ts')

const request = { task: 'general', system: 'synthetic experiment', input: {} }
const scope = { projectId: '11111111-1111-4111-8111-111111111111', policyId: '22222222-2222-4222-8222-222222222222', candidateId: '33333333-3333-4333-8333-333333333333', runId: '44444444-4444-4444-8444-444444444444', agentKey: 'profiling_agent', mode: 'GUIDED' }
const quoteValue = { maxOutputTokens: 8, totalTokensUpperBound: 20, costUsdUpperBound: '0.01', currency: 'USD', providerId: 'synthetic', modelName: 'synthetic-model', pricingVersionId: '66666666-6666-4666-8666-666666666666' }
const result = { provider: 'synthetic', model: 'synthetic-model', result: { ok: true }, latencyMs: 1, usage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 }, providerRequestId: 'request' }
function fixture(overrides = {}) {
  const events = []
  const f = {
    scope: { ...scope }, request: { ...request }, expectedModelName: 'synthetic-model', events,
    quote: { async quote(input) { events.push(['quote', input]); return { ...quoteValue } } },
    admission: {
      async reserve(input) { events.push(['reserve', input]); return { admitted: true, reason: 'ADMITTED', reservationId: '55555555-5555-4555-8555-555555555555', deadlineAt: new Date(Date.now() + 10000).toISOString() } },
      async reconcile(input) { events.push(['reconcile', input]); return { status: input.accountingComplete ? 'ACCOUNTED' : 'UNKNOWN' } },
    },
    provider: { id: 'synthetic', async generateJson(input) { events.push(['provider', input]); return structuredClone(result) } },
    costAccounting: { async recordInvocation(input) {
      events.push(['accounting', input]);
      return { id: '77777777-7777-4777-8777-777777777777', invocationId: input.invocationId, projectId: input.projectId, executionCorrelationId: input.executionCorrelationId ?? null, providerRequestId: input.providerRequestId ?? null,
        providerId: input.providerId, modelName: input.modelName, inputTokens: input.usage?.inputTokens ?? null, outputTokens: input.usage?.outputTokens ?? null, totalTokens: input.usage?.totalTokens ?? null,
        pricingVersionId: '66666666-6666-4666-8666-666666666666', currency: 'USD', inputCost: '0.001', outputCost: '0.001', totalCost: '0.002', accountingStatus: 'PRICED', observedAt: input.observedAt, recordedAt: input.observedAt }
    } },
    ...overrides,
  }
  return f
}
function count(f, kind) { return f.events.filter(([event]) => event === kind).length }
function entry(f, kind) { return f.events.find(([event]) => event === kind)?.[1] }

// Every canonical agent and supported mode uses the same guarded invocation boundary.
for (const agentKey of GOVERNED_AGENT_KEYS) for (const mode of ['GUIDED', 'GOVERNED_AUTO', 'FULL_AUTONOMOUS']) {
  const f = fixture({ scope: { ...scope, agentKey, mode } })
  await executeLearningExperimentInvocation(f)
  assert.equal(count(f, 'provider'), 1)
  assert.equal(entry(f, 'reserve').agentKey, agentKey)
  assert.equal(entry(f, 'reserve').mode, mode)
  assert.equal(entry(f, 'reserve').reservedTokens, 20)
  assert.equal(entry(f, 'reserve').providerId, quoteValue.providerId)
  assert.equal(entry(f, 'reserve').modelName, quoteValue.modelName)
  assert.equal(entry(f, 'reserve').pricingVersionId, quoteValue.pricingVersionId)
  assert.equal(Number(entry(f, 'reserve').reservedCostUsd), 0.01)
  assert.equal(entry(f, 'provider').allowFallback, false)
  assert.equal(entry(f, 'provider').maxOutputTokens, 8)
  assert.equal(entry(f, 'reconcile').accountingComplete, true)
  assert.equal(entry(f, 'reconcile').observedTokens, 10)
  assert.equal(entry(f, 'reconcile').costEventId, '77777777-7777-4777-8777-777777777777')
  assert.equal(Number(entry(f, 'reconcile').observedCostUsd), 0.002)
  assert.equal(entry(f, 'accounting').invocationId, entry(f, 'reserve').invocationId)
}
{
  const f = fixture({ request: { ...request, maxOutputTokens: 3 } })
  f.provider.generateJson = async input => { f.events.push(['provider', input]); return { ...result, usage: { inputTokens: 6, outputTokens: 2, totalTokens: 8 } } }
  await executeLearningExperimentInvocation(f)
  assert.equal(entry(f, 'provider').maxOutputTokens, 3)
}
for (const overrides of [
  { quote: { async quote() { return null } } },
  { quote: undefined },
  { expectedModelName: undefined },
  { expectedModelName: 'unquoted-model' },
  { admission: undefined },
  { costAccounting: undefined },
  { quote: { async quote() { throw new Error('pricing unavailable') } } },
  { quote: { async quote() { return { ...quoteValue, currency: 'EUR' } } } },
  { quote: { async quote() { return { ...quoteValue, totalTokensUpperBound: 0 } } } },
  { quote: { async quote() { return { ...quoteValue, costUsdUpperBound: '-1' } } } },
]) {
  const f = fixture(overrides)
  await assert.rejects(executeLearningExperimentInvocation(f))
  assert.equal(count(f, 'provider'), 0)
}
{
  const f = fixture()
  f.admission.reserve = async input => { f.events.push(['reserve', input]); return { admitted: false, reason: 'BUDGET_EXHAUSTED', reservationId: null, deadlineAt: null } }
  await assert.rejects(executeLearningExperimentInvocation(f))
  assert.equal(count(f, 'provider'), 0)
  assert.equal(count(f, 'accounting'), 0)
}
{
  const f = fixture()
  f.admission.reserve = async () => { throw new Error('database unavailable') }
  await assert.rejects(executeLearningExperimentInvocation(f))
  assert.equal(count(f, 'provider'), 0)
}
{
  const error = new TypeError('synthetic provider failed')
  const f = fixture()
  f.provider.generateJson = async input => { f.events.push(['provider', input]); throw error }
  await assert.rejects(executeLearningExperimentInvocation(f), e => e === error)
  assert.equal(count(f, 'provider'), 1)
  assert.equal(entry(f, 'reconcile').accountingComplete, false)
}
{
  const f = fixture()
  f.admission.reconcile = async () => { throw new Error('reconciliation unavailable') }
  await assert.rejects(executeLearningExperimentInvocation(f))
  assert.equal(count(f, 'provider'), 1)
}
{
  const f = fixture()
  f.costAccounting.recordInvocation = async () => { throw new Error('accounting unavailable') }
  await assert.rejects(executeLearningExperimentInvocation(f))
  assert.equal(entry(f, 'reconcile').accountingComplete, false)
}
for (const usage of [undefined, { inputTokens: 6 }, { inputTokens: 6, outputTokens: 4, totalTokens: 9 }, { inputTokens: -1, outputTokens: 4, totalTokens: 3 }]) {
  const f = fixture()
  f.provider.generateJson = async input => { f.events.push(['provider', input]); return { ...result, usage } }
  await assert.rejects(executeLearningExperimentInvocation(f))
  assert.equal(entry(f, 'reconcile').accountingComplete, false)
}
for (const change of [ { usage: { inputTokens: 18, outputTokens: 4, totalTokens: 22 } }, { usage: { inputTokens: 6, outputTokens: 9, totalTokens: 15 } }, { provider: 'unquoted-provider' }, { model: 'unquoted-model' } ]) {
  const f = fixture()
  f.provider.generateJson = async input => { f.events.push(['provider', input]); return { ...result, ...change } }
  await assert.rejects(executeLearningExperimentInvocation(f))
}
for (const change of [ { accountingStatus: 'PRICE_UNAVAILABLE', totalCost: null }, { totalCost: '0.02' }, { currency: 'EUR' }, { pricingVersionId: 'other-price' }, { totalTokens: 11 }, { projectId: 'other-project' } ]) {
  const f = fixture()
  const record = f.costAccounting.recordInvocation
  f.costAccounting.recordInvocation = async input => ({ ...await record(input), ...change })
  await assert.rejects(executeLearningExperimentInvocation(f))
}
{
  const f = fixture({ request: { ...request, signal: AbortSignal.abort(new DOMException('stopped', 'AbortError')) } })
  await assert.rejects(executeLearningExperimentInvocation(f), { name: 'AbortError' })
  assert.equal(count(f, 'provider'), 0)
}
{
  const f = fixture()
  f.admission.reserve = async input => { f.events.push(['reserve', input]); return { admitted: true, reason: 'ADMITTED', reservationId: '55555555-5555-4555-8555-555555555555', deadlineAt: new Date(Date.now() - 1).toISOString() } }
  await assert.rejects(executeLearningExperimentInvocation(f))
  assert.equal(count(f, 'provider'), 0)
}
{
  const controller = new AbortController()
  const f = fixture({ request: { ...request, signal: controller.signal } })
  let entered
  const started = new Promise(resolve => { entered = resolve })
  f.provider.generateJson = async input => new Promise((_resolve, reject) => {
    f.events.push(['provider', input]); assert.ok(input.signal)
    input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true }); entered()
  })
  const pending = executeLearningExperimentInvocation(f)
  await started
  controller.abort(new DOMException('cancelled', 'AbortError'))
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(entry(f, 'reconcile').accountingComplete, false)
}
{
  const f = fixture()
  f.admission.reserve = async input => { f.events.push(['reserve', input]); return { admitted: true, reason: 'ADMITTED', reservationId: '55555555-5555-4555-8555-555555555555', deadlineAt: new Date(Date.now() + 30).toISOString() } }
  f.provider.generateJson = async input => new Promise((_resolve, reject) => {
    f.events.push(['provider', input]);
    input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true })
  })
  // Keep the process alive while AbortSignal.timeout's unreferenced timer fires.
  const keepAlive = setTimeout(() => {}, 500)
  try { await assert.rejects(executeLearningExperimentInvocation(f), { name: 'TimeoutError' }) } finally { clearTimeout(keepAlive) }
  assert.equal(entry(f, 'reconcile').accountingComplete, false)
}
for (const change of [ { projectId: 'not-a-uuid' }, { mode: 'UNKNOWN' }, { agentKey: 'custom_agent' } ]) {
  const f = fixture({ scope: { ...scope, ...change } })
  await assert.rejects(executeLearningExperimentInvocation(f))
  assert.equal(count(f, 'provider'), 0)
}
for (const status of ['EXCEEDED', 'UNKNOWN', 'unexpected', undefined]) {
  const f = fixture()
  f.admission.reconcile = async input => { f.events.push(['reconcile', input]); return { status } }
  await assert.rejects(executeLearningExperimentInvocation(f))
}
{
  const controller = new AbortController()
  const f = fixture({ request: { ...request, signal: controller.signal } })
  f.provider.generateJson = async input => {
    f.events.push(['provider', input])
    controller.abort(new DOMException('cancelled before result acceptance', 'AbortError'))
    return structuredClone(result)
  }
  await assert.rejects(executeLearningExperimentInvocation(f), { name: 'AbortError' })
}
{
  const f = fixture({ request: { ...request, maxOutputTokens: 3 } })
  await assert.rejects(executeLearningExperimentInvocation(f))
  assert.equal(count(f, 'provider'), 1)
}
{
  const f = fixture({ request: { ...request, input: { value: 'original' } } })
  f.quote.quote = async input => {
    f.events.push(['quote', input])
    f.scope.projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    f.scope.agentKey = 'support_agent'
    f.request.input.value = 'changed'
    f.request.maxOutputTokens = 1
    return { ...quoteValue }
  }
  await executeLearningExperimentInvocation(f)
  assert.equal(entry(f, 'reserve').projectId, scope.projectId)
  assert.equal(entry(f, 'reserve').agentKey, scope.agentKey)
  assert.equal(entry(f, 'provider').input.value, 'original')
  assert.equal(entry(f, 'provider').maxOutputTokens, 8)
}
{
  const f = fixture()
  const retainedQuote = { ...quoteValue }
  f.quote.quote = async () => retainedQuote
  const reserve = f.admission.reserve
  f.admission.reserve = async input => {
    const reservation = await reserve(input)
    retainedQuote.maxOutputTokens = 1
    retainedQuote.totalTokensUpperBound = 1
    retainedQuote.modelName = 'changed-after-quote'
    return reservation
  }
  await executeLearningExperimentInvocation(f)
  assert.equal(entry(f, 'provider').maxOutputTokens, 8)
}
function learningContext() {
  const { projectId, ...learningExperiment } = scope
  return { projectId, task: 'general', executionCorrelationId: scope.runId, learningExperiment }
}
function governedRouter(f, governed = true) {
  return { async route() { return {
    source: governed ? 'GOVERNED_REGISTRY' : 'ENVIRONMENT_FALLBACK',
    reason: governed ? 'ACTIVE_GOVERNED_CANDIDATE_SELECTED' : 'NO_ACTIVE_GOVERNED_CANDIDATES',
    provider: f.provider,
    evidence: governed ? { modelName: 'synthetic-model', aiSystemId: 'system', aiSystemVersionId: 'version' } : null,
  } } }
}
function telemetry(f) { return { async record(input) { f.events.push(['telemetry', input]) } } }
{
  const f = fixture()
  const router = new ObservableIntelligentRouter(governedRouter(f), telemetry(f), undefined, undefined, f.costAccounting)
  const routed = await router.route(learningContext())
  await assert.rejects(routed.provider.generateJson(request))
  assert.equal(count(f, 'provider'), 0)
  assert.equal(count(f, 'reserve'), 0)
}
{
  const f = fixture()
  const router = new ObservableIntelligentRouter(governedRouter(f, false), telemetry(f), undefined, undefined, f.costAccounting, { admission: f.admission, quote: f.quote })
  const routed = await router.route(learningContext())
  await assert.rejects(routed.provider.generateJson(request))
  assert.equal(count(f, 'provider'), 0)
  assert.equal(count(f, 'reserve'), 0)
}
{
  const f = fixture()
  const budgetPolicy = { async resolveProjectBudget() { return { policyId: 'output-policy', maxOutputTokens: 5, maxRequestsPerMinute: null, maxConcurrentExecutions: null } } }
  const router = new ObservableIntelligentRouter(governedRouter(f), telemetry(f), budgetPolicy, undefined, f.costAccounting, { admission: f.admission, quote: f.quote })
  const context = learningContext()
  const routed = await router.route(context)
  // The wrapped provider retains the server scope resolved at routing time.
  context.learningExperiment.runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  await routed.provider.generateJson({ ...request, maxOutputTokens: 7 })
  assert.equal(count(f, 'provider'), 1)
  assert.equal(count(f, 'reserve'), 1)
  assert.equal(count(f, 'accounting'), 1)
  assert.equal(count(f, 'reconcile'), 1)
  assert.equal(entry(f, 'provider').maxOutputTokens, 5)
  assert.equal(entry(f, 'reserve').runId, scope.runId)
  const invocation = f.events.find(([kind, data]) => kind === 'telemetry' && data.eventType === 'MODEL_INVOCATION')[1]
  assert.equal(invocation.status, 'SUCCESS')
  assert.equal(invocation.attributes.invocation_id, entry(f, 'accounting').invocationId)
}
{
  const f = fixture({ quote: { async quote() { return null } } })
  const router = new ObservableIntelligentRouter(governedRouter(f), telemetry(f), undefined, undefined, f.costAccounting, { admission: f.admission, quote: f.quote })
  const routed = await router.route(learningContext())
  await assert.rejects(routed.provider.generateJson(request))
  assert.equal(count(f, 'provider'), 0)
  assert.equal(count(f, 'reserve'), 0)
}
{
  const f = fixture()
  const router = new ObservableIntelligentRouter(governedRouter(f), telemetry(f))
  const routed = await router.route({ projectId: scope.projectId, task: 'general' })
  await routed.provider.generateJson(request)
  assert.equal(count(f, 'provider'), 1)
  assert.equal(count(f, 'reserve'), 0)
}
{
  let primaryCalls = 0
  let fallbackCalls = 0
  const failure = new TypeError('synthetic network failure')
  const profile = { projectId: scope.projectId, aiSystemVersionId: 'primary', fallbackGroup: 'group', productionEligible: true, automaticFallbackEnabled: true, dataResidencyRegions: ['EU'], securityTier: 1, governanceTier: 1 }
  const primary = { provider: { id: 'synthetic', async generateJson() { primaryCalls++; throw failure } }, modelName: 'synthetic-model', aiSystemVersionId: 'primary', profile }
  const fallback = { provider: { id: 'fallback', async generateJson() { fallbackCalls++; return { ...result, provider: 'fallback' } } }, modelName: 'synthetic-model', aiSystemVersionId: 'fallback', profile: { ...profile, aiSystemVersionId: 'fallback' } }
  const provider = new ResilientReasoningProvider(primary, [fallback])
  await assert.rejects(provider.generateJson({ ...request, allowFallback: false }), error => error === failure)
  assert.equal(primaryCalls, 1)
  assert.equal(fallbackCalls, 0)
  const ordinary = await provider.generateJson(request)
  assert.equal(ordinary.resilience.fallbackApplied, true)
  assert.equal(fallbackCalls, 1)
  // The actual runtime gate disables the real resilience adapter too.
  const f = fixture({ provider })
  await assert.rejects(executeLearningExperimentInvocation(f), error => error === failure)
  assert.equal(fallbackCalls, 1)
  assert.equal(entry(f, 'reconcile').accountingComplete, false)
}
console.log('Learning experiment runtime budget behavior passed (24 agent/mode combinations and failure paths)')
