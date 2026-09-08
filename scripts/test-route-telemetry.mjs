import assert from 'node:assert/strict'
import { ObservableIntelligentRouter } from '../lib/ai/observable-intelligent-router.ts'

const context = {
  projectId: 'project-1',
  task: 'governance_reasoning',
  sensitivity: 'CONFIDENTIAL',
  risk: 'HIGH',
}

{
  const events = []
  const decision = {
    source: 'GOVERNED_REGISTRY',
    reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED',
    provider: { id: 'openai_compatible', async generateJson() { throw new Error('not invoked') } },
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
    { id: 'telemetry', async record(event) { events.push(event); return { eventId: 'evt-1', persisted: true } } },
  )
  const result = await router.route(context)
  assert.equal(result, decision)
  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, 'AI_ROUTE_DECISION')
  assert.equal(events[0].operation, 'model_route')
  assert.equal(events[0].status, 'SUCCESS')
  assert.equal(events[0].providerId, 'openai_compatible')
  assert.equal(events[0].modelName, 'model-a')
  assert.equal(events[0].aiSystemId, 'system-a')
  assert.equal(events[0].attributes.route_source, 'GOVERNED_REGISTRY')
  assert.equal(events[0].attributes.routing_policy_id, 'policy-1')
  assert.equal(events[0].attributes.evaluation_average_score, 0.97)
  assert.equal(Object.hasOwn(events[0].attributes, 'prompt'), false)
  assert.equal(Object.hasOwn(events[0].attributes, 'reasoning'), false)
}

{
  const events = []
  const decision = { source: 'UNAVAILABLE', reason: 'ROUTING_POLICY_UNAVAILABLE', provider: null, evidence: null }
  const router = new ObservableIntelligentRouter(
    { async route() { return decision } },
    { id: 'telemetry', async record(event) { events.push(event); return { eventId: 'evt-2', persisted: true } } },
  )
  const result = await router.route(context)
  assert.equal(result, decision)
  assert.equal(events[0].status, 'ERROR')
  assert.equal(events[0].attributes.route_reason, 'ROUTING_POLICY_UNAVAILABLE')
  assert.equal(events[0].providerId, null)
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

console.log('ADR-006 Intelligent Router telemetry behavior passed.')
