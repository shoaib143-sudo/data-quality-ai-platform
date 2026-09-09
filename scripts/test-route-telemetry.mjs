import assert from 'node:assert/strict'
import { ObservableIntelligentRouter } from '../lib/ai/observable-intelligent-router.ts'
import { ReasoningProviderHttpError } from '../lib/ai/reasoning-provider.ts'

const executionCorrelationId = '11111111-1111-4111-8111-111111111111'
const context = {
  projectId: 'project-1',
  executionCorrelationId,
  task: 'governance_reasoning',
  sensitivity: 'CONFIDENTIAL',
  risk: 'HIGH',
  traceContext: {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    traceFlags: '01',
  },
}

function budget(overrides = {}) {
  return {
    policyId: 'budget-policy-1',
    maxOutputTokens: null,
    maxRequestsPerMinute: null,
    maxConcurrentExecutions: null,
    ...overrides,
  }
}

function governedDecision(generateJson) {
  return {
    source: 'GOVERNED_REGISTRY',
    reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED',
    provider: { id: 'openai_compatible', generateJson },
    evidence: {
      aiSystemId: 'system-a', aiSystemVersionId: 'version-a', systemKey: 'int-model-a',
      provider: 'openai_compatible', modelName: 'model-a', evaluationAverageScore: 0.97,
      evaluationScoredCount: 12, evaluationPassRate: 1, routingPolicyId: 'routing-policy-1',
      routingPolicyReason: 'POLICY_ALLOWED',
    },
  }
}

function telemetry(events) {
  return { id: 'telemetry', async record(event) { events.push(event); return { eventId: `evt-${events.length}`, persisted: true } } }
}

{
  const events = []
  let observedRequest = null
  let released = false
  const decision = governedDecision(async (request) => {
    observedRequest = request
    return {
      provider: 'openai_compatible', model: 'model-a', result: { answer: 'grounded' }, latencyMs: 42,
      usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 }, providerRequestId: 'req-123',
    }
  })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } },
    telemetry(events),
    { async resolveProjectBudget(projectId) { assert.equal(projectId, 'project-1'); return budget({ maxOutputTokens: 256, maxRequestsPerMinute: 10, maxConcurrentExecutions: 2 }) } },
    {
      async acquire(input) {
        assert.deepEqual(input, { projectId: 'project-1', policyVersionId: 'budget-policy-1', correlationId: executionCorrelationId })
        return { admitted: true, reason: 'ADMITTED', admissionId: 'admission-1', leaseId: 'lease-1', requestCountLastMinute: 3, activeConcurrency: 1, leaseExpiresAt: '2026-09-09T12:00:00Z' }
      },
      async release(input) {
        assert.deepEqual(input, { projectId: 'project-1', leaseId: 'lease-1', correlationId: executionCorrelationId })
        released = true
        return true
      },
    },
  )
  const routed = await router.route(context)
  const result = await routed.provider.generateJson({
    task: 'governance_reasoning', system: 'evidence only', input: { observed: true }, maxOutputTokens: 512,
  })
  assert.deepEqual(result.result, { answer: 'grounded' })
  assert.equal(observedRequest.maxOutputTokens, 256, 'canonical project ceiling must cap the provider request')
  assert.equal(released, true, 'concurrency lease must be released after provider completion')
  assert.equal(events[0].correlationId, executionCorrelationId)
  assert.equal(events[1].eventType, 'MODEL_INVOCATION')
  assert.equal(events[1].status, 'SUCCESS')
  assert.equal(events[1].correlationId, executionCorrelationId)
  assert.equal(events[1].attributes.requested_max_output_tokens, 512)
  assert.equal(events[1].attributes.governance_max_output_tokens, 256)
  assert.equal(events[1].attributes.effective_max_output_tokens, 256)
  assert.equal(events[1].attributes.resource_budget_policy_id, 'budget-policy-1')
  assert.equal(events[1].attributes.resource_budget_admission_reason, 'ADMITTED')
  assert.equal(events[1].attributes.resource_budget_admission_id, 'admission-1')
  assert.equal(events[1].attributes.resource_budget_lease_id, 'lease-1')
  assert.equal(events[1].attributes.resource_budget_request_count_last_minute, 3)
  assert.equal(events[1].attributes.resource_budget_active_concurrency, 1)
  assert.equal(events[1].attributes.routing_policy_id, 'routing-policy-1')
  assert.equal(events[1].attributes.provider_request_id, 'req-123')
  assert.equal(events[1].attributes.total_tokens, 150)
  for (const event of events) {
    for (const forbidden of ['prompt', 'completion', 'reasoning', 'input', 'result']) assert.equal(Object.hasOwn(event.attributes, forbidden), false)
  }
}

{
  let observedMax = null
  const decision = governedDecision(async (request) => {
    observedMax = request.maxOutputTokens
    return { provider: 'openai_compatible', model: 'model-a', result: { ok: true }, latencyMs: 1 }
  })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } },
    { id: 'telemetry', async record() { return { eventId: 'evt', persisted: true } } },
    { async resolveProjectBudget() { return budget({ maxOutputTokens: 512 }) } },
  )
  const routed = await router.route(context)
  await routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {}, maxOutputTokens: 128 })
  assert.equal(observedMax, 128, 'caller ceiling below governance ceiling must be preserved')
}

{
  let observedMax = null
  const events = []
  const decision = governedDecision(async (request) => {
    observedMax = request.maxOutputTokens
    return { provider: 'openai_compatible', model: 'model-a', result: { ok: true }, latencyMs: 1 }
  })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } }, telemetry(events),
    { async resolveProjectBudget() { return budget({ policyId: 'budget-policy-2', maxOutputTokens: 300 }) } },
  )
  const routed = await router.route(context)
  await routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {} })
  assert.equal(observedMax, 300, 'governance ceiling must apply when caller supplied no ceiling')
  assert.equal(events[1].attributes.requested_max_output_tokens, null)
  assert.equal(events[1].attributes.governance_max_output_tokens, 300)
  assert.equal(events[1].attributes.effective_max_output_tokens, 300)
}

{
  let providerCalled = false
  let admissionCalled = false
  const events = []
  const decision = governedDecision(async (request) => {
    providerCalled = true
    assert.equal(request.maxOutputTokens, undefined, 'rate-only policy must not invent an output ceiling')
    return { provider: 'openai_compatible', model: 'model-a', result: { ok: true }, latencyMs: 1 }
  })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } }, telemetry(events),
    { async resolveProjectBudget() { return budget({ policyId: 'rate-only-policy', maxRequestsPerMinute: 5 }) } },
    {
      async acquire(input) {
        admissionCalled = true
        assert.equal(input.policyVersionId, 'rate-only-policy')
        return { admitted: true, reason: 'ADMITTED', admissionId: 'admission-rate', leaseId: null, requestCountLastMinute: 1, activeConcurrency: 0, leaseExpiresAt: null }
      },
      async release() { throw new Error('no lease should be released') },
    },
  )
  const routed = await router.route(context)
  await routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {} })
  assert.equal(admissionCalled, true, 'rate-only project policy must still acquire atomic admission')
  assert.equal(providerCalled, true)
  assert.equal(events[1].attributes.resource_budget_policy_id, 'rate-only-policy')
  assert.equal(events[1].attributes.governance_max_output_tokens, null)
}

{
  let providerCalled = false
  const events = []
  const decision = governedDecision(async () => { providerCalled = true; return { provider: 'x', model: 'x', result: {}, latencyMs: 1 } })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } }, telemetry(events),
    { async resolveProjectBudget() { return budget({ maxRequestsPerMinute: 2 }) } },
    {
      async acquire() { return { admitted: false, reason: 'RATE_LIMIT', admissionId: null, leaseId: null, requestCountLastMinute: 2, activeConcurrency: 0, leaseExpiresAt: null } },
      async release() { return false },
    },
  )
  const routed = await router.route(context)
  await assert.rejects(
    routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {} }),
    (error) => error instanceof Error && error.name === 'ProjectBudgetAdmissionDeniedError',
  )
  assert.equal(providerCalled, false, 'rate-limit denial must block provider invocation')
  assert.equal(events[1].status, 'ERROR')
  assert.equal(events[1].attributes.resource_budget_admission_reason, 'RATE_LIMIT')
  assert.equal(events[1].attributes.error_name, 'ProjectBudgetAdmissionDeniedError')
}

{
  let providerCalled = false
  let releaseCalled = false
  const events = []
  const providerError = new ReasoningProviderHttpError(429, 'req-rate-limit-456')
  const decision = governedDecision(async () => { providerCalled = true; throw providerError })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } }, telemetry(events),
    { async resolveProjectBudget() { return budget({ policyId: 'budget-policy-3', maxOutputTokens: 200, maxConcurrentExecutions: 1 }) } },
    {
      async acquire() { return { admitted: true, reason: 'ADMITTED', admissionId: 'admission-fail', leaseId: 'lease-fail', requestCountLastMinute: 1, activeConcurrency: 1, leaseExpiresAt: '2026-09-09T12:00:00Z' } },
      async release() { releaseCalled = true; return true },
    },
  )
  const routed = await router.route(context)
  await assert.rejects(
    routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {}, maxOutputTokens: 256 }),
    (error) => error === providerError,
  )
  assert.equal(providerCalled, true)
  assert.equal(releaseCalled, true, 'lease must be released when provider invocation fails')
  assert.equal(events[1].status, 'ERROR')
  assert.equal(events[1].attributes.requested_max_output_tokens, 256)
  assert.equal(events[1].attributes.governance_max_output_tokens, 200)
  assert.equal(events[1].attributes.effective_max_output_tokens, 200)
  assert.equal(events[1].attributes.provider_http_status, 429)
  assert.equal(events[1].attributes.provider_request_id, 'req-rate-limit-456')
  assert.equal(JSON.stringify(events[1]).includes(providerError.message), false)
}

{
  let providerCalled = false
  const events = []
  const policyReadError = new Error('budget authority unavailable')
  const decision = governedDecision(async () => { providerCalled = true; return { provider: 'x', model: 'x', result: {}, latencyMs: 1 } })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } }, telemetry(events),
    { async resolveProjectBudget() { throw policyReadError } },
  )
  const routed = await router.route(context)
  await assert.rejects(
    routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {}, maxOutputTokens: 128 }),
    (error) => error === policyReadError,
  )
  assert.equal(providerCalled, false, 'provider invocation must fail closed when project budget authority cannot be resolved')
  assert.equal(events[1].status, 'ERROR')
  assert.equal(events[1].attributes.requested_max_output_tokens, 128)
  assert.equal(events[1].attributes.governance_max_output_tokens, null)
  assert.equal(Object.hasOwn(events[1].attributes, 'error_message'), false)
}

{
  let providerCalled = false
  const decision = governedDecision(async () => { providerCalled = true; return { provider: 'x', model: 'x', result: {}, latencyMs: 1 } })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } }, { id: 'telemetry', async record() { return { eventId: 'evt', persisted: true } } },
    { async resolveProjectBudget() { return budget({ maxConcurrentExecutions: 1 }) } },
    { async acquire() { throw new Error('must not reach admission without correlation') }, async release() { return false } },
  )
  const routed = await router.route({ ...context, executionCorrelationId: null })
  await assert.rejects(
    routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {} }),
    (error) => error instanceof Error && error.name === 'ProjectBudgetExecutionCorrelationError',
  )
  assert.equal(providerCalled, false, 'missing canonical execution correlation must fail before provider invocation')
}

{
  const events = []
  let observedMax = 'unset'
  const decision = governedDecision(async (request) => {
    observedMax = request.maxOutputTokens ?? null
    return { provider: 'openai_compatible', model: 'model-a', result: { ok: true }, latencyMs: 1 }
  })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } }, telemetry(events),
    { async resolveProjectBudget() { return null } },
  )
  const routed = await router.route(context)
  await routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {} })
  assert.equal(observedMax, null, 'absence of canonical project budget must not invent a ceiling')
  assert.equal(events[1].attributes.governance_max_output_tokens, null)
  assert.equal(events[1].attributes.resource_budget_policy_id, null)
  assert.equal(events[1].attributes.resource_budget_admission_reason, null)
}

console.log('ADR-006 governed project output budget and atomic admission enforcement behavior passed.')
