import assert from 'node:assert/strict'
import test from 'node:test'

import { certifyPredictiveReadiness } from '../lib/ai/predictive-certification.ts'
import { assessPrescriptiveReadiness } from '../lib/ai/prescriptive-readiness.ts'
import { buildPrescriptiveReviewGate } from '../lib/ai/prescriptive-review-gate.ts'
import { assessContinuousLearningGovernance } from '../lib/ai/continuous-learning-governance.ts'

function shadow(overrides = {}) {
  return {
    version: 'governed-shadow-evaluation-v1',
    projectId: 'project-a',
    candidateModelVersionId: 'model-v2',
    status: 'EVALUATED',
    sampleSize: 4,
    effectiveCount: 2,
    ineffectiveCount: 2,
    brierScore: 0.04,
    accuracy: 1,
    confusionMatrix: { truePositive: 2, falsePositive: 0, trueNegative: 2, falseNegative: 0 },
    evidenceRefs: ['shadow:e1', 'shadow:e2'],
    predictiveProbabilityExposed: false,
    rowLevelPredictionsExposed: false,
    shadowDecisionAuthority: false,
    executionAuthority: false,
    promotionAuthority: false,
    historicalOutcomeOnly: true,
    ...overrides,
  }
}

const predictivePolicy = () => ({
  policyId: 'predictive-policy', policyVersion: '1', minimumShadowCases: 4,
  minimumEffectiveCases: 1, minimumIneffectiveCases: 1, maximumBrierScore: 0.25, minimumAccuracy: 0.75,
})

function interventions() {
  return [
    ['i1','RULE_TUNING','EFFECTIVE','2026-08-01','2026-08-02'],
    ['i2','RULE_TUNING','INEFFECTIVE','2026-08-03','2026-08-04'],
    ['i3','SOURCE_REMEDIATION','EFFECTIVE','2026-08-05','2026-08-06'],
    ['i4','SOURCE_REMEDIATION','FAILED','2026-08-07','2026-08-08'],
  ].map(([id, interventionKey, observedOutcome, observedAt, evidenceAvailableAt]) => ({
    id, projectId: 'project-a', interventionKey, persisted: true, syntheticOrTest: false, adjudicated: true,
    observedOutcome, observedAt: `${observedAt}T00:00:00Z`, evidenceAvailableAt: `${evidenceAvailableAt}T00:00:00Z`,
    evidenceRefs: [`intervention:${id}`],
  }))
}

const prescriptivePolicy = () => ({
  policyId: 'prescriptive-policy', policyVersion: '1', minimumObservedInterventionCases: 4,
  minimumDistinctInterventions: 2, minimumPositiveOutcomes: 2, minimumNegativeOutcomes: 2,
})

function learningEvidence() {
  return [1,2,3,4].map((id) => ({
    evidenceRef: `learning:e${id}`, projectId: 'project-a', verifiedAt: `2026-08-0${id}T00:00:00Z`,
    evidenceAvailableAt: `2026-08-0${id}T01:00:00Z`, effective: id % 2 === 1,
    verified: true, persisted: true, synthetic: false,
  }))
}

function drift(overrides = {}) {
  return {
    evidenceRef: 'drift:quality-score:2026-08-10', metricKey: 'quality-score',
    observedAt: '2026-08-10T00:00:00Z', evidenceAvailableAt: '2026-08-11T00:00:00Z',
    referenceValue: 0.95, currentValue: 0.9, persisted: true, synthetic: false, ...overrides,
  }
}

function override(overrides = {}) {
  return {
    evidenceRef: 'override:reviewer-1:2026-08-20', reviewerId: 'reviewer-1',
    reason: 'Review provenance only, never authorization.', recordedAt: '2026-08-20T00:00:00Z',
    persisted: true, synthetic: false, ...overrides,
  }
}

test('governed intelligence chain reaches human review without autonomous authority', () => {
  const predictive = certifyPredictiveReadiness({ projectId: 'project-a', shadow: shadow(), policy: predictivePolicy() })
  assert.equal(predictive.status, 'ELIGIBLE_FOR_REVIEW')
  assert.equal(predictive.productionPredictionEnabled, false)
  assert.equal(predictive.automaticPromotionAllowed, false)
  assert.equal(predictive.decisionAuthority, false)
  assert.equal(predictive.executionAuthority, false)

  const readiness = assessPrescriptiveReadiness({
    projectId: 'project-a', predictiveCertification: predictive, interventionOutcomes: interventions(),
    evidenceCutoffAt: '2026-09-01T00:00:00Z', policy: prescriptivePolicy(),
  })
  assert.equal(readiness.status, 'ELIGIBLE_FOR_HUMAN_REVIEW')
  assert.equal(readiness.recommendationGenerationEnabled, false)
  assert.equal(readiness.recommendationRankingEnabled, false)
  assert.equal(readiness.causalEffectClaimed, false)
  assert.equal(readiness.autonomousActionAllowed, false)

  const review = buildPrescriptiveReviewGate({
    projectId: 'project-a', predictive, readiness,
    candidates: [{
      candidateId: 'candidate-1', actionKey: 'OPEN_GOVERNANCE_REVIEW', actionPolicyId: 'action-policy',
      actionPolicyVersion: '1', evidenceRefs: ['candidate:e1'], rationale: 'Request governed human review only.',
      requiresApproval: true,
    }],
  })
  assert.equal(review.status, 'REVIEW_REQUIRED')
  assert.equal(review.recommendationAuthority, false)
  assert.equal(review.decisionAuthority, false)
  assert.equal(review.executionAuthority, false)
  assert.equal(review.promotionAuthority, false)
  assert.equal(review.automaticActionAllowed, false)
  assert.equal(review.currentAuthorizationRequiredAtExecution, true)
  assert.equal(review.humanDecisionRequired, true)

  const continuous = assessContinuousLearningGovernance({
    projectId: 'project-a', currentModelVersionId: 'model-v1', candidateModelVersionId: 'model-v2',
    policy: { policyId: 'learning-policy', policyVersion: '1', minimumVerifiedLearningCases: 4, minimumEffectiveCases: 2, minimumIneffectiveCases: 2 },
    learningEvidence: learningEvidence(), driftObservations: [drift()],
    trainingDataHash: 'sha256:test-training-data', reproducibilityRef: 'repro:program-certification',
    evidenceCutoffAt: '2026-09-01T00:00:00Z',
  })
  assert.equal(continuous.version, 'continuous-learning-governance-v3')
  assert.equal(continuous.status, 'ELIGIBLE_FOR_REVIEW')
  assert.equal(continuous.automaticRetrainingAllowed, false)
  assert.equal(continuous.automaticPromotionAllowed, false)
  assert.equal(continuous.productionMutationAllowed, false)
  assert.equal(continuous.memoryCanAuthorizeChange, false)
  assert.equal(continuous.currentAuthorizationRequiredAtPromotion, true)
  assert.equal(continuous.humanReviewRequired, true)
  assert.ok(continuous.evidenceRefs.includes('drift:quality-score:2026-08-10'))
})

test('predictive failure suppresses downstream prescriptive candidates', () => {
  const predictive = certifyPredictiveReadiness({ projectId: 'project-a', shadow: shadow({ brierScore: 0.9, accuracy: 0.25 }), policy: predictivePolicy() })
  assert.equal(predictive.status, 'NOT_READY')
  const readiness = assessPrescriptiveReadiness({ projectId: 'project-a', predictiveCertification: predictive, interventionOutcomes: interventions(), evidenceCutoffAt: '2026-09-01T00:00:00Z', policy: prescriptivePolicy() })
  assert.equal(readiness.status, 'NOT_READY')
  const review = buildPrescriptiveReviewGate({
    projectId: 'project-a', predictive, readiness,
    candidates: [{ candidateId: 'candidate-suppressed', actionKey: 'OPEN_GOVERNANCE_REVIEW', actionPolicyId: 'action-policy', actionPolicyVersion: '1', evidenceRefs: ['candidate:e2'], rationale: 'Must be suppressed.', requiresApproval: true }],
  })
  assert.equal(review.status, 'NOT_READY')
  assert.deepEqual(review.candidates, [])
})

test('human override cannot bypass insufficient continuous-learning evidence', () => {
  const result = assessContinuousLearningGovernance({
    projectId: 'project-a', currentModelVersionId: 'model-v1', candidateModelVersionId: 'model-v2',
    policy: { policyId: 'learning-policy', policyVersion: '1', minimumVerifiedLearningCases: 4, minimumEffectiveCases: 2, minimumIneffectiveCases: 2 },
    learningEvidence: learningEvidence().slice(0, 2), trainingDataHash: 'sha256:insufficient', reproducibilityRef: 'repro:insufficient',
    evidenceCutoffAt: '2026-09-01T00:00:00Z', humanOverride: override(),
  })
  assert.equal(result.status, 'NOT_READY')
  assert.equal(result.overrideCanBypassReadiness, false)
  assert.ok(result.evidenceRefs.includes('override:reviewer-1:2026-08-20'))
})

test('delayed learning evidence availability fails closed at program boundary', () => {
  const delayed = learningEvidence()
  delayed[0] = { ...delayed[0], verifiedAt: '2026-08-01T00:00:00Z', evidenceAvailableAt: '2026-09-02T00:00:00Z' }
  assert.throws(() => assessContinuousLearningGovernance({
    projectId: 'project-a', currentModelVersionId: 'model-v1', candidateModelVersionId: 'model-v2',
    policy: { policyId: 'learning-policy', policyVersion: '1', minimumVerifiedLearningCases: 4, minimumEffectiveCases: 2, minimumIneffectiveCases: 2 },
    learningEvidence: delayed, driftObservations: [drift()],
    trainingDataHash: 'sha256:delayed-learning', reproducibilityRef: 'repro:delayed-learning', evidenceCutoffAt: '2026-09-01T00:00:00Z',
  }), /learning evidence must not be available after evidenceCutoffAt/)
})

test('delayed drift availability fails closed at program boundary', () => {
  assert.throws(() => assessContinuousLearningGovernance({
    projectId: 'project-a', currentModelVersionId: 'model-v1', candidateModelVersionId: 'model-v2',
    policy: { policyId: 'learning-policy', policyVersion: '1', minimumVerifiedLearningCases: 4, minimumEffectiveCases: 2, minimumIneffectiveCases: 2 },
    learningEvidence: learningEvidence(), driftObservations: [drift({ evidenceAvailableAt: '2026-09-02T00:00:00Z' })],
    trainingDataHash: 'sha256:delayed-drift', reproducibilityRef: 'repro:delayed-drift', evidenceCutoffAt: '2026-09-01T00:00:00Z',
  }), /drift observation must not be available after evidenceCutoffAt/)
})

test('cross-category duplicate provenance fails closed', () => {
  assert.throws(() => assessContinuousLearningGovernance({
    projectId: 'project-a', currentModelVersionId: 'model-v1', candidateModelVersionId: 'model-v2',
    policy: { policyId: 'learning-policy', policyVersion: '1', minimumVerifiedLearningCases: 4, minimumEffectiveCases: 2, minimumIneffectiveCases: 2 },
    learningEvidence: learningEvidence(), driftObservations: [drift({ evidenceRef: 'learning:e1' })],
    trainingDataHash: 'sha256:duplicate-lineage', reproducibilityRef: 'repro:duplicate-lineage', evidenceCutoffAt: '2026-09-01T00:00:00Z',
  }), /duplicate governance evidence reference/)
})
