import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/ai/predictive-certification.ts', 'utf8')
const tests = fs.readFileSync('scripts/test-predictive-certification.mjs', 'utf8')

for (const required of [
  "PREDICTIVE_CERTIFICATION_VERSION = 'predictive-certification-v1'",
  "status: 'ELIGIBLE_FOR_REVIEW' | 'NOT_READY'",
  "'INSUFFICIENT_SHADOW_SAMPLE'",
  "'INSUFFICIENT_CLASS_COVERAGE'",
  "'BRIER_SCORE_TOO_HIGH'",
  "'ACCURACY_TOO_LOW'",
  'result.predictiveProbabilityExposed !== false',
  'result.rowLevelPredictionsExposed !== false',
  'result.shadowDecisionAuthority !== false',
  'result.executionAuthority !== false',
  'result.promotionAuthority !== false',
  'result.historicalOutcomeOnly !== true',
  'automaticPromotionAllowed: false',
  'humanReviewRequired: true',
  'productionPredictionEnabled: false',
]) {
  assert.ok(source.includes(required), `Predictive certification boundary missing: ${required}`)
}

assert.ok(!source.includes('executeAction'), 'Certification must not execute actions.')
assert.ok(!source.includes('authorize('), 'Certification must not mint authorization.')
assert.ok(!source.includes('Math.random'), 'Certification must remain deterministic.')
assert.ok(!source.includes('predictions:'), 'Certification result must not expose row-level predictions.')

for (const required of [
  'insufficient shadow sample fails closed',
  'single-sided or sparse class evidence fails closed',
  'poor calibration proxy fails closed',
  'poor accuracy fails closed',
  'cross-project shadow evidence is rejected',
  'authoritative or exposed shadow evidence is rejected',
  'invalid policy thresholds fail closed',
]) {
  assert.ok(tests.includes(required), `Predictive certification adversarial test missing: ${required}`)
}

console.log('Predictive certification adversarial audit passed.')
