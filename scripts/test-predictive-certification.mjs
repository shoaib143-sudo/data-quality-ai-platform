import assert from 'node:assert/strict'
import { test } from 'node:test'
import { certifyPredictiveReadiness } from '../lib/ai/predictive-certification.ts'

function shadow(overrides = {}) {
  return {
    version: 'governed-shadow-evaluation-v1',
    projectId: 'project-1',
    candidateModelVersionId: 'model-v1',
    status: 'EVALUATED',
    sampleSize: 20,
    effectiveCount: 10,
    ineffectiveCount: 10,
    brierScore: 0.12,
    accuracy: 0.85,
    confusionMatrix: { truePositive: 9, falsePositive: 2, trueNegative: 8, falseNegative: 1 },
    evidenceRefs: ['case:1', 'case:2'],
    predictiveProbabilityExposed: false,
    rowLevelPredictionsExposed: false,
    shadowDecisionAuthority: false,
    executionAuthority: false,
    promotionAuthority: false,
    historicalOutcomeOnly: true,
    ...overrides,
  }
}

const policy = {
  minimumShadowCases: 20,
  minimumEffectiveCases: 5,
  minimumIneffectiveCases: 5,
  maximumBrierScore: 0.2,
  minimumAccuracy: 0.8,
}

test('eligible shadow evidence is review-only, never auto-promoted', () => {
  const result = certifyPredictiveReadiness({ projectId: 'project-1', shadow: shadow(), policy })
  assert.equal(result.status, 'ELIGIBLE_FOR_REVIEW')
  assert.deepEqual(result.reasons, ['ELIGIBLE_FOR_REVIEW'])
  assert.equal(result.automaticPromotionAllowed, false)
  assert.equal(result.humanReviewRequired, true)
  assert.equal(result.productionPredictionEnabled, false)
  assert.equal(result.predictiveProbabilityExposed, false)
})

test('insufficient shadow sample fails closed', () => {
  const result = certifyPredictiveReadiness({ projectId: 'project-1', shadow: shadow({ sampleSize: 19 }), policy })
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('INSUFFICIENT_SHADOW_SAMPLE'))
})

test('single-sided or sparse class evidence fails closed', () => {
  const result = certifyPredictiveReadiness({
    projectId: 'project-1',
    shadow: shadow({ effectiveCount: 19, ineffectiveCount: 1 }),
    policy,
  })
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('INSUFFICIENT_CLASS_COVERAGE'))
})

test('poor calibration proxy fails closed', () => {
  const result = certifyPredictiveReadiness({ projectId: 'project-1', shadow: shadow({ brierScore: 0.21 }), policy })
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('BRIER_SCORE_TOO_HIGH'))
})

test('poor accuracy fails closed', () => {
  const result = certifyPredictiveReadiness({ projectId: 'project-1', shadow: shadow({ accuracy: 0.79 }), policy })
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('ACCURACY_TOO_LOW'))
})

test('cross-project shadow evidence is rejected', () => {
  assert.throws(
    () => certifyPredictiveReadiness({ projectId: 'project-1', shadow: shadow({ projectId: 'project-2' }), policy }),
    /shadow projectId must match projectId/,
  )
})

test('authoritative or exposed shadow evidence is rejected', () => {
  assert.throws(
    () => certifyPredictiveReadiness({ projectId: 'project-1', shadow: shadow({ promotionAuthority: true }), policy }),
    /non-authoritative historical shadow evidence/,
  )
  assert.throws(
    () => certifyPredictiveReadiness({ projectId: 'project-1', shadow: shadow({ rowLevelPredictionsExposed: true }), policy }),
    /non-authoritative historical shadow evidence/,
  )
})

test('invalid policy thresholds fail closed', () => {
  assert.throws(
    () => certifyPredictiveReadiness({ projectId: 'project-1', shadow: shadow(), policy: { ...policy, minimumShadowCases: 0 } }),
    /minimumShadowCases must be a positive integer/,
  )
  assert.throws(
    () => certifyPredictiveReadiness({ projectId: 'project-1', shadow: shadow(), policy: { ...policy, maximumBrierScore: 1.1 } }),
    /maximumBrierScore must be between 0 and 1/,
  )
})
