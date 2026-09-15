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
    evidenceAvailableAt: `2026-09-0${id}T01:00:00Z`,
    effective,
    verified: true,
    persisted: true,
    synthetic: false,
    ...overrides,
  }
}

function drift(overrides = {}) {
  return {
    evidenceRef: 'drift:brier:1',
    metricKey: 'brier_score',
    observedAt: '2026-09-04T01:00:00Z',
    evidenceAvailableAt: '2026-09-04T02:00:00Z',
    persisted: true,
    synthetic: false,
    referenceValue: 0.1,
    currentValue: 0.14,
    ...overrides,
  }
}

function override(overrides = {}) {
  return {
    evidenceRef: 'override:1',
    reviewerId: 'reviewer-1',
    reason: 'Investigate candidate manually',
    recordedAt: '2026-09-09T00:00:00Z',
    persisted: true,
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
    driftObservations: [drift()],
    trainingDataHash: 'sha256:training-data-v3',
    reproducibilityRef: 'model-v2:dataset:v3:evaluation:v1',
    evidenceCutoffAt: '2026-09-10T00:00:00Z',
    ...overrides,
  }
}

test('sufficient verified real evidence is human-review eligible only', () => {
  const result = assessContinuousLearningGovernance(request())
  assert.equal(result.version, 'continuous-learning-governance-v3')
  assert.equal(result.status, 'ELIGIBLE_FOR_REVIEW')
  assert.deepEqual(result.reasons, ['READY_FOR_HUMAN_MODEL_REVIEW'])
  assert.equal(result.automaticRetrainingAllowed, false)
  assert.equal(result.automaticPromotionAllowed, false)
  assert.equal(result.productionMutationAllowed, false)
  assert.equal(result.memoryCanAuthorizeChange, false)
  assert.equal(result.currentAuthorizationRequiredAtPromotion, true)
  assert.equal(result.humanReviewRequired, true)
  assert.ok(result.evidenceRefs.includes('drift:brier:1'))
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

test('future learning evidence and drift observation time are rejected', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({ learningEvidence: [evidence(1, true, { verifiedAt: '2026-09-11T00:00:00Z', evidenceAvailableAt: '2026-09-11T01:00:00Z' })] })),
    /learning evidence must not be available after evidenceCutoffAt/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({ driftObservations: [drift({ observedAt: '2026-09-11T00:00:00Z', evidenceAvailableAt: '2026-09-11T01:00:00Z' })] })),
    /drift observation must not be available after evidenceCutoffAt/,
  )
})

test('learning verified before cutoff but available after cutoff is rejected', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({
      learningEvidence: [evidence(1, true, { verifiedAt: '2026-09-01T00:00:00Z', evidenceAvailableAt: '2026-09-11T00:00:00Z' })],
    })),
    /learning evidence must not be available after evidenceCutoffAt/,
  )
})

test('evidence availability cannot precede underlying observation or verification', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({
      learningEvidence: [evidence(1, true, { verifiedAt: '2026-09-05T00:00:00Z', evidenceAvailableAt: '2026-09-04T00:00:00Z' })],
    })),
    /learning evidence cannot be available before verifiedAt/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({
      driftObservations: [drift({ observedAt: '2026-09-05T00:00:00Z', evidenceAvailableAt: '2026-09-04T00:00:00Z' })],
    })),
    /drift evidence cannot be available before observedAt/,
  )
})

test('drift observed before cutoff but available after cutoff is rejected', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({
      driftObservations: [drift({ observedAt: '2026-09-01T00:00:00Z', evidenceAvailableAt: '2026-09-11T00:00:00Z' })],
    })),
    /drift observation must not be available after evidenceCutoffAt/,
  )
})

test('synthetic unpersisted and duplicate learning evidence are rejected', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({ learningEvidence: [evidence(1, true, { synthetic: true })] })),
    /synthetic evidence is not eligible/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({ learningEvidence: [evidence(1, true, { persisted: false })] })),
    /learning evidence must be persisted evidence/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({ learningEvidence: [evidence(1, true), evidence(1, false)] })),
    /duplicate governance evidence reference/,
  )
})

test('synthetic or unpersisted drift evidence is rejected', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({ driftObservations: [drift({ synthetic: true })] })),
    /synthetic drift evidence is not eligible/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({ driftObservations: [drift({ persisted: false })] })),
    /drift observation must be persisted evidence/,
  )
})

test('governance evidence references are unique across learning drift and overrides', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({ driftObservations: [drift({ evidenceRef: 'case:1' })] })),
    /duplicate governance evidence reference/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({ humanOverride: override({ evidenceRef: 'case:2' }) })),
    /duplicate governance evidence reference/,
  )
})

test('human override is provenance only and cannot bypass readiness', () => {
  const result = assessContinuousLearningGovernance(request({
    learningEvidence: [evidence(1, true)],
    humanOverride: override(),
  }))
  assert.equal(result.status, 'NOT_READY')
  assert.equal(result.overrideCanBypassReadiness, false)
  assert.equal(result.humanOverride.reviewerId, 'reviewer-1')
  assert.ok(result.evidenceRefs.includes('override:1'))
})

test('human override must be persisted non-synthetic provenance available by cutoff', () => {
  assert.throws(
    () => assessContinuousLearningGovernance(request({ humanOverride: override({ persisted: false }) })),
    /human override must be persisted evidence/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({ humanOverride: override({ synthetic: true }) })),
    /synthetic human override is not eligible/,
  )
  assert.throws(
    () => assessContinuousLearningGovernance(request({ humanOverride: override({ recordedAt: '2026-09-11T00:00:00Z' }) })),
    /human override must not be recorded after evidenceCutoffAt/,
  )
})

test('candidate version and policy provenance are mandatory', () => {
  assert.throws(() => assessContinuousLearningGovernance(request({ candidateModelVersionId: 'model-v1' })), /must differ/)
  assert.throws(() => assessContinuousLearningGovernance(request({ policy: { ...policy, policyVersion: '' } })), /policyVersion is required/)
  assert.throws(() => assessContinuousLearningGovernance(request({ trainingDataHash: '' })), /trainingDataHash is required/)
  assert.throws(() => assessContinuousLearningGovernance(request({ reproducibilityRef: '' })), /reproducibilityRef is required/)
})
