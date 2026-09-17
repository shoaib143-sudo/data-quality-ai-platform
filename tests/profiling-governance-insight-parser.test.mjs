import test from 'node:test'
import assert from 'node:assert/strict'
import { parseProfilingGovernanceInsightRow } from '../lib/profiling/governance-insight-parser.ts'

const validRow = {
  profile_run_id: '00000000-0000-0000-0000-000000000001',
  dataset_version_id: '00000000-0000-0000-0000-000000000002',
  dataset_id: '00000000-0000-0000-0000-000000000003',
  project_id: '00000000-0000-0000-0000-000000000004',
  run_status: 'COMPLETED',
  started_at: '2026-09-17T00:00:00Z',
  completed_at: '2026-09-17T00:01:00Z',
  row_count: 2,
  column_count: 1,
  duplicate_row_count: 0,
  completeness_score: 1,
  uniqueness_score: 1,
  validity_score: 1,
  accuracy_score: null,
  overall_score: 1,
  total_findings: 1,
  high_findings: 0,
  medium_findings: 0,
  info_findings: 0,
  investigation_present: false,
}

test('parses canonical governance insight evidence', () => {
  const parsed = parseProfilingGovernanceInsightRow(validRow)
  assert.equal(parsed.overallScore, 1)
  assert.equal(parsed.totalFindings, 1)
  assert.equal(parsed.accuracyScore, null)
})

for (const [name, patch, expected] of [
  ['fractional finding count', { total_findings: 1.5 }, /invalid count/],
  ['negative finding count', { high_findings: -1 }, /invalid count/],
  ['non numeric score', { overall_score: 'not-a-number' }, /invalid numeric value/],
  ['missing identity', { profile_run_id: null }, /identity is invalid/],
  ['invalid investigation state', { investigation_present: 'false' }, /state is invalid/],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => parseProfilingGovernanceInsightRow({ ...validRow, ...patch }), expected)
  })
}
