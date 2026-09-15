import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/ai/governed-shadow-evaluation.ts', 'utf8')
const tests = fs.readFileSync('scripts/test-governed-shadow-evaluation.mjs', 'utf8')

for (const required of [
  "GOVERNED_SHADOW_EVALUATION_VERSION = 'governed-shadow-evaluation-v1'",
  "input.readiness.status !== 'READY'",
  'verifiedAt > trainingCutoff && verifiedAt <= evaluationEnd',
  'Shadow predictions must cover every governed evaluation case exactly once',
  'prediction case is outside governed evaluation partition',
  'predictedEffectiveProbability must be between 0 and 1',
  'predictiveProbabilityExposed: false',
  'rowLevelPredictionsExposed: false',
  'shadowDecisionAuthority: false',
  'executionAuthority: false',
  'promotionAuthority: false',
  'historicalOutcomeOnly: true',
]) {
  assert.ok(source.includes(required), `Shadow evaluation adversarial boundary missing: ${required}`)
}

const resultContract = source.split('export type GovernedShadowEvaluationResult = {')[1]?.split('\n}\n\nfunction requiredText')[0] ?? ''
assert.ok(resultContract, 'Shadow evaluation result contract must exist.')
assert.ok(!resultContract.includes('predictions:'), 'Shadow evaluation result must not expose row-level prediction arrays.')
assert.ok(!resultContract.includes('predictedEffectiveProbability'), 'Shadow evaluation result must not expose row-level probabilities.')
assert.ok(!source.includes('executeAction'), 'Shadow evaluation must not gain execution authority.')
assert.ok(!source.includes('authorize('), 'Shadow evaluation core must not silently mint authorization.')
assert.ok(!source.includes('Math.random'), 'Shadow evaluation must remain deterministic.')

for (const required of [
  'NOT_READY backtesting fails closed',
  'project boundary mismatch fails closed',
  'missing evaluation prediction fails closed',
  'duplicate evaluation prediction fails closed',
  'training or out-of-window case cannot enter shadow evaluation',
  'invalid probability fails closed',
  'readiness cannot smuggle an out-of-window evaluation case',
]) {
  assert.ok(tests.includes(required), `Shadow evaluation negative test missing: ${required}`)
}

console.log('Governed shadow evaluation adversarial audit passed.')
