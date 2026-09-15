import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assessContinuousLearningGovernance } from '../lib/ai/continuous-learning-governance.ts'

const policy = {
  policyId: 'model-governance-policy',
  policyVersion: 'v1',
  minimumVerifiedLearningCases: 4,
  minimumEffectiveCases: 2,
  minimumIneffectiveCases: 2,
}

function evidence(id, effective, overrides = {}) {
  return {
    evidenceRef: `case:${id}`,
    projectId: 'project-1',
    verifiedAt: `2026-09-0${id}T00:00:00Z`,
    effective,
    verified: true,
    synthetic: false,
    ...overrides,
  }
}

function request(overrides = {}) {
  return {
    projectId: 'project-1',
    currentModelVersionId: 'model-v1',
    candidateModelVersionId: 'model-v2',
    policy,
    learningEvidence: [evidence(1, true), evidence(2, false), evidence(3, true), evidence(4, false)],
    driftObservations: [
      { metricKey: 'brier_score', observedAt: '2026-09-04T01:00:00Z', referenceValue: 0.1, currentValue: 0.14 },
    ],
    trainingDataHash: 'sha256:training-data-v2',
    reproducibilityRef: 'model-v2:dataset:v2:evaluation:v1',
    evidenceCutoffAt: '2026-09-10T00:00:00Z',
    ...overrides,
  }
}

test('sufficient verified real evidence is human-review eligible only', () => {
  const result = assessContinuousLearningGovernance(request())
  assert.equal(result.status, 'ELIGIBLE_FOR_REVIEW')
  assert.deepEqual(result.reasons, ['READY_FOR_HUMAN_MODEL_REVIEW'])
  assert.equal(result.automaticRetrainingAllowed, false)
  assert.equal(result.automaticPromotionAllowed, false)
  assert.equal(result.productionMutationAllowed, false)
  assert.equal(result.memoryCanAuthorizeChange, false)
  assert.equal(result.currentAuthorizationRequiredAtPromotion, true)
  assert.equal(result.humanReviewRequired, true)
})

test('insufficient verified evidence stays NOT_READY', () => {
  const result = assessContinuousLearningGovernance(request({ learningEvidence: [evidence(1, true), evidence(2, false)] }))
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('INSUFFICIENT_VERIFIED_LEARNING_CASES'))
})

test('single-sided class evidence stays NOT_READY', () => {
  const result = assessContinuousLearningGovernance(request({
    learningEvidence: [evidence(1, true), evidence(2, true), evidence(3, true), evidence(4, true)],
  }))
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('INSUFFICIENT_OUTCOME_CLASS_COVERAGE'))
})

test('cross-project evidence is rejected', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({ learningEvidence: [evidence(1, true, { projectId: 'project-2' })] })),
    /learning evidence projectId must match projectId/,
  )
})

test('future evidence and drift are rejected', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({ learningEvidence: [evidence(1, true, { verifiedAt: '2026-09-11T00:00:00Z' })] })),
    /must not be available after evidenceCutoffAt/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({ driftObservations: [{ metricKey: 'accuracy', observedAt: '2026-09-11T00:00:00Z', referenceValue: 0.9, currentValue: 0.8 }] })),
    /drift observation must not be available after evidenceCutoffAt/,
  )
})

test('synthetic and duplicate evidence are rejected', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({ learningEvidence: [evidence(1, true, { synthetic: true })] })),
    /synthetic evidence is not eligible/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({ learningEvidence: [evidence(1, true), evidence(1, false)] })),
    /duplicate learning evidence reference/,
  )
})

test('human override is provenance only and cannot bypass readiness', () => {
  const result = assessContinuousLearningGovernance(request({
    learningEvidence: [evidence(1, true)],
    humanOverride: { reviewerId: 'reviewer-1', reason: 'Investigate candidate manually', recordedAt: '2026-09-09T00:00:00Z' },
  }))
  assert.equal(result.status, 'NOT_READY')
  assert.equal(result.overrideCanBypassReadiness, false)
  assert.equal(result.humanOverride.reviewerId, 'reviewer-1')
})

test('candidate version and policy provenance are mandatory', () => {
  assert.throws(() => assessContinuousLearningGovernance(request({ candidateModelVersionId: 'model-v1' })), /must differ/)
  assert.throws(() => assessContinuousLearningGovernance(request({ policy: { ...policy, policyVersion: '' } })), /policyVersion is required/)
  assert.throws(() => assessContinuousLearningGovernance(request({ trainingDataHash: '' })), /trainingDataHash is required/)
  assert.throws(() => assessContinuousLearningGovernance(request({ reproducibilityRef: '' })), /reproducibilityRef is required/)
})
