import assert from 'node:assert/strict'
import test from 'node:test'

const { aggregateGovernanceOutcomeHistory } = await import('../lib/analytics/governance-history-contract.ts')

test('aggregates executive outcome history from persisted evidence-backed reports', () => {
  const rows = [
    {
      createdAt: '2026-09-18T10:00:00Z',
      report: {
        scores: { overall: { status: 'MEASURED', value: 80 } },
        autonomousActivity: {
          unresolvedIssues: 2,
          autonomousActions: 4,
          humanInterventions: 1,
          changesRevalidated: 3,
        },
        findings: [
          { status: 'UNRESOLVED', severity: 'CRITICAL' },
          { status: 'RESOLVED', severity: 'HIGH' },
        ],
      },
    },
    {
      createdAt: '2026-09-18T12:00:00Z',
      report: {
        scores: { overall: { status: 'MODEL_DERIVED', value: 90 } },
        autonomousActivity: {
          unresolvedIssues: 1,
          autonomousActions: 2,
          humanInterventions: 0,
          changesRevalidated: 1,
        },
        findings: [{ status: 'BLOCKED', severity: 'HIGH' }],
      },
    },
    {
      createdAt: '2026-09-19T12:00:00Z',
      report: {
        scores: { overall: { status: 'NOT_MEASURED', value: 99 } },
        autonomousActivity: {
          unresolvedIssues: 0,
          autonomousActions: 1,
          humanInterventions: 0,
          changesRevalidated: 1,
        },
        findings: [],
      },
    },
  ]

  const result = aggregateGovernanceOutcomeHistory(rows)
  assert.equal(result.length, 2)
  assert.equal(result[0].reportCount, 2)
  assert.equal(result[0].measuredOverallAverage, 85)
  assert.equal(result[0].unresolvedIssues, 3)
  assert.equal(result[0].autonomousActions, 6)
  assert.equal(result[0].criticalFindings, 1)
  assert.equal(result[0].highFindings, 1)
  assert.equal(result[1].measuredOverallAverage, null)
})

test('ignores malformed historical rows rather than fabricating values', () => {
  const result = aggregateGovernanceOutcomeHistory([
    { createdAt: 'bad', report: {} },
    { createdAt: '2026-09-19T00:00:00Z', report: { scores: { overall: { status: 'MEASURED', value: '100' } } } },
  ])

  assert.equal(result.length, 1)
  assert.equal(result[0].measuredOverallAverage, null)
  assert.equal(result[0].reportCount, 1)
})
