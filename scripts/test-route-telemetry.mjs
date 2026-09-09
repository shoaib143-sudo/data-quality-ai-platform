import assert from 'node:assert/strict'
import { ObservableIntelligentRouter } from '../lib/ai/observable-intelligent-router.ts'
import { ReasoningProviderHttpError } from '../lib/ai/reasoning-provider.ts'

const context = {
  projectId: 'project-1',
  task: 'governance_reasoning',
  sensitivity: 'CONFIDENTIAL',
  risk: 'HIGH',
  traceContext: {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    traceFlags: '01',
  },
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
    { async resolveProjectBudget(projectId) { assert.equal(projectId, 'project-1'); return { policyId: 'budget-policy-1', maxOutputTokens: 256 } } },
  )
  const routed = await router.route(context)
  const result = await routed.provider.generateJson({
    task: 'governance_reasoning', system: 'evidence only', input: { observed: true }, maxOutputTokens: 512,
  })
  assert.deepEqual(result.result, { answer: 'grounded' })
  assert.equal(observedRequest.maxOutputTokens, 256, 'canonical project ceiling must cap the provider request')
  assert.equal(events[1].eventType, 'MODEL_INVOCATION')
  assert.equal(events[1].status, 'SUCCESS')
  assert.equal(events[1].attributes.requested_max_output_tokens, 512)
  assert.equal(events[1].attributes.governance_max_output_tokens, 256)
  assert.equal(events[1].attributes.effective_max_output_tokens, 256)
  assert.equal(events[1].attributes.resource_budget_policy_id, 'budget-policy-1')
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
    { async resolveProjectBudget() { return { policyId: 'budget-policy-1', maxOutputTokens: 512 } } },
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
    { async resolveProjectBudget() { return { policyId: 'budget-policy-2', maxOutputTokens: 300 } } },
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
  const events = []
  const providerError = new ReasoningProviderHttpError(429, 'req-rate-limit-456')
  const decision = governedDecision(async () => { throw providerError })
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } }, telemetry(events),
    { async resolveProjectBudget() { return { policyId: 'budget-policy-3', maxOutputTokens: 200 } } },
  )
  const routed = await router.route(context)
  await assert.rejects(
    routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {}, maxOutputTokens: 256 }),
    (error) => error === providerError,
  )
  assert.equal(events[1].status, 'ERROR')
  assert.equal(events[1].attributes.requested_max_output_tokens, 256)
  assert.equal(events[1].attributes.governance_max_output_tokens, 200)
  assert.equal(events[1].attributes.effective_max_output_tokens, 200)
  assert.equal(events[1].attributes.provider_http_status, 429)
  assert.equal(events[1].attributes.provider_request_id, 'req-rate-limit-456')
  assert.equal(JSON.stringify(events[1]).includes(providerError.message), false)
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
}

console.log('ADR-006 governed project output budget enforcement and sanitized invocation telemetry behavior passed.')
