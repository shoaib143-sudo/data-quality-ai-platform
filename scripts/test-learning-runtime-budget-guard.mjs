import assert from 'node:assert/strict'
import fs from 'node:fs'
import './lib/register-typescript-resolution.mjs'

const { ObservableIntelligentRouter } = await import('../lib/ai/observable-intelligent-router.ts')
const { EvaluationAwareIntelligentRouter } = await import('../lib/ai/intelligent-router.ts')

const UUIDS = {
  policy: '11111111-1111-4111-8111-111111111111',
  candidate: '22222222-2222-4222-8222-222222222222',
  correlation: '33333333-3333-4333-8333-333333333333',
  reservation: '44444444-4444-4444-8444-444444444444',
  pricing: '55555555-5555-4555-8555-555555555555',
  event: '66666666-6666-4666-8666-666666666666',
}

const telemetry = { async record() {} }
const context = {
  projectId: '77777777-7777-4777-8777-777777777777',
  task: 'general',
  executionCorrelationId: UUIDS.correlation,
  learningEvaluationRuntime: { policyId: UUIDS.policy, candidateId: UUIDS.candidate, variant: 'CANDIDATE' },
}

function governedDecision(generateJson) {
  return {
    source: 'GOVERNED_REGISTRY',
    reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED',
    provider: { id: 'openai_compatible', generateJson },
    evidence: {
      aiSystemId: 'system',
      aiSystemVersionId: 'version',
      systemKey: 'system-key',
      provider: 'openai_compatible',
      modelName: 'fixture-model',
      routingPolicyId: null,
      routingPolicyReason: 'TEST',
    },
  }
}

function runtimeProvider(status='RECONCILED', options={}) {
  const reservations = []
  const events = []
  return {
    reservations,
    events,
    provider: {
      async reserve(input) {
        reservations.push(input)
        if (options.reserveError) throw options.reserveError
        return {
          reservationId: UUIDS.reservation,
          pricingVersionId: UUIDS.pricing,
          reservedCostUsd: 1,
          reservedTokens: options.reservedTokens ?? 40,
          latencyMsBudget: options.latencyMsBudget ?? 1000,
        }
      },
      async recordEvent(input) {
        events.push(input)
        return { eventId: UUIDS.event, status, eventSequence: 1 }
      },
    },
  }
}

function accounting(overrides={}) {
  return {
    async recordInvocation(input) {
      return {
        id: '88888888-8888-4888-8888-888888888888',
        invocationId: input.invocationId,
        projectId: input.projectId,
        executionCorrelationId: input.executionCorrelationId ?? null,
        providerRequestId: input.providerRequestId ?? null,
        providerId: input.providerId,
        modelName: input.modelName,
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
        pricingVersionId: UUIDS.pricing,
        currency: 'USD',
        inputCost: '0.1',
        outputCost: '0.1',
        totalCost: '0.2',
        accountingStatus: 'PRICED',
        observedAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        ...overrides,
      }
    },
  }
}

{
  const runtime = runtimeProvider()
  let providerCalls = 0
  const router = new ObservableIntelligentRouter(
    { async route() { return governedDecision(async request => {
      providerCalls += 1
      assert.equal(request.maxOutputTokens, 40)
      assert.ok(request.signal)
      return { provider: 'openai_compatible', model: 'fixture-model', result: {}, latencyMs: 25, usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } }
    }) } },
    telemetry, undefined, undefined, accounting(), runtime.provider,
  )
  const decision = await router.route(context)
  const result = await decision.provider.generateJson({ task: 'general', system: 'test', input: {}, maxOutputTokens: 100 })
  assert.equal(result.model, 'fixture-model')
  assert.equal(providerCalls, 1)
  assert.equal(runtime.reservations.length, 1)
  assert.equal(runtime.events.length, 1)
  assert.equal(runtime.events[0].accountingComplete, true)
  assert.equal(runtime.events[0].actualTokens, 20)
}

{
  const runtime = runtimeProvider('UNRESOLVED')
  let providerCalls = 0
  const router = new ObservableIntelligentRouter(
    { async route() { return governedDecision(async () => {
      providerCalls += 1
      return { provider: 'openai_compatible', model: 'fixture-model', result: {}, latencyMs: 10, usage: { totalTokens: 5 } }
    }) } },
    telemetry, undefined, undefined, accounting({ accountingStatus: 'PRICE_UNAVAILABLE', pricingVersionId: null, currency: null, totalCost: null }), runtime.provider,
  )
  const decision = await router.route(context)
  await assert.rejects(decision.provider.generateJson({ task: 'general', system: 'test', input: {} }), { name: 'LearningEvaluationAccountingIncompleteError' })
  assert.equal(providerCalls, 1)
  assert.equal(runtime.events[0].accountingComplete, false)
}

{
  const runtime = runtimeProvider('EXCEEDED')
  const router = new ObservableIntelligentRouter(
    { async route() { return governedDecision(async () => ({ provider: 'openai_compatible', model: 'fixture-model', result: {}, latencyMs: 1500, usage: { totalTokens: 50 } })) } },
    telemetry, undefined, undefined, accounting({ totalTokens: 50, totalCost: '2' }), runtime.provider,
  )
  const decision = await router.route(context)
  await assert.rejects(decision.provider.generateJson({ task: 'general', system: 'test', input: {} }), { name: 'LearningEvaluationRuntimeBudgetExceededError' })
}

{
  const runtime = runtimeProvider('UNRESOLVED', { latencyMsBudget: 5 })
  const router = new ObservableIntelligentRouter(
    { async route() { return governedDecision(async request => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    })) } },
    telemetry, undefined, undefined, accounting(), runtime.provider,
  )
  const decision = await router.route(context)
  await assert.rejects(decision.provider.generateJson({ task: 'general', system: 'test', input: {} }), { name: 'TimeoutError' })
  assert.equal(runtime.events.at(-1).accountingComplete, false)
}

{
  let providerCalls = 0
  const runtime = runtimeProvider('RECONCILED', { reserveError: new Error('budget exhausted') })
  const router = new ObservableIntelligentRouter(
    { async route() { return governedDecision(async () => { providerCalls += 1 }) } },
    telemetry, undefined, undefined, accounting(), runtime.provider,
  )
  const decision = await router.route(context)
  await assert.rejects(decision.provider.generateJson({ task: 'general', system: 'test', input: {} }), /budget exhausted/)
  assert.equal(providerCalls, 0)
}

{
  let fallbackCalls = 0
  const primary = { id: 'primary', async generateJson() { throw new TypeError('network') } }
  const fallback = { id: 'fallback', async generateJson() { fallbackCalls += 1; return { provider: 'fallback', model: 'fallback-model', result: {}, latencyMs: 1 } } }
  const profile = id => ({ projectId: context.projectId, aiSystemVersionId: id, fallbackGroup: 'g', productionEligible: true, automaticFallbackEnabled: true, dataResidencyRegions: ['EU'], securityTier: 1, governanceTier: 1 })
  const route = new EvaluationAwareIntelligentRouter({
    registry: { async listCurrent() { return [
      { aiSystemId: 's1', aiSystemVersionId: 'v1', systemKey: 'a', provider: 'primary', modelName: 'm1', evaluationScorecard: [] },
      { aiSystemId: 's2', aiSystemVersionId: 'v2', systemKey: 'b', provider: 'fallback', modelName: 'm2', evaluationScorecard: [] },
    ] } },
    routingPolicy: { async resolve() { return null } },
    evaluatePolicy: () => ({ allowed: true, reason: 'ALLOWED' }),
    fallbackGateway: { reasoning() { return null } },
    createProvider: ({ providerId }) => providerId === 'primary' ? primary : fallback,
    resiliencePolicy: { async resolveProfiles() { return new Map([['v1', profile('v1')], ['v2', profile('v2')]]) } },
  })
  const decision = await route.route(context)
  await assert.rejects(decision.provider.generateJson({ task: 'general', system: 'test', input: {} }), TypeError)
  assert.equal(fallbackCalls, 0, 'controlled evaluation must not drift to a fallback provider/model')
}

const source = fs.readFileSync(new URL('../lib/ai/observable-intelligent-router.ts', import.meta.url), 'utf8')
assert.match(source, /AbortSignal\.timeout\(learningReservation\.latencyMsBudget\)/)
assert.match(source, /CANONICAL_ACCOUNTING_INCOMPLETE_OR_PRICING_MISMATCH/)
console.log('Learning evaluation runtime reservations, deadlines, accounting stops, and fallback isolation passed')
