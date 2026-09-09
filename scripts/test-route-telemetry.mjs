import assert from 'node:assert/strict'
import { ObservableIntelligentRouter } from '../lib/ai/observable-intelligent-router.ts'

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

{
  const events = []
  const decision = {
    source: 'GOVERNED_REGISTRY',
    reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED',
    provider: {
      id: 'openai_compatible',
      async generateJson() {
        return {
          provider: 'openai_compatible',
          model: 'model-a',
          result: { answer: 'grounded' },
          latencyMs: 42,
          usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
          providerRequestId: 'req-123',
        }
      },
    },
    evidence: {
      aiSystemId: 'system-a',
      aiSystemVersionId: 'version-a',
      systemKey: 'int-model-a',
      provider: 'openai_compatible',
      modelName: 'model-a',
      evaluationAverageScore: 0.97,
      evaluationScoredCount: 12,
      evaluationPassRate: 1,
      routingPolicyId: 'policy-1',
      routingPolicyReason: 'POLICY_ALLOWED',
    },
  }
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } },
    { id: 'telemetry', async record(event) { events.push(event); return { eventId: `evt-${events.length}`, persisted: true } } },
  )
  const routed = await router.route(context)
  assert.notEqual(routed.provider, decision.provider, 'selected provider should be observability-wrapped after routing')
  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, 'AI_ROUTE_DECISION')
  assert.equal(events[0].operation, 'model_route')
  assert.equal(events[0].status, 'SUCCESS')
  assert.equal(events[0].providerId, 'openai_compatible')
  assert.equal(events[0].modelName, 'model-a')
  assert.equal(events[0].aiSystemId, 'system-a')
  assert.deepEqual(events[0].traceContext, context.traceContext)
  assert.equal(events[0].attributes.route_source, 'GOVERNED_REGISTRY')
  assert.equal(events[0].attributes.routing_policy_id, 'policy-1')
  assert.equal(events[0].attributes.evaluation_average_score, 0.97)

  const modelResult = await routed.provider.generateJson({
    task: 'governance_reasoning',
    system: 'evidence only',
    input: { observed: true },
  })
  assert.deepEqual(modelResult.result, { answer: 'grounded' })
  assert.equal(events.length, 2)
  assert.equal(events[1].eventType, 'MODEL_INVOCATION')
  assert.equal(events[1].operation, 'governance_reasoning')
  assert.equal(events[1].status, 'SUCCESS')
  assert.equal(events[1].providerId, 'openai_compatible')
  assert.equal(events[1].modelName, 'model-a')
  assert.equal(events[1].aiSystemId, 'system-a')
  assert.equal(events[1].aiSystemVersionId, 'version-a')
  assert.equal(events[1].inputTokens, 120)
  assert.equal(events[1].outputTokens, 30)
  assert.equal(events[1].latencyMs, 42)
  assert.equal(events[1].attributes.total_tokens, 150)
  assert.equal(events[1].attributes.provider_request_id, 'req-123')
  assert.deepEqual(events[1].traceContext, context.traceContext)
  for (const event of events) {
    assert.equal(Object.hasOwn(event.attributes, 'prompt'), false)
    assert.equal(Object.hasOwn(event.attributes, 'completion'), false)
    assert.equal(Object.hasOwn(event.attributes, 'reasoning'), false)
    assert.equal(Object.hasOwn(event.attributes, 'input'), false)
    assert.equal(Object.hasOwn(event.attributes, 'result'), false)
  }
}

{
  const events = []
  const decision = { source: 'UNAVAILABLE', reason: 'ROUTING_POLICY_UNAVAILABLE', provider: null, evidence: null }
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } },
    { id: 'telemetry', async record(event) { events.push(event); return { eventId: 'evt-unavailable', persisted: true } } },
  )
  const result = await router.route(context)
  assert.equal(result, decision)
  assert.equal(events[0].status, 'ERROR')
  assert.equal(events[0].attributes.route_reason, 'ROUTING_POLICY_UNAVAILABLE')
  assert.equal(events[0].providerId, null)
  assert.deepEqual(events[0].traceContext, context.traceContext)
}

{
  const providerError = new TypeError('provider failed')
  const events = []
  const router = new ObservableIntelligentRouter(
    {
      async route() {
        return {
          source: 'ENVIRONMENT_FALLBACK',
          reason: 'NO_ACTIVE_GOVERNED_CANDIDATES',
          provider: { id: 'openai_compatible', async generateJson() { throw providerError } },
          evidence: null,
        }
      },
    },
    { id: 'telemetry', async record(event) { events.push(event); return { eventId: `evt-${events.length}`, persisted: true } } },
  )
  const routed = await router.route(context)
  await assert.rejects(
    routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {} }),
    (error) => error === providerError,
  )
  assert.equal(events.length, 2)
  assert.equal(events[1].eventType, 'MODEL_INVOCATION')
  assert.equal(events[1].status, 'ERROR')
  assert.equal(events[1].attributes.error_name, 'TypeError')
  assert.equal(Object.hasOwn(events[1].attributes, 'error_message'), false)
}

{
  const decision = {
    source: 'GOVERNED_REGISTRY',
    reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED',
    provider: {
      id: 'openai_compatible',
      async generateJson() {
        return { provider: 'openai_compatible', model: 'model-a', result: { ok: true }, latencyMs: 5 }
      },
    },
    evidence: {
      aiSystemId: 'system-a', aiSystemVersionId: 'version-a', systemKey: 'int-model-a', provider: 'openai_compatible', modelName: 'model-a',
      evaluationAverageScore: null, evaluationScoredCount: 0, evaluationPassRate: null, routingPolicyId: null, routingPolicyReason: 'POLICY_ALLOWED',
    },
  }
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } },
    { id: 'telemetry', async record() { throw new Error('telemetry unavailable') } },
  )
  const routed = await router.route(context)
  const result = await routed.provider.generateJson({ task: 'governance_reasoning', system: 'safe', input: {} })
  assert.deepEqual(result.result, { ok: true }, 'telemetry failure must not alter a completed model result')
}

{
  const decision = { source: 'UNAVAILABLE', reason: 'REGISTRY_UNAVAILABLE', provider: null, evidence: null }
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } },
    { id: 'telemetry', async record() { throw new Error('telemetry unavailable') } },
  )
  const result = await router.route(context)
  assert.equal(result, decision, 'telemetry failure must not alter a fail-closed route decision')
}

console.log('ADR-006 Intelligent Router route and model invocation telemetry behavior passed.')
