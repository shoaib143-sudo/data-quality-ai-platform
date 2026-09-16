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

test('overall score is transparent arithmetic mean of evidenced dimensions only', () => {
  const report = buildGovernanceOutcomeReport(baseInput())
  assert.equal(report.scores.overall.value, 80)
  assert.equal(report.scores.overall.status, 'MODEL_DERIVED')
  assert.equal(report.scores.overall.method, 'ARITHMETIC_MEAN_OF_5_MEASURED_DIMENSIONS')
})

test('unsupported score is NOT_MEASURED and cannot inflate average', () => {
  const input = baseInput()
  input.scores.businessImpact = { status: 'MEASURED', value: 100, evidenceRefs: [], method: 'UNSUPPORTED' }
  const report = buildGovernanceOutcomeReport(input)
  assert.equal(report.scores.businessImpact.status, 'NOT_MEASURED')
  assert.equal(report.scores.businessImpact.value, null)
  assert.equal(report.scores.overall.value, 85)
  assert.equal(report.scores.overall.method, 'ARITHMETIC_MEAN_OF_4_MEASURED_DIMENSIONS')
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
  const overall = computeTransparentOverallScore([])
  assert.equal(overall.status, 'NOT_MEASURED')
  assert.equal(overall.value, null)
})
