import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/ai/continuous-learning-governance.ts', 'utf8')
const tests = fs.readFileSync('scripts/test-continuous-learning-governance.mjs', 'utf8')

for (const required of [
  "CONTINUOUS_LEARNING_GOVERNANCE_VERSION = 'continuous-learning-governance-v1'",
  "status: 'ELIGIBLE_FOR_REVIEW' | 'NOT_READY'",
  'minimumVerifiedLearningCases',
  'minimumEffectiveCases',
  'minimumIneffectiveCases',
  'trainingDataHash: string',
  'reproducibilityRef: string',
  'automaticRetrainingAllowed: false',
  'automaticPromotionAllowed: false',
  'productionMutationAllowed: false',
  'memoryCanAuthorizeChange: false',
  'currentAuthorizationRequiredAtPromotion: true',
  'humanReviewRequired: true',
  'overrideCanBypassReadiness: false',
  "evidence.synthetic !== false",
  "timestamp(evidence.verifiedAt, 'learningEvidence.verifiedAt') > cutoff",
  "timestamp(observation.observedAt, 'driftObservation.observedAt') > cutoff",
  'duplicate learning evidence reference',
]) {
  assert.ok(source.includes(required), `Continuous learning governance boundary missing: ${required}`)
}

for (const forbidden of [
  'executeAction',
  'dispatchAction',
  'authorize(',
  'autoRetrain',
  'promoteModel(',
  'Math.random',
]) {
  assert.ok(!source.includes(forbidden), `Continuous learning governance must not contain authority primitive: ${forbidden}`)
}

for (const required of [
  'insufficient verified evidence stays NOT_READY',
  'single-sided class evidence stays NOT_READY',
  'cross-project evidence is rejected',
  'future evidence and drift are rejected',
  'synthetic and duplicate evidence are rejected',
  'human override is provenance only and cannot bypass readiness',
  'candidate version and policy provenance are mandatory',
]) {
  assert.ok(tests.includes(required), `Continuous learning adversarial test missing: ${required}`)
}

console.log('Continuous learning model governance adversarial audit passed.')
