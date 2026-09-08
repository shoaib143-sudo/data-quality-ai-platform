import assert from 'node:assert/strict'
import { EvaluationAwareIntelligentRouter } from '../lib/ai/intelligent-router.ts'

function provider(id) {
  return { id, async generateJson() { throw new Error('not invoked') } }
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
      evaluationType: 'reasoning',
      capability: 'governance_reasoning',
      metricName: 'verified_quality',
      sampleCount: scoredCount,
      scoredCount,
      passCount: scoredCount,
      failCount: 0,
      averageScore: score,
    }],
  }
}

const context = {
  projectId: 'project-1',
  task: 'governance_reasoning',
  sensitivity: 'CONFIDENTIAL',
  risk: 'HIGH',
}

{
  let fallbackCalls = 0
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [] } },
    fallbackGateway: { reasoning() { fallbackCalls += 1; return provider('environment') } },
    createProvider() { throw new Error('should not be called') },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'ENVIRONMENT_FALLBACK')
  assert.equal(decision.reason, 'NO_ACTIVE_GOVERNED_CANDIDATES')
  assert.equal(decision.provider.id, 'environment')
  assert.equal(fallbackCalls, 1)
}

{
  let fallbackCalls = 0
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { throw new Error('db unavailable') } },
    fallbackGateway: { reasoning() { fallbackCalls += 1; return provider('environment') } },
    createProvider() { throw new Error('should not be called') },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'UNAVAILABLE')
  assert.equal(decision.reason, 'REGISTRY_UNAVAILABLE')
  assert.equal(fallbackCalls, 0, 'registry outage must not bypass governance via environment fallback')
}

{
  const selected = []
  const router = new EvaluationAwareIntelligentRouter({
    registry: {
      id: 'registry',
      async listCurrent(request) {
        assert.equal(request.routingEligibleOnly, true)
        assert.equal(request.capability, 'governance_reasoning')
        return [
          candidate({ key: 'int-model-b', model: 'model-b', score: 0.91, scoredCount: 30 }),
          candidate({ key: 'int-model-a', model: 'model-a', score: 0.97, scoredCount: 12 }),
        ]
      },
    },
    fallbackGateway: { reasoning() { throw new Error('fallback must not run when governed candidates exist') } },
    createProvider(selection) {
      selected.push(selection)
      return provider(`governed:${selection.model}`)
    },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'GOVERNED_REGISTRY')
  assert.equal(decision.evidence.systemKey, 'int-model-a')
  assert.ok(Math.abs(decision.evidence.evaluationAverageScore - 0.97) < 1e-12)
  assert.equal(decision.evidence.evaluationScoredCount, 12)
  assert.deepEqual(selected, [{ providerId: 'openai_compatible', model: 'model-a' }])
}

{
  let fallbackCalls = 0
  const router = new EvaluationAwareIntelligentRouter({
    registry: {
      id: 'registry',
      async listCurrent() {
        return [candidate({ key: 'int-approved-but-unsupported', model: 'unsupported-model', score: 1 })]
      },
    },
    fallbackGateway: { reasoning() { fallbackCalls += 1; return provider('environment') } },
    createProvider() { throw new Error('unsupported governed provider') },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'UNAVAILABLE')
  assert.equal(decision.reason, 'GOVERNED_CANDIDATES_NOT_EXECUTABLE')
  assert.equal(fallbackCalls, 0, 'ACTIVE governed authority must not be bypassed by environment fallback')
}

{
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [] } },
    fallbackGateway: { reasoning() { return null } },
    createProvider() { throw new Error('should not be called') },
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'UNAVAILABLE')
  assert.equal(decision.reason, 'NO_REASONING_PROVIDER_AVAILABLE')
}

console.log('ADR-006 Intelligent Router behavior passed.')
