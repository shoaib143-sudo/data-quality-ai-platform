import assert from 'node:assert/strict'

import { executeProfilingMetrics } from '@/lib/profiling/metric-engine'
import { createAdminClient } from '@/lib/supabase/admin'

const DATASET_VERSION_ID = '10000000-0000-0000-0000-000000000005'
const RUN_ID = '10000000-0000-0000-0000-000000000016'
const INVALID_CONFIG_RUN_ID = '10000000-0000-0000-0000-000000000017'
const supabase = createAdminClient()

const columns = [
  { column_name: 'id', ordinal_position: 1, source_type: 'integer', inferred_type: 'NUMBER', nullable: false },
  { column_name: 'email', ordinal_position: 2, source_type: 'text', inferred_type: 'STRING', nullable: true },
  { column_name: 'age', ordinal_position: 3, source_type: 'integer', inferred_type: 'NUMBER', nullable: true },
  { column_name: 'note', ordinal_position: 4, source_type: 'text', inferred_type: 'STRING', nullable: true },
]

async function createRun(id = RUN_ID) {
  const { error: runError } = await supabase.schema('profiling').from('profile_runs').insert({
    id,
    dataset_version_id: DATASET_VERSION_ID,
    status: 'RUNNING',
    engine_name: 'deterministic-registry-runtime',
    engine_version: '1.1',
    summary: { synthetic: true, jdbc_runtime_probe: true },
  })
  assert.equal(runError, null, runError?.message)

  const { error: columnError } = await supabase.schema('profiling').from('profile_columns').insert(
    columns.map((column) => ({ profile_run_id: id, ...column })),
  )
  assert.equal(columnError, null, columnError?.message)
}

async function configureJdbcSource() {
  const { error } = await supabase.schema('profiling').from('dataset_execution_sources')
    .update({
      source_type: 'JDBC',
      source_uri: 'jdbc-table://profiling_metric_runtime_fixture',
      execution_config: {
        jdbc_url: 'jdbc:sqlite:profiling-runtime.db',
        credential_ref: 'runtime-acceptance-ref',
        table: 'profiling_metric_runtime_fixture',
        synthetic: true,
      },
    })
    .eq('dataset_version_id', DATASET_VERSION_ID)
    .eq('active', true)
  assert.equal(error, null, error?.message)
}

async function assertIncompleteJdbcConfigurationFailsClosed() {
  await createRun(INVALID_CONFIG_RUN_ID)

  const { error: sourceError } = await supabase.schema('profiling').from('dataset_execution_sources')
    .update({
      source_type: 'JDBC',
      source_uri: 'jdbc-table://profiling_metric_runtime_fixture',
      execution_config: {
        jdbc_url: 'jdbc:sqlite:profiling-runtime.db',
        table: 'profiling_metric_runtime_fixture',
        synthetic: true,
      },
    })
    .eq('dataset_version_id', DATASET_VERSION_ID)
    .eq('active', true)
  assert.equal(sourceError, null, sourceError?.message)

  await assert.rejects(
    () => executeProfilingMetrics(DATASET_VERSION_ID, INVALID_CONFIG_RUN_ID),
    /JDBC execution source configuration is incomplete/,
  )

  const [{ count: metricCount, error: metricError }, { count: findingCount, error: findingError }, { count: scoreCount, error: scoreError }] = await Promise.all([
    supabase.schema('profiling').from('profile_metrics').select('*', { count: 'exact', head: true }).eq('profile_run_id', INVALID_CONFIG_RUN_ID),
    supabase.schema('profiling').from('profile_findings').select('*', { count: 'exact', head: true }).eq('profile_run_id', INVALID_CONFIG_RUN_ID),
    supabase.schema('profiling').from('data_quality_scores').select('*', { count: 'exact', head: true }).eq('profile_run_id', INVALID_CONFIG_RUN_ID),
  ])
  assert.equal(metricError, null, metricError?.message)
  assert.equal(findingError, null, findingError?.message)
  assert.equal(scoreError, null, scoreError?.message)
  assert.equal(metricCount, 0)
  assert.equal(findingCount, 0)
  assert.equal(scoreCount, 0)

  const { data: state, error: stateError } = await supabase.schema('profiling').from('profile_runs')
    .select('status,completed_at').eq('id', INVALID_CONFIG_RUN_ID).single()
  assert.equal(stateError, null, stateError?.message)
  assert.equal(state.status, 'RUNNING')
  assert.equal(state.completed_at, null)
}

async function main() {
  await createRun()
  await configureJdbcSource()

  process.env.JDBC_BRIDGE_URL = 'https://jdbc-bridge.example.test'
  process.env.JDBC_BRIDGE_TOKEN = 'runtime-acceptance-token'

  const originalFetch = globalThis.fetch
  let queryCalls = 0
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url !== 'https://jdbc-bridge.example.test/v1/query') {
      return originalFetch(input, init)
    }
    assert.equal(init?.method, 'POST')
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('authorization'), 'Bearer runtime-acceptance-token')
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    assert.equal(body.jdbcUrl, 'jdbc:sqlite:profiling-runtime.db')
    assert.equal(body.credentialRef, 'runtime-acceptance-ref')
    assert.equal(body.table, 'profiling_metric_runtime_fixture')
    assert.equal(typeof body.limit, 'number')
    queryCalls += 1
    return new Response(JSON.stringify({
      rows: [
        { id: 1, email: 'a@example.com', age: 10, note: 'ok' },
        { id: 2, email: 'b@example.com', age: 20, note: null },
        { id: 2, email: 'b@example.com', age: 20, note: null },
      ],
      row_count: 3,
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'email', type: 'TEXT' },
        { name: 'age', type: 'INTEGER' },
        { name: 'note', type: 'TEXT' },
      ],
      warnings: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  try {
    const result = await executeProfilingMetrics(DATASET_VERSION_ID, RUN_ID)
    assert.equal(result.status, 'COMPLETED')
    // Dataset Version source-observed cardinality remains authoritative even when the bridge returns a bounded row set.
    assert.equal(result.row_count, 5)
    assert.equal((result.source_access as Record<string, any>)?.sampled_rows, 3)
    assert.equal(result.column_count, 4)
    assert.equal((result.source_access as Record<string, unknown>).source_type, 'JDBC')
    assert.equal(queryCalls, 1)
    assert.ok(result.metrics_persisted > 0)
    assert.ok(result.findings_persisted >= 1)

    const { data: state, error: stateError } = await supabase.schema('profiling').from('profile_runs')
      .select('status,row_count,column_count,summary').eq('id', RUN_ID).single()
    assert.equal(stateError, null, stateError?.message)
    assert.equal(state.status, 'COMPLETED')
    assert.equal(Number(state.row_count), 5)
    assert.equal((state.summary as Record<string, any>)?.sample_size, 3)
    assert.equal(Number(state.column_count), 4)
    assert.equal((state.summary as Record<string, any>)?.source_access?.source_type, 'JDBC')

    const { count: scoreCount, error: scoreError } = await supabase.schema('profiling').from('data_quality_scores')
      .select('*', { count: 'exact', head: true }).eq('profile_run_id', RUN_ID)
    assert.equal(scoreError, null, scoreError?.message)
    assert.equal(scoreCount, 1)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.JDBC_BRIDGE_URL
    delete process.env.JDBC_BRIDGE_TOKEN
  }

  await assertIncompleteJdbcConfigurationFailsClosed()

  console.log('Profiling JDBC bridge runtime acceptance passed.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
