import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const { aggregateGovernanceOutcomeHistory, normalizeGovernanceOutcomeHistoryRows } = await import('../lib/analytics/governance-history-contract.ts')

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


test('normalizes database aggregated outcome-history rows without fabricating invalid values', () => {
  const result = normalizeGovernanceOutcomeHistoryRows([
    {
      bucket_start: '2026-09-18T00:00:00+00:00',
      report_count: '12',
      measured_overall_average: '87.1250',
      unresolved_issues: '3',
      autonomous_actions: '8',
      human_interventions: '2',
      changes_revalidated: '6',
      critical_findings: '1',
      high_findings: '4',
    },
    {
      bucket_start: '2026-09-19T00:00:00+00:00',
      report_count: '-1',
      measured_overall_average: null,
      unresolved_issues: '0',
      autonomous_actions: '0',
      human_interventions: '0',
      changes_revalidated: '0',
      critical_findings: '0',
      high_findings: '0',
    },
  ])

  assert.equal(result.length, 1)
  assert.equal(result[0].reportCount, 12)
  assert.equal(result[0].measuredOverallAverage, 87.125)
  assert.equal(result[0].criticalFindings, 1)
})

test('outcome history RPC is project scoped, range bounded and service-role only', () => {
  const migration = fs.readFileSync(
    'supabase/migrations/20260920046000_governance_outcome_history_analytics.sql',
    'utf8',
  )

  for (const invariant of [
    'r.project_id = p_project_id',
    'r.created_at >= p_from',
    'r.created_at <= p_to',
    "date_trunc('day', r.created_at)",
    "report_payload #>> '{scores,overall,value}'",
    "jsonb_array_elements(",
    "finding ->> 'status' in ('UNRESOLVED', 'BLOCKED')",
    'group by bucket_start',
    'from public, anon, authenticated',
    'to service_role',
  ]) {
    assert.ok(migration.includes(invariant), `missing outcome-history RPC invariant: ${invariant}`)
  }
})
