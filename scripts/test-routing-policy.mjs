import assert from 'node:assert/strict'
import { evaluateModelAgainstRoutingPolicy } from '../lib/ai/routing-policy.ts'

const model = { aiSystemId: 'system-a' }
const basePolicy = {
  id: 'policy-1', task: 'governance_reasoning', sensitivity: 'ANY', risk: 'ANY', enabled: true,
  allowedAiSystemIds: [], minEvaluationScore: null, minScoredCount: 0, allowEnvironmentFallback: false,
}

assert.deepEqual(
  evaluateModelAgainstRoutingPolicy(model, null, { averageScore: null, scoredCount: 0 }),
  { allowed: true, reason: 'NO_ACTIVE_POLICY' },
)
assert.deepEqual(
  evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, enabled: false }, { averageScore: null, scoredCount: 0 }),
  { allowed: true, reason: 'POLICY_DISABLED' },
)
assert.deepEqual(
  evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, allowedAiSystemIds: ['system-b'] }, { averageScore: 1, scoredCount: 100 }),
  { allowed: false, reason: 'AI_SYSTEM_NOT_ALLOWED' },
)
assert.deepEqual(
  evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, minScoredCount: 10 }, { averageScore: 1, scoredCount: 9 }),
  { allowed: false, reason: 'INSUFFICIENT_EVALUATION_EVIDENCE' },
)
assert.deepEqual(
  evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, minEvaluationScore: 0.9 }, { averageScore: null, scoredCount: 20 }),
  { allowed: false, reason: 'INSUFFICIENT_EVALUATION_SCORE' },
)
assert.deepEqual(
  evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, minEvaluationScore: 0.9 }, { averageScore: 0.89, scoredCount: 20 }),
  { allowed: false, reason: 'INSUFFICIENT_EVALUATION_SCORE' },
)
assert.deepEqual(
  evaluateModelAgainstRoutingPolicy(model, { ...basePolicy, allowedAiSystemIds: ['system-a'], minEvaluationScore: 0.9, minScoredCount: 20 }, { averageScore: 0.95, scoredCount: 25 }),
  { allowed: true, reason: 'POLICY_ALLOWED' },
)

console.log('ADR-006 RoutingPolicy behavior passed.')
