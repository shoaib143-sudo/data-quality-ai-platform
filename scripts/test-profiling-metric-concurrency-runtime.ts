import assert from 'node:assert/strict'

import { executeProfilingMetrics } from '@/lib/profiling/metric-engine'
import { createAdminClient } from '@/lib/supabase/admin'

const DATASET_VERSION_ID = '10000000-0000-0000-0000-000000000005'
const RUN_A = '10000000-0000-0000-0000-000000000014'
const RUN_B = '10000000-0000-0000-0000-000000000015'
const supabase = createAdminClient()

const columns = [
  { column_name: 'id', ordinal_position: 1, source_type: 'integer', inferred_type: 'NUMBER', nullable: false },
  { column_name: 'email', ordinal_position: 2, source_type: 'text', inferred_type: 'STRING', nullable: true },
  { column_name: 'age', ordinal_position: 3, source_type: 'integer', inferred_type: 'NUMBER', nullable: true },
  { column_name: 'note', ordinal_position: 4, source_type: 'text', inferred_type: 'STRING', nullable: true },
]

async function createRun(id: string) {
  const { error: runError } = await supabase.schema('profiling').from('profile_runs').insert({
    id,
    dataset_version_id: DATASET_VERSION_ID,
    status: 'RUNNING',
    engine_name: 'deterministic-registry-runtime',
    engine_version: '1.1',
    summary: { synthetic: true, concurrency_probe: true },
  })
  assert.equal(runError, null, runError?.message)

  const { error: columnError } = await supabase.schema('profiling').from('profile_columns').insert(
    columns.map((column) => ({ profile_run_id: id, ...column })),
  )
  assert.equal(columnError, null, columnError?.message)
}

async function metricCount(runId: string) {
  const { count, error } = await supabase.schema('profiling').from('profile_metrics')
    .select('*', { count: 'exact', head: true }).eq('profile_run_id', runId)
  assert.equal(error, null, error?.message)
  return count ?? 0
}

async function scoreCount(runId: string) {
  const { count, error } = await supabase.schema('profiling').from('data_quality_scores')
    .select('*', { count: 'exact', head: true }).eq('profile_run_id', runId)
  assert.equal(error, null, error?.message)
  return count ?? 0
}

async function runStatus(runId: string) {
  const { data, error } = await supabase.schema('profiling').from('profile_runs')
    .select('status').eq('id', runId).single()
  assert.equal(error, null, error?.message)
  return data.status
}

async function main() {
  await Promise.all([createRun(RUN_A), createRun(RUN_B)])

  const [a, b] = await Promise.all([
    executeProfilingMetrics(DATASET_VERSION_ID, RUN_A, {
      rows: [
        { id: 1, email: 'a@example.com', age: 10, note: 'a' },
        { id: 2, email: 'b@example.com', age: 20, note: 'b' },
      ],
    }),
    executeProfilingMetrics(DATASET_VERSION_ID, RUN_B, {
      rows: [
        { id: 10, email: 'x@example.com', age: 30, note: null },
        { id: 10, email: 'x@example.com', age: 30, note: null },
      ],
    }),
  ])

  assert.equal(a.status, 'COMPLETED')
  assert.equal(b.status, 'COMPLETED')
  assert.equal(a.row_count, 2)
  assert.equal(b.row_count, 2)
  assert.equal(await runStatus(RUN_A), 'COMPLETED')
  assert.equal(await runStatus(RUN_B), 'COMPLETED')

  const [metricsA, metricsB, scoresA, scoresB] = await Promise.all([
    metricCount(RUN_A), metricCount(RUN_B), scoreCount(RUN_A), scoreCount(RUN_B),
  ])
  assert.ok(metricsA > 0)
  assert.ok(metricsB > 0)
  assert.equal(scoresA, 1)
  assert.equal(scoresB, 1)

  const { count: crossRunLeakage, error: leakageError } = await supabase.schema('profiling').from('profile_metrics')
    .select('*', { count: 'exact', head: true })
    .in('profile_run_id', [RUN_A, RUN_B])
  assert.equal(leakageError, null, leakageError?.message)
  assert.equal(crossRunLeakage, metricsA + metricsB)

  console.log('Profiling concurrent-run isolation acceptance passed.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
