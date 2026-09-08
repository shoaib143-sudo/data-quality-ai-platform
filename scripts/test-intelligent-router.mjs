import assert from 'node:assert/strict'
import { EvaluationAwareIntelligentRouter } from '../lib/ai/intelligent-router.ts'

function provider(id) {
  return { id, async generateJson() { throw new Error('not invoked') } }
}

function noPolicy() {
  return { id: 'policy', async resolve() { return null } }
}

function candidate({ key, model, score, scoredCount = 10 }) {
  return {
    aiSystemId: `system-${key}`,
    aiSystemVersionId: `version-${key}`,
    projectId: 'project-1',
    systemKey: key,
    systemName: key,
    systemType: 'MODEL',
    lifecycleStatus: 'ACTIVE',
    versionNumber: 1,
    provider: 'openai_compatible',
    modelName: model,
    externalVersion: null,
    intendedUse: 'test',
    riskTier: 'LOW',
    dataCategories: [],
    humanOversight: 'required',
    configuration: {},
    routingEligible: true,
    eligibilityReason: 'ACTIVE_HUMAN_APPROVED_CURRENT_VERSION',
    evaluationScorecard: score === null ? [] : [{
      evaluationType: 'reasoning', capability: 'governance_reasoning', metricName: 'verified_quality',
      sampleCount: scoredCount, scoredCount, passCount: scoredCount, failCount: 0, averageScore: score,
    }],
  }
}

const context = { projectId: 'project-1', task: 'governance_reasoning', sensitivity: 'CONFIDENTIAL', risk: 'HIGH' }

{
  let fallbackCalls = 0
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [] } },
    routingPolicy: noPolicy(),
    fallbackGateway: { reasoning() { fallbackCalls += 1; return provider('environment') } },
    createProvider() { throw new Error('should not be called') },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'ENVIRONMENT_FALLBACK')
  assert.equal(decision.reason, 'NO_ACTIVE_GOVERNED_CANDIDATES')
  assert.equal(fallbackCalls, 1)
}

{
  let registryCalls = 0
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { registryCalls += 1; return [] } },
    routingPolicy: { id: 'policy', async resolve() { throw new Error('policy database unavailable') } },
    fallbackGateway: { reasoning() { throw new Error('must fail closed') } },
    createProvider() { throw new Error('must fail closed') },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'UNAVAILABLE')
  assert.equal(decision.reason, 'ROUTING_POLICY_UNAVAILABLE')
  assert.equal(registryCalls, 0)
}

{
  let fallbackCalls = 0
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [] } },
    routingPolicy: { id: 'policy', async resolve() { return {
      id: 'policy-1', task: 'governance_reasoning', sensitivity: 'CONFIDENTIAL', risk: 'HIGH', enabled: true,
      allowedAiSystemIds: [], minEvaluationScore: null, minScoredCount: 0, allowEnvironmentFallback: false,
    } } },
    fallbackGateway: { reasoning() { fallbackCalls += 1; return provider('environment') } },
    createProvider() { throw new Error('should not be called') },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'UNAVAILABLE')
  assert.equal(decision.reason, 'POLICY_DENIED_ENVIRONMENT_FALLBACK')
  assert.equal(fallbackCalls, 0)
}

{
  const selected = []
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent(request) {
      assert.equal(request.routingEligibleOnly, true)
      return [
        candidate({ key: 'int-model-b', model: 'model-b', score: 0.91, scoredCount: 30 }),
        candidate({ key: 'int-model-a', model: 'model-a', score: 0.97, scoredCount: 12 }),
      ]
    } },
    routingPolicy: { id: 'policy', async resolve() { return {
      id: 'policy-2', task: 'governance_reasoning', sensitivity: 'ANY', risk: 'ANY', enabled: true,
      allowedAiSystemIds: ['system-int-model-a'], minEvaluationScore: 0.95, minScoredCount: 10, allowEnvironmentFallback: false,
    } } },
    fallbackGateway: { reasoning() { throw new Error('fallback must not run') } },
    createProvider(selection) { selected.push(selection); return provider(`governed:${selection.model}`) },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'GOVERNED_REGISTRY')
  assert.equal(decision.evidence.systemKey, 'int-model-a')
  assert.equal(decision.evidence.routingPolicyId, 'policy-2')
  assert.equal(decision.evidence.routingPolicyReason, 'POLICY_ALLOWED')
  assert.ok(Math.abs(decision.evidence.evaluationAverageScore - 0.97) < 1e-12)
  assert.deepEqual(selected, [{ providerId: 'openai_compatible', model: 'model-a' }])
}

{
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [candidate({ key: 'int-model-a', model: 'model-a', score: 0.80, scoredCount: 5 })] } },
    routingPolicy: { id: 'policy', async resolve() { return {
      id: 'policy-3', task: 'governance_reasoning', sensitivity: 'ANY', risk: 'ANY', enabled: true,
      allowedAiSystemIds: [], minEvaluationScore: 0.9, minScoredCount: 10, allowEnvironmentFallback: false,
    } } },
    fallbackGateway: { reasoning() { throw new Error('fallback must not run') } },
    createProvider() { throw new Error('filtered model must not execute') },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'UNAVAILABLE')
  assert.equal(decision.reason, 'NO_GOVERNED_CANDIDATES_SATISFY_POLICY')
}

{
  let fallbackCalls = 0
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { throw new Error('db unavailable') } },
    routingPolicy: noPolicy(),
    fallbackGateway: { reasoning() { fallbackCalls += 1; return provider('environment') } },
    createProvider() { throw new Error('should not be called') },
  })
  const decision = await router.route(context)
  assert.equal(decision.reason, 'REGISTRY_UNAVAILABLE')
  assert.equal(fallbackCalls, 0)
}

console.log('ADR-006 Intelligent Router policy-aware behavior passed.')
