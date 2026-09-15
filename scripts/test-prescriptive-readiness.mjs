import assert from 'node:assert/strict'
import test from 'node:test'
import { assessPrescriptiveReadiness } from '../lib/ai/prescriptive-readiness.ts'

const projectId = 'project-1'

function predictive(overrides = {}) {
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
    evidenceRefs: ['shadow:evidence'],
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

function outcome(id, interventionKey, observedOutcome, overrides = {}) {
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
    evidenceRefs: [`intervention:${id}`],
    ...overrides,
  }
}

function policy(overrides = {}) {
  return {
    policyId: 'prescriptive-policy',
    policyVersion: '1',
    minimumObservedInterventionCases: 4,
    minimumDistinctInterventions: 2,
    minimumPositiveOutcomes: 1,
    minimumNegativeOutcomes: 1,
    ...overrides,
  }
}

function baseInput(overrides = {}) {
  return {
    projectId,
    predictiveCertification: predictive(),
    interventionOutcomes: [
      outcome('1', 'RULE_REMEDIATION', 'EFFECTIVE'),
      outcome('2', 'RULE_REMEDIATION', 'FAILED'),
      outcome('3', 'SCHEMA_REMEDIATION', 'EFFECTIVE'),
      outcome('4', 'SCHEMA_REMEDIATION', 'INEFFECTIVE'),
    ],
    evidenceCutoffAt: '2026-09-12T00:00:00.000Z',
    policy: policy(),
    ...overrides,
  }
}

test('eligible evidence can reach human review without recommendation or execution authority', () => {
  const result = assessPrescriptiveReadiness(baseInput())
  assert.equal(result.status, 'ELIGIBLE_FOR_HUMAN_REVIEW')
  assert.deepEqual(result.reasons, ['ELIGIBLE_FOR_HUMAN_REVIEW'])
  assert.equal(result.observed.eligibleInterventionCases, 4)
  assert.equal(result.observed.distinctInterventions, 2)
  assert.equal(result.recommendationRankingEnabled, false)
  assert.equal(result.recommendationGenerationEnabled, false)
  assert.equal(result.causalEffectClaimed, false)
  assert.equal(result.decisionAuthority, false)
  assert.equal(result.executionAuthority, false)
  assert.equal(result.autonomousActionAllowed, false)
  assert.equal(result.humanReviewRequired, true)
})

test('predictive certification NOT_READY fails closed', () => {
  const result = assessPrescriptiveReadiness(baseInput({ predictiveCertification: predictive({ status: 'NOT_READY', reasons: ['ACCURACY_TOO_LOW'] }) }))
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('PREDICTIVE_CERTIFICATION_NOT_ELIGIBLE'))
})

test('synthetic, unpersisted, unadjudicated and foreign-project outcomes are excluded', () => {
  const result = assessPrescriptiveReadiness(baseInput({
    interventionOutcomes: [
      outcome('1', 'A', 'EFFECTIVE'),
      outcome('2', 'B', 'FAILED', { syntheticOrTest: true }),
      outcome('3', 'C', 'FAILED', { persisted: false }),
      outcome('4', 'D', 'FAILED', { adjudicated: false }),
      outcome('5', 'E', 'FAILED', { projectId: 'foreign-project' }),
    ],
  }))
  assert.equal(result.observed.eligibleInterventionCases, 1)
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('INSUFFICIENT_INTERVENTION_SAMPLE'))
})

test('future observed or evidence-available rows are excluded by evidence cutoff', () => {
  const result = assessPrescriptiveReadiness(baseInput({
    interventionOutcomes: [
      outcome('1', 'A', 'EFFECTIVE'),
      outcome('2', 'B', 'FAILED', { observedAt: '2026-09-13T00:00:00.000Z' }),
      outcome('3', 'B', 'FAILED', { evidenceAvailableAt: '2026-09-13T00:00:00.000Z' }),
    ],
  }))
  assert.equal(result.observed.eligibleInterventionCases, 1)
  assert.equal(result.status, 'NOT_READY')
})

test('insufficient intervention diversity fails closed', () => {
  const result = assessPrescriptiveReadiness(baseInput({
    interventionOutcomes: [
      outcome('1', 'SAME', 'EFFECTIVE'),
      outcome('2', 'SAME', 'FAILED'),
      outcome('3', 'SAME', 'EFFECTIVE'),
      outcome('4', 'SAME', 'FAILED'),
    ],
  }))
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('INSUFFICIENT_INTERVENTION_DIVERSITY'))
})

test('single-class outcome evidence fails closed', () => {
  const result = assessPrescriptiveReadiness(baseInput({
    interventionOutcomes: [
      outcome('1', 'A', 'EFFECTIVE'),
      outcome('2', 'A', 'EFFECTIVE'),
      outcome('3', 'B', 'PARTIAL'),
      outcome('4', 'B', 'EFFECTIVE'),
    ],
  }))
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('INSUFFICIENT_OUTCOME_CLASS_COVERAGE'))
})

test('duplicate intervention outcome identity fails closed', () => {
  assert.throws(
    () => assessPrescriptiveReadiness(baseInput({ interventionOutcomes: [outcome('1', 'A', 'EFFECTIVE'), outcome('1', 'B', 'FAILED')] })),
    /duplicate intervention outcome id/,
  )
})

test('authoritative predictive evidence is rejected', () => {
  assert.throws(
    () => assessPrescriptiveReadiness(baseInput({ predictiveCertification: predictive({ productionPredictionEnabled: true }) })),
    /non-authoritative predictive certification evidence/,
  )
})

test('project mismatch fails closed', () => {
  assert.throws(
    () => assessPrescriptiveReadiness(baseInput({ predictiveCertification: predictive({ projectId: 'foreign-project' }) })),
    /projectId must match/,
  )
})

test('anonymous policy provenance is rejected', () => {
  assert.throws(
    () => assessPrescriptiveReadiness(baseInput({ policy: policy({ policyId: '' }) })),
    /policyId is required/,
  )
})
