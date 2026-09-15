import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateGovernedShadowPredictions } from '../lib/ai/governed-shadow-evaluation.ts'

const projectId = 'project-1'

function evaluationCase(caseId, effective, verifiedAt, evidenceRef) {
  return {
    caseId,
    projectId,
    sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING',
    sourceAgentRunId: `run-${caseId}`,
    problemType: 'dq-remediation',
    context: {},
    verifiedOutcome: {
      effective,
      effectiveness: effective ? 0.9 : 0.1,
      confidence: 0.95,
      checks: { verification: { passed: effective } },
      verifiedAt,
      verificationAgentRunId: `verify-${caseId}`,
      verificationJobId: null,
    },
    evidenceRefs: [evidenceRef],
  }
}

function baseDataset() {
  return {
    datasetKind: 'verified_production_cases',
    projectId,
    sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING',
    generatedAt: '2026-09-15T00:00:00.000Z',
    cases: [
      evaluationCase('train-positive', true, '2026-09-01T00:00:00.000Z', 'evidence:train-positive'),
      evaluationCase('train-negative', false, '2026-09-02T00:00:00.000Z', 'evidence:train-negative'),
      evaluationCase('eval-positive', true, '2026-09-10T00:00:00.000Z', 'evidence:eval-positive'),
      evaluationCase('eval-negative', false, '2026-09-11T00:00:00.000Z', 'evidence:eval-negative'),
    ],
  }
}

function ready() {
  return {
    version: 'governed-backtest-v1',
    projectId,
    status: 'READY',
    reasons: ['READY'],
    trainingCutoffAt: '2026-09-05T00:00:00.000Z',
    evaluationEndAt: '2026-09-12T00:00:00.000Z',
    training: {
      caseIds: ['train-positive', 'train-negative'],
      sampleSize: 2,
      effectiveCount: 1,
      ineffectiveCount: 1,
      earliestVerifiedAt: '2026-09-01T00:00:00.000Z',
      latestVerifiedAt: '2026-09-02T00:00:00.000Z',
    },
    evaluation: {
      caseIds: ['eval-positive', 'eval-negative'],
      sampleSize: 2,
      effectiveCount: 1,
      ineffectiveCount: 1,
      earliestVerifiedAt: '2026-09-10T00:00:00.000Z',
      latestVerifiedAt: '2026-09-11T00:00:00.000Z',
    },
    evidenceRefs: ['evidence:eval-negative', 'evidence:eval-positive'],
    predictiveProbabilityExposed: false,
    shadowDecisionAuthority: false,
    historicalOutcomeOnly: true,
  }
}

function evaluate(overrides = {}) {
  return evaluateGovernedShadowPredictions({
    projectId,
    dataset: baseDataset(),
    readiness: ready(),
    candidateModelVersionId: 'candidate-v1',
    predictions: [
      { caseId: 'eval-positive', predictedEffectiveProbability: 0.8 },
      { caseId: 'eval-negative', predictedEffectiveProbability: 0.3 },
    ],
    ...overrides,
  })
}

test('computes aggregate shadow metrics without exposing row-level probabilities or authority', () => {
  const result = evaluate()
  assert.equal(result.status, 'EVALUATED')
  assert.equal(result.sampleSize, 2)
  assert.equal(result.effectiveCount, 1)
  assert.equal(result.ineffectiveCount, 1)
  assert.equal(result.brierScore, 0.065)
  assert.equal(result.accuracy, 1)
  assert.deepEqual(result.confusionMatrix, {
    truePositive: 1,
    falsePositive: 0,
    trueNegative: 1,
    falseNegative: 0,
  })
  assert.deepEqual(result.evidenceRefs, ['evidence:eval-negative', 'evidence:eval-positive'])
  assert.equal(result.predictiveProbabilityExposed, false)
  assert.equal(result.rowLevelPredictionsExposed, false)
  assert.equal(result.shadowDecisionAuthority, false)
  assert.equal(result.executionAuthority, false)
  assert.equal(result.promotionAuthority, false)
  assert.equal(result.historicalOutcomeOnly, true)
  assert.equal('predictions' in result, false)
})

test('NOT_READY backtesting fails closed', () => {
  const readiness = { ...ready(), status: 'NOT_READY', reasons: ['INSUFFICIENT_EVALUATION_CASES'] }
  assert.throws(() => evaluate({ readiness }), /must be READY/)
})

test('project boundary mismatch fails closed', () => {
  assert.throws(() => evaluate({ projectId: 'project-2' }), /dataset projectId must match projectId/)
})

test('missing evaluation prediction fails closed', () => {
  assert.throws(() => evaluate({ predictions: [{ caseId: 'eval-positive', predictedEffectiveProbability: 0.8 }] }), /cover every governed evaluation case exactly once/)
})

test('duplicate evaluation prediction fails closed', () => {
  assert.throws(() => evaluate({ predictions: [
    { caseId: 'eval-positive', predictedEffectiveProbability: 0.8 },
    { caseId: 'eval-positive', predictedEffectiveProbability: 0.7 },
    { caseId: 'eval-negative', predictedEffectiveProbability: 0.3 },
  ] }), /duplicate shadow prediction/)
})

test('training or out-of-window case cannot enter shadow evaluation', () => {
  assert.throws(() => evaluate({ predictions: [
    { caseId: 'eval-positive', predictedEffectiveProbability: 0.8 },
    { caseId: 'train-negative', predictedEffectiveProbability: 0.3 },
  ] }), /outside governed evaluation partition/)
})

test('invalid probability fails closed', () => {
  assert.throws(() => evaluate({ predictions: [
    { caseId: 'eval-positive', predictedEffectiveProbability: 1.2 },
    { caseId: 'eval-negative', predictedEffectiveProbability: 0.3 },
  ] }), /between 0 and 1/)
})

test('readiness cannot smuggle an out-of-window evaluation case', () => {
  const readiness = ready()
  readiness.evaluation = {
    ...readiness.evaluation,
    caseIds: ['eval-positive', 'train-negative'],
  }
  assert.throws(() => evaluate({ readiness, predictions: [
    { caseId: 'eval-positive', predictedEffectiveProbability: 0.8 },
    { caseId: 'train-negative', predictedEffectiveProbability: 0.3 },
  ] }), /outside governed holdout window/)
})
