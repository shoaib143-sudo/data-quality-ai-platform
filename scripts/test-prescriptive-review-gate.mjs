import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPrescriptiveReviewGate } from '../lib/ai/prescriptive-review-gate.ts'

function predictive(overrides = {}) {
  return {
    version: 'predictive-certification-v1',
    projectId: 'project-1',
    candidateModelVersionId: 'model-v1',
    status: 'ELIGIBLE_FOR_REVIEW',
    reasons: ['ELIGIBLE_FOR_REVIEW'],
    observed: {
      sampleSize: 20,
      effectiveCount: 10,
      ineffectiveCount: 10,
      brierScore: 0.12,
      accuracy: 0.85,
    },
    policy: {
      policyId: 'predictive-policy',
      policyVersion: 'v1',
      minimumShadowCases: 20,
      minimumEffectiveCases: 5,
      minimumIneffectiveCases: 5,
      maximumBrierScore: 0.2,
      minimumAccuracy: 0.8,
    },
    evidenceRefs: ['case:1', 'case:2'],
    predictiveProbabilityExposed: false,
    rowLevelPredictionsExposed: false,
    decisionAuthority: false,
    executionAuthority: false,
    promotionAuthority: false,
    automaticPromotionAllowed: false,
    humanReviewRequired: true,
    productionPredictionEnabled: false,
    ...overrides,
  }
}

function readiness(overrides = {}) {
  return {
    version: 'prescriptive-readiness-v1',
    projectId: 'project-1',
    candidateModelVersionId: 'model-v1',
    status: 'ELIGIBLE_FOR_HUMAN_REVIEW',
    reasons: ['ELIGIBLE_FOR_HUMAN_REVIEW'],
    evidenceCutoffAt: '2026-09-12T00:00:00.000Z',
    observed: {
      eligibleInterventionCases: 4,
      distinctInterventions: 2,
      positiveOutcomes: 2,
      negativeOutcomes: 2,
    },
    policy: {
      policyId: 'prescriptive-policy',
      policyVersion: 'v1',
      minimumObservedInterventionCases: 4,
      minimumDistinctInterventions: 2,
      minimumPositiveOutcomes: 1,
      minimumNegativeOutcomes: 1,
    },
    evidenceRefs: ['intervention:1', 'intervention:2'],
    recommendationRankingEnabled: false,
    recommendationGenerationEnabled: false,
    causalEffectClaimed: false,
    predictiveProbabilityExposed: false,
    decisionAuthority: false,
    executionAuthority: false,
    autonomousActionAllowed: false,
    humanReviewRequired: true,
    ...overrides,
  }
}

function candidate(overrides = {}) {
  return {
    candidateId: 'candidate-1',
    actionKey: 'REVIEW_DATA_QUALITY_RULE',
    actionPolicyId: 'action-policy',
    actionPolicyVersion: 'v3',
    evidenceRefs: ['finding:1', 'case:1'],
    rationale: 'Evidence-backed candidate for human review only.',
    requiresApproval: true,
    ...overrides,
  }
}

function build(overrides = {}) {
  return buildPrescriptiveReviewGate({
    projectId: 'project-1',
    predictive: predictive(),
    readiness: readiness(),
    candidates: [candidate()],
    ...overrides,
  })
}

test('eligible predictive and prescriptive readiness evidence yields human review only', () => {
  const result = build()
  assert.equal(result.status, 'REVIEW_REQUIRED')
  assert.deepEqual(result.reasons, ['READY_FOR_HUMAN_REVIEW'])
  assert.equal(result.prescriptivePolicyId, 'prescriptive-policy')
  assert.equal(result.candidateRankingApplied, false)
  assert.equal(result.expectedImpactClaimed, false)
  assert.equal(result.causalEffectClaimed, false)
  assert.equal(result.recommendationAuthority, false)
  assert.equal(result.executionAuthority, false)
  assert.equal(result.automaticActionAllowed, false)
  assert.equal(result.currentAuthorizationRequiredAtExecution, true)
  assert.equal(result.humanDecisionRequired, true)
})

test('predictive NOT_READY suppresses prescriptive candidates', () => {
  const result = build({ predictive: predictive({ status: 'NOT_READY', reasons: ['INSUFFICIENT_SHADOW_SAMPLE'] }) })
  assert.equal(result.status, 'NOT_READY')
  assert.deepEqual(result.reasons, ['PREDICTIVE_NOT_ELIGIBLE'])
  assert.deepEqual(result.candidates, [])
})

test('prescriptive readiness NOT_READY suppresses candidates even when predictive evidence is eligible', () => {
  const result = build({ readiness: readiness({ status: 'NOT_READY', reasons: ['INSUFFICIENT_INTERVENTION_SAMPLE'] }) })
  assert.equal(result.status, 'NOT_READY')
  assert.deepEqual(result.reasons, ['PRESCRIPTIVE_READINESS_NOT_ELIGIBLE'])
  assert.deepEqual(result.candidates, [])
})

test('no candidates remains NOT_READY after readiness succeeds', () => {
  const result = build({ candidates: [] })
  assert.equal(result.status, 'NOT_READY')
  assert.deepEqual(result.reasons, ['NO_CANDIDATES'])
})

test('cross-project predictive or readiness evidence is rejected', () => {
  assert.throws(
    () => build({ predictive: predictive({ projectId: 'project-2' }) }),
    /predictive projectId must match projectId/,
  )
  assert.throws(
    () => build({ readiness: readiness({ projectId: 'project-2' }) }),
    /readiness projectId must match projectId/,
  )
})

test('candidate model mismatch between predictive and readiness evidence is rejected', () => {
  assert.throws(
    () => build({ readiness: readiness({ candidateModelVersionId: 'other-model' }) }),
    /readiness candidateModelVersionId must match predictive candidateModelVersionId/,
  )
})

test('authoritative predictive or readiness evidence is rejected', () => {
  assert.throws(
    () => build({ predictive: predictive({ executionAuthority: true }) }),
    /non-authoritative predictive certification evidence/,
  )
  assert.throws(
    () => build({ readiness: readiness({ executionAuthority: true }) }),
    /non-authoritative prescriptive readiness evidence/,
  )
})

test('missing predictive or readiness provenance is rejected', () => {
  assert.throws(
    () => build({ predictive: predictive({ evidenceRefs: [] }) }),
    /Predictive certification evidenceRefs must contain provenance references/,
  )
  assert.throws(
    () => build({ readiness: readiness({ evidenceRefs: [] }) }),
    /Prescriptive readiness evidenceRefs must contain provenance references/,
  )
})

test('candidate without approval or evidence is rejected', () => {
  assert.throws(
    () => build({ candidates: [candidate({ requiresApproval: false })] }),
    /must require approval/,
  )
  assert.throws(
    () => build({ candidates: [candidate({ evidenceRefs: [] })] }),
    /require evidenceRefs/,
  )
})

test('duplicate candidate ids are rejected', () => {
  assert.throws(
    () => build({ candidates: [candidate(), candidate({ actionKey: 'REVIEW_SECOND_RULE' })] }),
    /duplicate prescriptive candidateId/,
  )
})

test('candidate ordering is deterministic and not a ranking claim', () => {
  const result = build({
    candidates: [candidate({ candidateId: 'z' }), candidate({ candidateId: 'a', actionKey: 'REVIEW_SECOND_RULE' })],
  })
  assert.deepEqual(result.candidates.map((item) => item.candidateId), ['a', 'z'])
  assert.equal(result.candidateRankingApplied, false)
})
