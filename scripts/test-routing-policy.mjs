import assert from 'node:assert/strict'
import { evaluateModelAgainstRoutingPolicy } from '../lib/ai/routing-policy.ts'

const model = { aiSystemId: 'system-a' }
const basePolicy = {
  id: 'policy-1', task: 'governance_reasoning', sensitivity: 'ANY', risk: 'ANY', enabled: true,
  allowedAiSystemIds: [], evaluationType: 'reasoning', evaluationMetricName: 'verified_quality',
  evaluationMaxAgeSeconds: 86400, minEvaluationScore: 0.9, minScoredCount: 20, allowEnvironmentFallback: false,
}

assert.deepEqual(evaluateModelAgainstRoutingPolicy(model, null), { allowed: true, reason: 'NO_ACTIVE_POLICY' })
assert.deepEqual(evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, enabled: false }), { allowed: true, reason: 'POLICY_DISABLED' })
assert.deepEqual(evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, allowedAiSystemIds: ['system-b'] }), { allowed: false, reason: 'AI_SYSTEM_NOT_ALLOWED' })
assert.deepEqual(evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, allowedAiSystemIds: ['system-a'] }), { allowed: true, reason: 'POLICY_ALLOWED' })

// Evaluation thresholds qualify a ranking signal. They never authorize or deny a model.
assert.deepEqual(evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, minEvaluationScore: 1, minScoredCount: 1000000 }), { allowed: true, reason: 'POLICY_ALLOWED' })

console.log('ADR-006 RoutingPolicy authorization boundary passed.')