import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGovernanceOutcomeReport, computeTransparentOverallScore } from '../lib/orchestration/governance-outcome-report.ts'

const evidence = (id) => [{ type: 'CONTROL_EVALUATION', id }]

function baseInput() {
  return {
    reportId: 'report-1',
    projectId: 'project-1',
    orchestratorRunId: 'run-1',
    capabilityRunId: 'capability-run-1',
    generatedAt: '2026-09-16T00:00:00.000Z',
    persona: 'EXECUTIVE',
    depth: 'EXECUTIVE',
    scores: {
      governanceHealth: { status: 'MEASURED', value: 80, evidenceRefs: evidence('g1'), method: 'CONTROL_SCORE' },
      businessImpact: { status: 'MODEL_DERIVED', value: 60, evidenceRefs: evidence('b1'), method: 'GOVERNED_IMPACT_MODEL_V1' },
      riskReduction: { status: 'MEASURED', value: 70, evidenceRefs: evidence('r1'), method: 'BEFORE_AFTER_RISK' },
      compliancePosture: { status: 'MEASURED', value: 90, evidenceRefs: evidence('c1'), method: 'CONTROL_COVERAGE' },
      dataQualityImprovement: { status: 'MEASURED', value: 100, evidenceRefs: evidence('d1'), method: 'QUALITY_SCORE_DELTA' },
    },
    aggregationPolicy: { method: 'EQUAL_WEIGHT_EVIDENCED_DIMENSIONS', policyId: 'test-equal-v1' },
    narrativePolicy: {
      policyId: 'test-narrative-v1',
      bands: [
        { maxInclusive: 59, statement: 'Governed critical-material posture.' },
        { maxInclusive: 79, statement: 'Governed material-risk posture.' },
        { maxInclusive: 89, statement: 'Governed controlled-with-priorities posture.' },
      ],
      aboveMaximumStatement: 'Governed strong posture.',
    },
    findings: [
      { id: 'risk-2', title: 'Secondary risk', severity: 'MEDIUM', priorityRank: 2, status: 'UNRESOLVED', evidenceRefs: evidence('risk-2') },
      { id: 'risk-1', title: 'Primary risk', severity: 'CRITICAL', priorityRank: 1, status: 'UNRESOLVED', evidenceRefs: evidence('risk-1') },
      { id: 'risk-3', title: 'Resolved risk', severity: 'HIGH', priorityRank: 0, status: 'RESOLVED', evidenceRefs: evidence('risk-3') },
    ],
    businessImpact: [
      { id: 'impact-1', statement: 'Measured impact', status: 'MEASURED', evidenceRefs: evidence('impact-1'), value: 42, unit: 'records', method: 'COUNT_DELTA' },
      { id: 'impact-2', statement: 'Unsupported impact', status: 'MODEL_DERIVED', evidenceRefs: [], value: 1, unit: 'USD', method: 'UNKNOWN' },
    ],
    autonomousActivity: { totalAgentTasks: 12, autonomousActions: 5, humanInterventions: 0, changesRevalidated: 5, unresolvedIssues: 999 },
    certificationEligible: false,
    certificationCoveragePct: 72,
    evidenceRefs: evidence('run'),
  }
}

test('overall score requires an explicit governed aggregation policy', () => {
  const input = baseInput()
  delete input.aggregationPolicy
  const report = buildGovernanceOutcomeReport(input)
  assert.equal(report.scores.overall.status, 'NOT_MEASURED')
  assert.equal(report.scores.overall.value, null)
  assert.equal(report.scores.overall.method, 'GOVERNED_AGGREGATION_POLICY_REQUIRED')
})

test('explicit equal-weight policy aggregates evidenced dimensions only', () => {
  const report = buildGovernanceOutcomeReport(baseInput())
  assert.equal(report.scores.overall.value, 80)
  assert.equal(report.scores.overall.status, 'MODEL_DERIVED')
  assert.equal(report.scores.overall.method, 'EQUAL_WEIGHT_EVIDENCED_DIMENSIONS:test-equal-v1:5')
})

test('unsupported score is NOT_MEASURED and cannot inflate explicit evidenced-dimension aggregation', () => {
  const input = baseInput()
  input.scores.businessImpact = { status: 'MEASURED', value: 100, evidenceRefs: [], method: 'UNSUPPORTED' }
  const report = buildGovernanceOutcomeReport(input)
  assert.equal(report.scores.businessImpact.status, 'NOT_MEASURED')
  assert.equal(report.scores.businessImpact.value, null)
  assert.equal(report.scores.overall.value, 85)
  assert.equal(report.scores.overall.method, 'EQUAL_WEIGHT_EVIDENCED_DIMENSIONS:test-equal-v1:4')
})

test('governed weighted aggregation fails closed if a weighted dimension is unmeasured', () => {
  const input = baseInput()
  input.aggregationPolicy = {
    method: 'GOVERNED_WEIGHTS',
    policyId: 'weighted-v1',
    weights: { governanceHealth: 0.7, businessImpact: 0.3 },
  }
  input.scores.businessImpact = { status: 'NOT_MEASURED', value: null, evidenceRefs: [], method: 'NOT_MEASURED' }
  const report = buildGovernanceOutcomeReport(input)
  assert.equal(report.scores.overall.status, 'NOT_MEASURED')
  assert.equal(report.scores.overall.method, 'INCOMPLETE_GOVERNED_WEIGHT_INPUTS:weighted-v1')
})

test('invalid numeric score fails closed as NOT_MEASURED', () => {
  const input = baseInput()
  input.scores.riskReduction = { status: 'MEASURED', value: 101, evidenceRefs: evidence('bad'), method: 'BAD' }
  const report = buildGovernanceOutcomeReport(input)
  assert.equal(report.scores.riskReduction.status, 'NOT_MEASURED')
  assert.equal(report.scores.riskReduction.value, null)
})

test('unsupported business impact claim is omitted', () => {
  const report = buildGovernanceOutcomeReport(baseInput())
  assert.deepEqual(report.businessImpact.map(claim => claim.id), ['impact-1'])
})

test('highest-priority unresolved evidenced risk drives executive priority', () => {
  const report = buildGovernanceOutcomeReport(baseInput())
  assert.equal(report.mostImportantRisk?.id, 'risk-1')
  assert.match(report.openingSummary, /Primary risk/)
})

test('narrative posture comes only from governed narrative policy', () => {
  const input = baseInput()
  const governed = buildGovernanceOutcomeReport(input)
  assert.match(governed.openingSummary, /controlled-with-priorities/)

  delete input.narrativePolicy
  const neutral = buildGovernanceOutcomeReport(input)
  assert.match(neutral.openingSummary, /no governed narrative severity policy is configured/)
  assert.doesNotMatch(neutral.openingSummary, /critical governance posture|urgent executive attention|strong governance posture/)
})

test('unresolved statement and autonomous summary are recomputed from findings', () => {
  const report = buildGovernanceOutcomeReport(baseInput())
  assert.equal(report.unresolvedStatement, '2 issues remain unresolved.')
  assert.equal(report.autonomousActivity.unresolvedIssues, 2)
})

test('persona changes presentation but not canonical facts', () => {
  const executive = buildGovernanceOutcomeReport(baseInput())
  const stewardInput = baseInput(); stewardInput.persona = 'DATA_STEWARD'; stewardInput.depth = 'GOVERNANCE'
  const steward = buildGovernanceOutcomeReport(stewardInput)
  assert.notEqual(executive.openingSummary, steward.openingSummary)
  assert.deepEqual(executive.scores, steward.scores)
  assert.deepEqual(executive.findings, steward.findings)
  assert.deepEqual(executive.businessImpact, steward.businessImpact)
})

test('certification remains incomplete when canonical certification is ineligible', () => {
  const report = buildGovernanceOutcomeReport(baseInput())
  assert.match(report.assuranceStatement, /not complete/)
  assert.match(report.assuranceStatement, /72%/)
})

test('no measured dimensions produces NOT_MEASURED overall', () => {
  const overall = computeTransparentOverallScore([], { method: 'EQUAL_WEIGHT_EVIDENCED_DIMENSIONS', policyId: 'empty-v1' })
  assert.equal(overall.status, 'NOT_MEASURED')
  assert.equal(overall.value, null)
})
