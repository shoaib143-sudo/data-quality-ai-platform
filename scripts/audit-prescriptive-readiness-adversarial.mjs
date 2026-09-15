import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/ai/prescriptive-readiness.ts', 'utf8')
const tests = fs.readFileSync('scripts/test-prescriptive-readiness.mjs', 'utf8')
const provenanceTests = fs.readFileSync('scripts/test-prescriptive-readiness-provenance.mjs', 'utf8')

for (const required of [
  "PRESCRIPTIVE_READINESS_VERSION = 'prescriptive-readiness-v1'",
  "input.predictiveCertification.status !== 'ELIGIBLE_FOR_REVIEW'",
  'item.projectId !== projectId',
  '!item.persisted || item.syntheticOrTest || !item.adjudicated',
  'result.evidenceRefs.length === 0',
  'item.evidenceRefs.length === 0',
  'observedAt > cutoff || evidenceAvailableAt > cutoff',
  'INSUFFICIENT_INTERVENTION_SAMPLE',
  'INSUFFICIENT_INTERVENTION_DIVERSITY',
  'INSUFFICIENT_OUTCOME_CLASS_COVERAGE',
  'recommendationRankingEnabled: false',
  'recommendationGenerationEnabled: false',
  'causalEffectClaimed: false',
  'predictiveProbabilityExposed: false',
  'decisionAuthority: false',
  'executionAuthority: false',
  'autonomousActionAllowed: false',
  'humanReviewRequired: true',
]) {
  assert.ok(source.includes(required), `Prescriptive readiness boundary missing: ${required}`)
}

assert.ok(!source.includes('executeAction'), 'Prescriptive readiness must not execute actions.')
assert.ok(!source.includes('rankRecommendations'), 'Prescriptive readiness must not rank recommendations.')
assert.ok(!source.includes('Math.random'), 'Prescriptive readiness must remain deterministic.')
assert.ok(!source.includes('createAdminClient'), 'Prescriptive readiness core must not bypass authorization or evidence adapters.')

for (const required of [
  'predictive certification NOT_READY fails closed',
  'synthetic, unpersisted, unadjudicated and foreign-project outcomes are excluded',
  'future observed or evidence-available rows are excluded by evidence cutoff',
  'insufficient intervention diversity fails closed',
  'single-class outcome evidence fails closed',
  'duplicate intervention outcome identity fails closed',
  'authoritative predictive evidence is rejected',
  'project mismatch fails closed',
  'anonymous policy provenance is rejected',
]) {
  assert.ok(tests.includes(required), `Prescriptive readiness negative test missing: ${required}`)
}

for (const required of [
  'predictive certification without provenance fails closed',
  'intervention outcomes without provenance do not count toward readiness',
]) {
  assert.ok(provenanceTests.includes(required), `Prescriptive readiness provenance test missing: ${required}`)
}

console.log('Prescriptive readiness adversarial audit passed.')
