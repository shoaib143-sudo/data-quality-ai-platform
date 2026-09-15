import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/ai/continuous-learning-governance.ts', 'utf8')
const tests = fs.readFileSync('scripts/test-continuous-learning-governance.mjs', 'utf8')

for (const required of [
  "CONTINUOUS_LEARNING_GOVERNANCE_VERSION = 'continuous-learning-governance-v3'",
  "status: 'ELIGIBLE_FOR_REVIEW' | 'NOT_READY'",
  'minimumVerifiedLearningCases',
  'minimumEffectiveCases',
  'minimumIneffectiveCases',
  'trainingDataHash: string',
  'reproducibilityRef: string',
  'evidenceAvailableAt: string',
  'persisted: true',
  'synthetic: false',
  'automaticRetrainingAllowed: false',
  'automaticPromotionAllowed: false',
  'productionMutationAllowed: false',
  'memoryCanAuthorizeChange: false',
  'currentAuthorizationRequiredAtPromotion: true',
  'humanReviewRequired: true',
  'overrideCanBypassReadiness: false',
  "evidence.persisted !== true",
  "evidence.synthetic !== false",
  "timestamp(evidence.evidenceAvailableAt, 'learningEvidence.evidenceAvailableAt')",
  'learning evidence cannot be available before verifiedAt',
  'learning evidence must not be available after evidenceCutoffAt',
  "timestamp(observation.evidenceAvailableAt, 'driftObservation.evidenceAvailableAt')",
  'drift evidence cannot be available before observedAt',
  "observation.persisted !== true",
  "observation.synthetic !== false",
  "input.humanOverride.persisted !== true",
  "input.humanOverride.synthetic !== false",
  'duplicate governance evidence reference',
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
  'future learning evidence and drift observation time are rejected',
  'learning verified before cutoff but available after cutoff is rejected',
  'evidence availability cannot precede underlying observation or verification',
  'drift observed before cutoff but available after cutoff is rejected',
  'synthetic unpersisted and duplicate learning evidence are rejected',
  'synthetic or unpersisted drift evidence is rejected',
  'governance evidence references are unique across learning drift and overrides',
  'human override is provenance only and cannot bypass readiness',
  'human override must be persisted non-synthetic provenance available by cutoff',
  'candidate version and policy provenance are mandatory',
]) {
  assert.ok(tests.includes(required), `Continuous learning adversarial test missing: ${required}`)
}

console.log('Continuous learning model governance v3 temporal provenance adversarial audit passed.')
