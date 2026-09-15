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

test('eligible predictive evidence yields human review only', () => {
  const result = buildPrescriptiveReviewGate({
    projectId: 'project-1',
    predictive: predictive(),
    candidates: [candidate()],
  })
  assert.equal(result.status, 'REVIEW_REQUIRED')
  assert.deepEqual(result.reasons, ['READY_FOR_HUMAN_REVIEW'])
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
  const result = buildPrescriptiveReviewGate({
    projectId: 'project-1',
    predictive: predictive({ status: 'NOT_READY', reasons: ['INSUFFICIENT_SHADOW_SAMPLE'] }),
    candidates: [candidate()],
  })
  assert.equal(result.status, 'NOT_READY')
  assert.deepEqual(result.reasons, ['PREDICTIVE_NOT_ELIGIBLE'])
  assert.deepEqual(result.candidates, [])
})

test('no candidates remains NOT_READY', () => {
  const result = buildPrescriptiveReviewGate({ projectId: 'project-1', predictive: predictive(), candidates: [] })
  assert.equal(result.status, 'NOT_READY')
  assert.deepEqual(result.reasons, ['NO_CANDIDATES'])
})

test('cross-project predictive evidence is rejected', () => {
  assert.throws(
    () => buildPrescriptiveReviewGate({ projectId: 'project-1', predictive: predictive({ projectId: 'project-2' }), candidates: [candidate()] }),
    /predictive projectId must match projectId/,
  )
})

test('authoritative predictive evidence is rejected', () => {
  assert.throws(
    () => buildPrescriptiveReviewGate({ projectId: 'project-1', predictive: predictive({ executionAuthority: true }), candidates: [candidate()] }),
    /non-authoritative predictive certification evidence/,
  )
  assert.throws(
    () => buildPrescriptiveReviewGate({ projectId: 'project-1', predictive: predictive({ productionPredictionEnabled: true }), candidates: [candidate()] }),
    /non-authoritative predictive certification evidence/,
  )
})

test('candidate without approval or evidence is rejected', () => {
  assert.throws(
    () => buildPrescriptiveReviewGate({ projectId: 'project-1', predictive: predictive(), candidates: [candidate({ requiresApproval: false })] }),
    /must require approval/,
  )
  assert.throws(
    () => buildPrescriptiveReviewGate({ projectId: 'project-1', predictive: predictive(), candidates: [candidate({ evidenceRefs: [] })] }),
    /require evidenceRefs/,
  )
})

test('duplicate candidate ids are rejected', () => {
  assert.throws(
    () => buildPrescriptiveReviewGate({
      projectId: 'project-1',
      predictive: predictive(),
      candidates: [candidate(), candidate({ actionKey: 'REVIEW_SECOND_RULE' })],
    }),
    /duplicate prescriptive candidateId/,
  )
})

test('candidate ordering is deterministic and not a ranking claim', () => {
  const result = buildPrescriptiveReviewGate({
    projectId: 'project-1',
    predictive: predictive(),
    candidates: [candidate({ candidateId: 'z' }), candidate({ candidateId: 'a', actionKey: 'REVIEW_SECOND_RULE' })],
  })
  assert.deepEqual(result.candidates.map((item) => item.candidateId), ['a', 'z'])
  assert.equal(result.candidateRankingApplied, false)
})
