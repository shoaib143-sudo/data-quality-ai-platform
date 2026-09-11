import assert from 'node:assert/strict'
import { EvaluationAwareIntelligentRouter } from '../lib/ai/intelligent-router.ts'
import { evaluateModelAgainstRoutingPolicy } from '../lib/ai/routing-policy.ts'

function provider(id) { return { id, async generateJson() { throw new Error('not invoked') } } }
function noPolicy() { return { id: 'policy', async resolve() { return null } } }
function policy(overrides = {}) {
  return {
    id: 'policy-1', task: 'governance_reasoning', sensitivity: 'ANY', risk: 'ANY', enabled: true,
    allowedAiSystemIds: [], evaluationType: 'reasoning', evaluationMetricName: 'verified_quality',
    evaluationMaxAgeSeconds: 86400, minEvaluationScore: null, minScoredCount: 2,
    allowEnvironmentFallback: false, ...overrides,
  }
}
function metric({ score, count = 10, metricName = 'verified_quality', evaluationType = 'reasoning', capability = 'governance_reasoning', observedAt = '2026-09-11T00:00:00.000Z', ids = ['result-1'] }) {
  return {
    evaluationType, capability, metricName, sampleCount: count, scoredCount: count,
    passCount: count, failCount: 0, averageScore: score, evidenceResultIds: ids, lastObservedAt: observedAt,
  }
}
function candidate({ key, model, score = null, scorecard, lifecycleStatus = 'ACTIVE' }) {
  return {
    aiSystemId: `system-${key}`, aiSystemVersionId: `version-${key}`, projectId: 'project-1', systemKey: key,
    systemName: key, systemType: 'MODEL', lifecycleStatus, versionNumber: 1, provider: 'openai_compatible',
    modelName: model, externalVersion: null, intendedUse: 'test', riskTier: 'LOW', dataCategories: [], humanOversight: 'required',
    configuration: {}, routingEligible: lifecycleStatus === 'ACTIVE', eligibilityReason: lifecycleStatus === 'ACTIVE' ? 'ACTIVE_HUMAN_APPROVED_CURRENT_VERSION' : `LIFECYCLE_${lifecycleStatus}`,
    evaluationScorecard: scorecard ?? (score === null ? [] : [metric({ score, ids: [`result-${key}`] })]),
  }
}
const context = { projectId: 'project-1', task: 'governance_reasoning', sensitivity: 'CONFIDENTIAL', risk: 'HIGH' }
const now = () => new Date('2026-09-11T12:00:00.000Z')
const evaluator = evaluateModelAgainstRoutingPolicy

{
  let fallbackCalls = 0
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [] } }, routingPolicy: noPolicy(), evaluatePolicy: evaluator,
    fallbackGateway: { reasoning() { fallbackCalls += 1; return provider('environment') } }, createProvider() { throw new Error('should not be called') }, now,
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'ENVIRONMENT_FALLBACK')
  assert.equal(decision.reason, 'NO_ACTIVE_GOVERNED_CANDIDATES')
  assert.equal(fallbackCalls, 1)
}

{
  const selected = []
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent(request) {
      assert.equal(request.projectId, 'project-1')
      assert.equal(request.capability, 'governance_reasoning')
      assert.equal(request.routingEligibleOnly, true)
      return [candidate({ key: 'model-b', model: 'b', score: 0.91 }), candidate({ key: 'model-a', model: 'a', score: 0.97 })]
    } },
    routingPolicy: { id: 'policy', async resolve() { return policy() } }, evaluatePolicy: evaluator,
    fallbackGateway: { reasoning() { throw new Error('fallback must not run') } },
    createProvider(selection) { selected.push(selection); return provider(`governed:${selection.model}`) }, now,
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'GOVERNED_REGISTRY')
  assert.equal(decision.evidence.systemKey, 'model-a')
  assert.equal(decision.evidence.aiSystemVersionId, 'version-model-a')
  assert.equal(decision.evidence.routingPolicyId, 'policy-1')
  assert.equal(decision.evidence.evaluationMode, 'CANONICAL_EVALUATION')
  assert.equal(decision.evidence.evaluationMetricName, 'verified_quality')
  assert.deepEqual(decision.evidence.evaluationEvidenceResultIds, ['result-model-a'])
  assert.equal(decision.evidence.evaluationLastObservedAt, '2026-09-11T00:00:00.000Z')
  assert.deepEqual(selected, [{ providerId: 'openai_compatible', model: 'a' }])
}

{
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [candidate({ key: 'model-b', model: 'b', score: 0.99 }), candidate({ key: 'model-a', model: 'a', score: null })] } },
    routingPolicy: { id: 'policy', async resolve() { return policy() } }, evaluatePolicy: evaluator,
    fallbackGateway: { reasoning() { throw new Error('fallback must not run') } }, createProvider(selection) { return provider(selection.model) }, now,
  })
  const decision = await router.route(context)
  assert.equal(decision.evidence.systemKey, 'model-a')
  assert.equal(decision.evidence.evaluationMode, 'DETERMINISTIC_FALLBACK')
  assert.equal(decision.evidence.evaluationFallbackReason, 'INCOMPLETE_COMPARABLE_EVIDENCE')
  assert.equal(decision.evidence.evaluationAverageScore, null)
  assert.deepEqual(decision.evidence.evaluationEvidenceResultIds, [])
}

{
  const stale = metric({ score: 0.99, observedAt: '2026-09-01T00:00:00.000Z', ids: ['stale-result'] })
  const fresh = metric({ score: 0.7, ids: ['fresh-result'] })
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [candidate({ key: 'model-b', model: 'b', scorecard: [stale] }), candidate({ key: 'model-a', model: 'a', scorecard: [fresh] })] } },
    routingPolicy: { id: 'policy', async resolve() { return policy({ evaluationMaxAgeSeconds: 86400 }) } }, evaluatePolicy: evaluator,
    fallbackGateway: { reasoning() { throw new Error('fallback must not run') } }, createProvider(selection) { return provider(selection.model) }, now,
  })
  const decision = await router.route(context)
  assert.equal(decision.evidence.systemKey, 'model-a')
  assert.equal(decision.evidence.evaluationMode, 'DETERMINISTIC_FALLBACK')
  assert.equal(decision.evidence.evaluationFallbackReason, 'STALE_EVALUATION_EVIDENCE')
}

{
  const wrongCapability = metric({ score: 0.99, capability: 'retrieval' })
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [candidate({ key: 'model-b', model: 'b', scorecard: [wrongCapability] }), candidate({ key: 'model-a', model: 'a', score: 0.7 })] } },
    routingPolicy: { id: 'policy', async resolve() { return policy() } }, evaluatePolicy: evaluator,
    fallbackGateway: { reasoning() { throw new Error('fallback must not run') } }, createProvider(selection) { return provider(selection.model) }, now,
  })
  const decision = await router.route(context)
  // Registry scorecards are project + version + capability scoped. A mismatched capability cannot create comparable evidence.
  assert.equal(decision.evidence.evaluationMode, 'DETERMINISTIC_FALLBACK')
}

{
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [candidate({ key: 'model-b', model: 'b', score: 0.99 }), candidate({ key: 'model-a', model: 'a', score: 0.2 })] } },
    routingPolicy: { id: 'policy', async resolve() { return policy({ allowedAiSystemIds: ['system-model-a'] }) } }, evaluatePolicy: evaluator,
    fallbackGateway: { reasoning() { throw new Error('fallback must not run') } }, createProvider(selection) { return provider(selection.model) }, now,
  })
  const decision = await router.route(context)
  assert.equal(decision.evidence.systemKey, 'model-a')
  assert.equal(decision.evidence.routingPolicyReason, 'POLICY_ALLOWED')
  assert.equal(decision.evidence.evaluationMode, 'DETERMINISTIC_FALLBACK')
}

{
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { return [candidate({ key: 'model-b', model: 'b', score: 0.99 }), candidate({ key: 'model-a', model: 'a', score: 0.1 })] } },
    routingPolicy: noPolicy(), evaluatePolicy: evaluator,
    fallbackGateway: { reasoning() { throw new Error('fallback must not run') } }, createProvider(selection) { return provider(selection.model) }, now,
  })
  const decision = await router.route(context)
  assert.equal(decision.evidence.systemKey, 'model-a')
  assert.equal(decision.evidence.evaluationMode, 'DETERMINISTIC_FALLBACK')
  assert.equal(decision.evidence.evaluationFallbackReason, 'NO_ACTIVE_POLICY')
}

{
  let registryCalls = 0
  const router = new EvaluationAwareIntelligentRouter({
    registry: { id: 'registry', async listCurrent() { registryCalls += 1; return [] } },
    routingPolicy: { id: 'policy', async resolve() { throw new Error('policy database unavailable') } }, evaluatePolicy: evaluator,
    fallbackGateway: { reasoning() { throw new Error('must fail closed') } }, createProvider() { throw new Error('must fail closed') }, now,
  })
  const decision = await router.route(context)
  assert.equal(decision.source, 'UNAVAILABLE')
  assert.equal(decision.reason, 'ROUTING_POLICY_UNAVAILABLE')
  assert.equal(registryCalls, 0)
}

console.log('ADR-006 canonical evidence-driven Intelligent Router behavior passed.')