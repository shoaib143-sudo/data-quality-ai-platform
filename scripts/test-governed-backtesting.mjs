import assert from 'node:assert/strict'
import test from 'node:test'
import { VerifiedEvaluationDatasetBuilder } from '../lib/ai/evaluation-dataset.ts'
import { buildGovernedBacktestReadiness } from '../lib/ai/governed-backtesting.ts'

function learningCase(id, sourceId, verifiedAt, effectiveness, evidence = {}) {
  return {
    id,
    project_id: 'project-1',
    source_agent_run_id: `run-${id}`,
    case_key: `case-${id}`,
    source_kind: 'DATA_QUALITY_RECOMMENDATION_LEARNING',
    problem_type: 'DQ_RULE',
    context: {},
    decision_status: 'VERIFIED',
    outcome_status: 'VERIFIED',
    effectiveness,
    confidence: 0.9,
    evidence: { source_id: sourceId, ...evidence },
    status: 'ACTIVE',
    occurred_at: verifiedAt,
  }
}

function learningRow(id, caseId, effective, verifiedAt, checks = { result: { passed: effective } }) {
  return {
    id,
    project_id: 'project-1',
    workflow_instance_id: `workflow-${caseId}`,
    remediation_outcome_id: `outcome-${caseId}`,
    source_agent_run_id: `run-${caseId}`,
    verification_agent_run_id: `verify-${caseId}`,
    status: 'VERIFIED',
    effective,
    evidence: {},
    outcome: {
      id: `outcome-${caseId}`,
      status: 'VERIFIED',
      verified_at: verifiedAt,
      verification_job_id: null,
      verification_agent_run_id: `verify-${caseId}`,
      checks,
    },
  }
}

test('verified evaluation dataset preserves both positive and negative outcomes', async () => {
  const candidates = [
    learningCase('positive', 'learning-positive', '2026-01-01T00:00:00Z', 1),
    learningCase('negative', 'learning-negative', '2026-01-02T00:00:00Z', 0),
  ]
  const learning = [
    learningRow('learning-positive', 'positive', true, '2026-01-03T00:00:00Z'),
    learningRow('learning-negative', 'negative', false, '2026-01-04T00:00:00Z'),
  ]
  const builder = new VerifiedEvaluationDatasetBuilder({
    async listLearningCases() { return candidates },
    async listDataQualityLearning() { return learning },
  })

  const dataset = await builder.build({ projectId: 'project-1' })
  assert.equal(dataset.cases.length, 2)
  assert.deepEqual(dataset.cases.map((item) => item.verifiedOutcome.effective).sort(), [false, true])
  assert.equal(dataset.cases.find((item) => item.caseId === 'negative')?.verifiedOutcome.effectiveness, 0)
})

test('incomplete verification evidence fails closed', async () => {
  const builder = new VerifiedEvaluationDatasetBuilder({
    async listLearningCases() {
      return [learningCase('bad', 'learning-bad', '2026-01-01T00:00:00Z', 0)]
    },
    async listDataQualityLearning() {
      return [learningRow('learning-bad', 'bad', false, '2026-01-02T00:00:00Z', { result: { note: 'missing passed boolean' } })]
    },
  })
  const dataset = await builder.build({ projectId: 'project-1' })
  assert.equal(dataset.cases.length, 0)
})

test('synthetic bootstrap learning cases remain excluded', async () => {
  const builder = new VerifiedEvaluationDatasetBuilder({
    async listLearningCases() {
      return [learningCase('synthetic', 'learning-synthetic', '2026-01-01T00:00:00Z', 1, { synthetic_bootstrap: true })]
    },
    async listDataQualityLearning() {
      throw new Error('synthetic candidates must not be queried')
    },
  })
  const dataset = await builder.build({ projectId: 'project-1' })
  assert.equal(dataset.cases.length, 0)
})

test('backtest uses a strict temporal holdout and requires both outcome classes', () => {
  const dataset = {
    datasetKind: 'verified_production_cases',
    projectId: 'project-1',
    cases: [
      { caseId: 'train-positive', projectId: 'project-1', sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING', problemType: 'DQ', context: {}, verifiedOutcome: { effective: true, effectiveness: 1, confidence: 1, checks: { x: { passed: true } }, verifiedAt: '2026-01-01T00:00:00.000Z' }, evidence: {}, evidenceRefs: ['case:train-positive'], occurredAt: null },
      { caseId: 'train-negative', projectId: 'project-1', sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING', problemType: 'DQ', context: {}, verifiedOutcome: { effective: false, effectiveness: 0, confidence: 1, checks: { x: { passed: false } }, verifiedAt: '2026-01-02T00:00:00.000Z' }, evidence: {}, evidenceRefs: ['case:train-negative'], occurredAt: null },
      { caseId: 'eval-positive', projectId: 'project-1', sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING', problemType: 'DQ', context: {}, verifiedOutcome: { effective: true, effectiveness: 1, confidence: 1, checks: { x: { passed: true } }, verifiedAt: '2026-02-01T00:00:00.000Z' }, evidence: {}, evidenceRefs: ['case:eval-positive'], occurredAt: null },
      { caseId: 'eval-negative', projectId: 'project-1', sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING', problemType: 'DQ', context: {}, verifiedOutcome: { effective: false, effectiveness: 0, confidence: 1, checks: { x: { passed: false } }, verifiedAt: '2026-02-02T00:00:00.000Z' }, evidence: {}, evidenceRefs: ['case:eval-negative'], occurredAt: null },
      { caseId: 'future', projectId: 'project-1', sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING', problemType: 'DQ', context: {}, verifiedOutcome: { effective: true, effectiveness: 1, confidence: 1, checks: { x: { passed: true } }, verifiedAt: '2026-03-01T00:00:00.000Z' }, evidence: {}, evidenceRefs: ['case:future'], occurredAt: null },
    ],
  }

  const result = buildGovernedBacktestReadiness({
    projectId: 'project-1',
    dataset,
    trainingCutoffAt: '2026-01-31T23:59:59Z',
    evaluationEndAt: '2026-02-28T23:59:59Z',
    minimumTrainingCases: 2,
    minimumEvaluationCases: 2,
  })

  assert.equal(result.status, 'READY')
  assert.deepEqual(result.training.caseIds, ['train-positive', 'train-negative'])
  assert.deepEqual(result.evaluation.caseIds, ['eval-positive', 'eval-negative'])
  assert.equal(result.evidenceRefs.includes('case:future'), false)
  assert.equal(result.predictiveProbabilityExposed, false)
  assert.equal(result.shadowDecisionAuthority, false)
})

test('single-class history is not ready for backtesting', () => {
  const dataset = {
    datasetKind: 'verified_production_cases',
    projectId: 'project-1',
    cases: [
      { caseId: 'train-positive', projectId: 'project-1', sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING', problemType: 'DQ', context: {}, verifiedOutcome: { effective: true, effectiveness: 1, confidence: 1, checks: { x: { passed: true } }, verifiedAt: '2026-01-01T00:00:00.000Z' }, evidence: {}, evidenceRefs: [], occurredAt: null },
      { caseId: 'eval-positive', projectId: 'project-1', sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING', problemType: 'DQ', context: {}, verifiedOutcome: { effective: true, effectiveness: 1, confidence: 1, checks: { x: { passed: true } }, verifiedAt: '2026-02-01T00:00:00.000Z' }, evidence: {}, evidenceRefs: [], occurredAt: null },
    ],
  }
  const result = buildGovernedBacktestReadiness({ projectId: 'project-1', dataset, trainingCutoffAt: '2026-01-31T23:59:59Z', evaluationEndAt: '2026-02-28T23:59:59Z', minimumTrainingCases: 1, minimumEvaluationCases: 1 })
  assert.equal(result.status, 'NOT_READY')
  assert.ok(result.reasons.includes('TRAINING_CLASS_COLLAPSE'))
  assert.ok(result.reasons.includes('EVALUATION_CLASS_COLLAPSE'))
})
