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
    confusionMatrix: {
      truePositive: 2,
      falsePositive: 0,
      trueNegative: 2,
      falseNegative: 0,
    },
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

function predictivePolicy(overrides = {}) {
  return {
    policyId: 'predictive-policy',
    policyVersion: '1',
    minimumShadowCases: 4,
    minimumEffectiveCases: 1,
    minimumIneffectiveCases: 1,
    maximumBrierScore: 0.25,
    minimumAccuracy: 0.75,
    ...overrides,
  }
}

function interventions() {
  return [
    {
      id: 'i1',
      projectId: 'project-a',
      interventionKey: 'RULE_TUNING',
      persisted: true,
      syntheticOrTest: false,
      adjudicated: true,
      observedOutcome: 'EFFECTIVE',
      observedAt: '2026-08-01T00:00:00Z',
      evidenceAvailableAt: '2026-08-02T00:00:00Z',
      evidenceRefs: ['intervention:i1'],
    },
    {
      id: 'i2',
      projectId: 'project-a',
      interventionKey: 'RULE_TUNING',
      persisted: true,
      syntheticOrTest: false,
      adjudicated: true,
      observedOutcome: 'INEFFECTIVE',
      observedAt: '2026-08-03T00:00:00Z',
      evidenceAvailableAt: '2026-08-04T00:00:00Z',
      evidenceRefs: ['intervention:i2'],
    },
    {
      id: 'i3',
      projectId: 'project-a',
      interventionKey: 'SOURCE_REMEDIATION',
      persisted: true,
      syntheticOrTest: false,
      adjudicated: true,
      observedOutcome: 'EFFECTIVE',
      observedAt: '2026-08-05T00:00:00Z',
      evidenceAvailableAt: '2026-08-06T00:00:00Z',
      evidenceRefs: ['intervention:i3'],
    },
    {
      id: 'i4',
      projectId: 'project-a',
      interventionKey: 'SOURCE_REMEDIATION',
      persisted: true,
      syntheticOrTest: false,
      adjudicated: true,
      observedOutcome: 'FAILED',
      observedAt: '2026-08-07T00:00:00Z',
      evidenceAvailableAt: '2026-08-08T00:00:00Z',
      evidenceRefs: ['intervention:i4'],
    },
  ]
}

function prescriptivePolicy() {
  return {
    policyId: 'prescriptive-policy',
    policyVersion: '1',
    minimumObservedInterventionCases: 4,
    minimumDistinctInterventions: 2,
    minimumPositiveOutcomes: 2,
    minimumNegativeOutcomes: 2,
  }
}

function learningEvidence() {
  return [
    {
      evidenceRef: 'learning:e1',
      projectId: 'project-a',
      verifiedAt: '2026-08-01T00:00:00Z',
      effective: true,
      verified: true,
      synthetic: false,
    },
    {
      evidenceRef: 'learning:e2',
      projectId: 'project-a',
      verifiedAt: '2026-08-02T00:00:00Z',
      effective: false,
      verified: true,
      synthetic: false,
    },
    {
      evidenceRef: 'learning:e3',
      projectId: 'project-a',
      verifiedAt: '2026-08-03T00:00:00Z',
      effective: true,
      verified: true,
      synthetic: false,
    },
    {
      evidenceRef: 'learning:e4',
      projectId: 'project-a',
      verifiedAt: '2026-08-04T00:00:00Z',
      effective: false,
      verified: true,
      synthetic: false,
    },
  ]
}

test('governed intelligence chain reaches human review without gaining autonomous authority', () => {
  const predictive = certifyPredictiveReadiness({
    projectId: 'project-a',
    shadow: shadow(),
    policy: predictivePolicy(),
  })
  assert.equal(predictive.status, 'ELIGIBLE_FOR_REVIEW')
  assert.equal(predictive.productionPredictionEnabled, false)
  assert.equal(predictive.automaticPromotionAllowed, false)
  assert.equal(predictive.decisionAuthority, false)
  assert.equal(predictive.executionAuthority, false)

  const readiness = assessPrescriptiveReadiness({
    projectId: 'project-a',
    predictiveCertification: predictive,
    interventionOutcomes: interventions(),
    evidenceCutoffAt: '2026-09-01T00:00:00Z',
    policy: prescriptivePolicy(),
  })
  assert.equal(readiness.status, 'ELIGIBLE_FOR_HUMAN_REVIEW')
  assert.equal(readiness.recommendationGenerationEnabled, false)
  assert.equal(readiness.recommendationRankingEnabled, false)
  assert.equal(readiness.causalEffectClaimed, false)
  assert.equal(readiness.autonomousActionAllowed, false)

  const review = buildPrescriptiveReviewGate({
    projectId: 'project-a',
    predictive,
    readiness,
    candidates: [
      {
        candidateId: 'candidate-1',
        actionKey: 'OPEN_GOVERNANCE_REVIEW',
        actionPolicyId: 'action-policy',
        actionPolicyVersion: '1',
        evidenceRefs: ['candidate:e1'],
        rationale: 'Request governed human review only.',
        requiresApproval: true,
      },
    ],
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
    projectId: 'project-a',
    currentModelVersionId: 'model-v1',
    candidateModelVersionId: 'model-v2',
    policy: {
      policyId: 'learning-policy',
      policyVersion: '1',
      minimumVerifiedLearningCases: 4,
      minimumEffectiveCases: 2,
      minimumIneffectiveCases: 2,
    },
    learningEvidence: learningEvidence(),
    driftObservations: [
      {
        metricKey: 'quality-score',
        observedAt: '2026-08-10T00:00:00Z',
        referenceValue: 0.95,
        currentValue: 0.9,
      },
    ],
    trainingDataHash: 'sha256:test-training-data',
    reproducibilityRef: 'repro:program-certification',
    evidenceCutoffAt: '2026-09-01T00:00:00Z',
  })
  assert.equal(continuous.status, 'ELIGIBLE_FOR_REVIEW')
  assert.equal(continuous.automaticRetrainingAllowed, false)
  assert.equal(continuous.automaticPromotionAllowed, false)
  assert.equal(continuous.productionMutationAllowed, false)
  assert.equal(continuous.memoryCanAuthorizeChange, false)
  assert.equal(continuous.currentAuthorizationRequiredAtPromotion, true)
  assert.equal(continuous.humanReviewRequired, true)
})

test('predictive failure suppresses downstream prescriptive candidates', () => {
  const predictive = certifyPredictiveReadiness({
    projectId: 'project-a',
    shadow: shadow({ brierScore: 0.9, accuracy: 0.25 }),
    policy: predictivePolicy(),
  })
  assert.equal(predictive.status, 'NOT_READY')

  const readiness = assessPrescriptiveReadiness({
    projectId: 'project-a',
    predictiveCertification: predictive,
    interventionOutcomes: interventions(),
    evidenceCutoffAt: '2026-09-01T00:00:00Z',
    policy: prescriptivePolicy(),
  })
  assert.equal(readiness.status, 'NOT_READY')
  assert.ok(readiness.reasons.includes('PREDICTIVE_CERTIFICATION_NOT_ELIGIBLE'))

  const review = buildPrescriptiveReviewGate({
    projectId: 'project-a',
    predictive,
    readiness,
    candidates: [
      {
        candidateId: 'candidate-should-be-suppressed',
        actionKey: 'OPEN_GOVERNANCE_REVIEW',
        actionPolicyId: 'action-policy',
        actionPolicyVersion: '1',
        evidenceRefs: ['candidate:e2'],
        rationale: 'Must not survive a failed prerequisite.',
        requiresApproval: true,
      },
    ],
  })
  assert.equal(review.status, 'NOT_READY')
  assert.deepEqual(review.candidates, [])
  assert.deepEqual(review.reasons, ['PREDICTIVE_NOT_ELIGIBLE'])
})

test('human override cannot bypass insufficient continuous-learning evidence', () => {
  const result = assessContinuousLearningGovernance({
    projectId: 'project-a',
    currentModelVersionId: 'model-v1',
    candidateModelVersionId: 'model-v2',
    policy: {
      policyId: 'learning-policy',
      policyVersion: '1',
      minimumVerifiedLearningCases: 4,
      minimumEffectiveCases: 2,
      minimumIneffectiveCases: 2,
    },
    learningEvidence: learningEvidence().slice(0, 2),
    trainingDataHash: 'sha256:insufficient',
    reproducibilityRef: 'repro:insufficient',
    evidenceCutoffAt: '2026-09-01T00:00:00Z',
    humanOverride: {
      reviewerId: 'reviewer-1',
      reason: 'Review provenance only, never authorization.',
      recordedAt: '2026-08-20T00:00:00Z',
    },
  })
  assert.equal(result.status, 'NOT_READY')
  assert.equal(result.overrideCanBypassReadiness, false)
  assert.ok(result.reasons.includes('INSUFFICIENT_VERIFIED_LEARNING_CASES'))
  assert.ok(result.reasons.includes('INSUFFICIENT_OUTCOME_CLASS_COVERAGE'))
})

test('continuous-learning evidence fails closed across project and temporal boundaries', () => {
  assert.throws(
    () => assessContinuousLearningGovernance({
      projectId: 'project-a',
      currentModelVersionId: 'model-v1',
      candidateModelVersionId: 'model-v2',
      policy: {
        policyId: 'learning-policy',
        policyVersion: '1',
        minimumVerifiedLearningCases: 1,
        minimumEffectiveCases: 1,
        minimumIneffectiveCases: 1,
      },
      learningEvidence: [
        {
          evidenceRef: 'foreign:e1',
          projectId: 'project-b',
          verifiedAt: '2026-08-01T00:00:00Z',
          effective: true,
          verified: true,
          synthetic: false,
        },
      ],
      trainingDataHash: 'sha256:foreign',
      reproducibilityRef: 'repro:foreign',
      evidenceCutoffAt: '2026-09-01T00:00:00Z',
    }),
    /learning evidence projectId must match projectId/,
  )

  assert.throws(
    () => assessContinuousLearningGovernance({
      projectId: 'project-a',
      currentModelVersionId: 'model-v1',
      candidateModelVersionId: 'model-v2',
      policy: {
        policyId: 'learning-policy',
        policyVersion: '1',
        minimumVerifiedLearningCases: 1,
        minimumEffectiveCases: 1,
        minimumIneffectiveCases: 1,
      },
      learningEvidence: [
        {
          evidenceRef: 'future:e1',
          projectId: 'project-a',
          verifiedAt: '2026-10-01T00:00:00Z',
          effective: true,
          verified: true,
          synthetic: false,
        },
      ],
      trainingDataHash: 'sha256:future',
      reproducibilityRef: 'repro:future',
      evidenceCutoffAt: '2026-09-01T00:00:00Z',
    }),
    /learning evidence must not be available after evidenceCutoffAt/,
  )
})
