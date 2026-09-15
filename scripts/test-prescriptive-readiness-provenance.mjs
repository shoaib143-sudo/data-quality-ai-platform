import assert from 'node:assert/strict'
import test from 'node:test'
import { assessPrescriptiveReadiness } from '../lib/ai/prescriptive-readiness.ts'

const projectId = 'project-1'

function predictive(evidenceRefs = ['shadow:evidence']) {
  return {
    version: 'predictive-certification-v1',
    projectId,
    candidateModelVersionId: 'candidate-v1',
    status: 'ELIGIBLE_FOR_REVIEW',
    reasons: ['ELIGIBLE_FOR_REVIEW'],
    observed: { sampleSize: 20, effectiveCount: 10, ineffectiveCount: 10, brierScore: 0.1, accuracy: 0.9 },
    policy: {
      policyId: 'predictive-policy',
      policyVersion: '1',
      minimumShadowCases: 20,
      minimumEffectiveCases: 5,
      minimumIneffectiveCases: 5,
      maximumBrierScore: 0.2,
      minimumAccuracy: 0.8,
    },
    evidenceRefs,
    predictiveProbabilityExposed: false,
    rowLevelPredictionsExposed: false,
    decisionAuthority: false,
    executionAuthority: false,
    promotionAuthority: false,
    automaticPromotionAllowed: false,
    humanReviewRequired: true,
    productionPredictionEnabled: false,
  }
}

function outcome(id, interventionKey, observedOutcome, evidenceRefs = [`intervention:${id}`]) {
  return {
    id,
    projectId,
    interventionKey,
    persisted: true,
    syntheticOrTest: false,
    adjudicated: true,
    observedOutcome,
    observedAt: '2026-09-10T00:00:00.000Z',
    evidenceAvailableAt: '2026-09-11T00:00:00.000Z',
    evidenceRefs,
  }
}

const policy = {
  policyId: 'prescriptive-policy',
  policyVersion: '1',
  minimumObservedInterventionCases: 2,
  minimumDistinctInterventions: 2,
  minimumPositiveOutcomes: 1,
  minimumNegativeOutcomes: 1,
}

test('predictive certification without provenance fails closed', () => {
  assert.throws(
    () => assessPrescriptiveReadiness({
      projectId,
      predictiveCertification: predictive([]),
      interventionOutcomes: [outcome('1', 'A', 'EFFECTIVE'), outcome('2', 'B', 'FAILED')],
      evidenceCutoffAt: '2026-09-12T00:00:00.000Z',
      policy,
    }),
    /Predictive certification evidenceRefs must contain provenance references/,
  )
})

test('intervention outcomes without provenance do not count toward readiness', () => {
  const result = assessPrescriptiveReadiness({
    projectId,
    predictiveCertification: predictive(),
    interventionOutcomes: [
      outcome('1', 'A', 'EFFECTIVE', []),
      outcome('2', 'B', 'FAILED'),
    ],
    evidenceCutoffAt: '2026-09-12T00:00:00.000Z',
    policy,
  })

  assert.equal(result.observed.eligibleInterventionCases, 1)
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('INSUFFICIENT_INTERVENTION_SAMPLE'))
})
