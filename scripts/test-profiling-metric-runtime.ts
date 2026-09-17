import assert from 'node:assert/strict'

import { executeProfilingMetrics } from '@/lib/profiling/metric-engine'
import { createAdminClient } from '@/lib/supabase/admin'

const DATASET_VERSION_ID = '10000000-0000-0000-0000-000000000005'
const PRIMARY_RUN_ID = '10000000-0000-0000-0000-000000000008'
const NO_FINDINGS_RUN_ID = '10000000-0000-0000-0000-000000000009'
const FAILURE_RETRY_RUN_ID = '10000000-0000-0000-0000-000000000010'
const EMPTY_RUN_ID = '10000000-0000-0000-0000-000000000011'
const MISSING_COLUMN_RUN_ID = '10000000-0000-0000-0000-000000000012'

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
    summary: { synthetic: true },
  })
  assert.equal(runError, null, runError?.message)

  const { error: columnError } = await supabase.schema('profiling').from('profile_columns').insert(
    columns.map((column) => ({ profile_run_id: id, ...column })),
  )
  assert.equal(columnError, null, columnError?.message)
}

async function metricsFor(runId: string) {
  const { data, error } = await supabase.schema('profiling').from('profile_metrics')
    .select('profile_column_id,metric_key,numeric_value,text_value,json_value').eq('profile_run_id', runId)
  assert.equal(error, null, error?.message)
  return data ?? []
}

async function findingsFor(runId: string) {
  const { data, error } = await supabase.schema('profiling').from('profile_findings')
    .select('profile_column_id,finding_type,severity,confidence,evidence').eq('profile_run_id', runId)
  assert.equal(error, null, error?.message)
  return data ?? []
}

async function scoreFor(runId: string) {
  const { data, error } = await supabase.schema('profiling').from('data_quality_scores')
    .select('completeness_score,uniqueness_score,validity_score,accuracy_score,overall_score')
    .eq('profile_run_id', runId).maybeSingle()
  assert.equal(error, null, error?.message)
  return data
}

async function runState(runId: string) {
  const { data, error } = await supabase.schema('profiling').from('profile_runs')
    .select('status,summary,completed_at').eq('id', runId).single()
  assert.equal(error, null, error?.message)
  return data
}

async function columnIds(runId: string) {
  const { data, error } = await supabase.schema('profiling').from('profile_columns')
    .select('id,column_name').eq('profile_run_id', runId)
  assert.equal(error, null, error?.message)
  return new Map((data ?? []).map((column) => [column.column_name, column.id]))
}

function numeric(value: unknown) {
  return typeof value === 'number' ? value : Number(value)
}

async function assertPrimaryExecution() {
  const result = await executeProfilingMetrics(DATASET_VERSION_ID, PRIMARY_RUN_ID)
  assert.equal(result.status, 'COMPLETED')
  assert.equal(result.row_count, 5)
  assert.equal(result.column_count, 4)
  assert.equal(result.findings_persisted, 2)
  assert.equal(result.duplicate_metric_basis, 'FULL_DATASET')
  assert.equal(result.score.completeness_score, 0.8)
  assert.equal(result.score.uniqueness_score, 0.7)
  assert.equal(result.score.validity_score, 1)
  assert.equal(result.score.overall_score, 0.8333)

  const ids = await columnIds(PRIMARY_RUN_ID)
  const metrics = await metricsFor(PRIMARY_RUN_ID)
  const findings = await findingsFor(PRIMARY_RUN_ID)
  const score = await scoreFor(PRIMARY_RUN_ID)
  const state = await runState(PRIMARY_RUN_ID)

  const duplicateCount = metrics.find((metric) => metric.profile_column_id === null && metric.metric_key === 'duplicate_row_count')
  const duplicateRate = metrics.find((metric) => metric.profile_column_id === null && metric.metric_key === 'duplicate_row_rate')
  const noteNullCount = metrics.find((metric) => metric.profile_column_id === ids.get('note') && metric.metric_key === 'null_count')
  const emailSensitiveRate = metrics.find((metric) => metric.profile_column_id === ids.get('email') && metric.metric_key === 'sensitive_match_rate')

  assert.equal(numeric(duplicateCount?.numeric_value), 1)
  assert.equal(numeric(duplicateRate?.numeric_value), 0.2)
  assert.equal(numeric(noteNullCount?.numeric_value), 4)
  assert.equal(numeric(emailSensitiveRate?.numeric_value), 1)

  const completenessFinding = findings.find((finding) => finding.finding_type === 'COMPLETENESS')
  const sensitivityFinding = findings.find((finding) => finding.finding_type === 'SENSITIVITY')
  assert.equal(completenessFinding?.severity, 'HIGH')
  assert.equal((completenessFinding?.evidence as Record<string, unknown>)?.missing_count, 4)
  assert.equal((sensitivityFinding?.evidence as Record<string, unknown>)?.sensitive_match_rate, 1)

  assert.equal(numeric(score?.completeness_score), 0.8)
  assert.equal(numeric(score?.uniqueness_score), 0.7)
  assert.equal(numeric(score?.validity_score), 1)
  assert.equal(numeric(score?.overall_score), 0.8333)
  assert.equal(state.status, 'COMPLETED')
  assert.ok(state.completed_at)
  assert.equal(numeric((state.summary as Record<string, any>)?.score?.overall_score), 0.8333)

  const uniqueMetricKeys = new Set(metrics.map((metric) => `${metric.profile_column_id ?? 'DATASET'}:${metric.metric_key}`))
  assert.equal(uniqueMetricKeys.size, metrics.length, 'persisted metrics must not contain duplicate run/column/key tuples')

  const firstMetricCount = metrics.length
  const retry = await executeProfilingMetrics(DATASET_VERSION_ID, PRIMARY_RUN_ID)
  assert.equal(retry.status, 'COMPLETED')
  const retriedMetrics = await metricsFor(PRIMARY_RUN_ID)
  assert.equal(retriedMetrics.length, firstMetricCount, 'retry must replace or upsert metrics without duplication')
  assert.equal(new Set(retriedMetrics.map((metric) => `${metric.profile_column_id ?? 'DATASET'}:${metric.metric_key}`)).size, retriedMetrics.length)
}

async function assertNoFindingsExecution() {
  await createRun(NO_FINDINGS_RUN_ID)
  const result = await executeProfilingMetrics(DATASET_VERSION_ID, NO_FINDINGS_RUN_ID, {
    rows: [
      { id: 1, email: 'invalid-a', age: 10, note: 'alpha' },
      { id: 2, email: 'invalid-b', age: 20, note: 'beta' },
      { id: 3, email: 'invalid-c', age: 30, note: 'gamma' },
    ],
  })
  assert.equal(result.findings_persisted, 0)
  assert.equal((await findingsFor(NO_FINDINGS_RUN_ID)).length, 0)
  const score = await scoreFor(NO_FINDINGS_RUN_ID)
  assert.equal(numeric(score?.completeness_score), 1)
  assert.equal(numeric(score?.uniqueness_score), 1)
  assert.equal(numeric(score?.validity_score), 0.75)
  assert.equal(numeric(score?.overall_score), 0.9167)
}

async function assertFailureThenRetry() {
  await createRun(FAILURE_RETRY_RUN_ID)
  await assert.rejects(
    () => executeProfilingMetrics(DATASET_VERSION_ID, FAILURE_RETRY_RUN_ID, {
      rows: [{ id: 1, email: 'a@example.com', age: 10, note: 'ok', unexpected: 'contract-break' }],
    }),
    /source columns are not fully registered/,
  )
  assert.equal((await metricsFor(FAILURE_RETRY_RUN_ID)).length, 0)
  assert.equal((await findingsFor(FAILURE_RETRY_RUN_ID)).length, 0)
  assert.equal(await scoreFor(FAILURE_RETRY_RUN_ID), null)
  assert.equal((await runState(FAILURE_RETRY_RUN_ID)).status, 'RUNNING')

  const retry = await executeProfilingMetrics(DATASET_VERSION_ID, FAILURE_RETRY_RUN_ID, {
    rows: [
      { id: 1, email: 'a@example.com', age: 10, note: 'ok' },
      { id: 2, email: 'b@example.com', age: 20, note: 'ok' },
    ],
  })
  assert.equal(retry.status, 'COMPLETED')
  assert.ok((await metricsFor(FAILURE_RETRY_RUN_ID)).length > 0)
  assert.ok(await scoreFor(FAILURE_RETRY_RUN_ID))
}

async function assertEmptyDatasetScoring() {
  await createRun(EMPTY_RUN_ID)
  const result = await executeProfilingMetrics(DATASET_VERSION_ID, EMPTY_RUN_ID, { rows: [] })
  assert.equal(result.row_count, 0)
  assert.equal(result.findings_persisted, 0)
  assert.equal(result.score.completeness_score, 0)
  assert.equal(result.score.uniqueness_score, 0)
  assert.equal(result.score.validity_score, 1)
  assert.equal(result.score.overall_score, 0.3333)
  assert.equal((await findingsFor(EMPTY_RUN_ID)).length, 0)
}

async function assertMissingObservedColumnScoring() {
  await createRun(MISSING_COLUMN_RUN_ID)
  const result = await executeProfilingMetrics(DATASET_VERSION_ID, MISSING_COLUMN_RUN_ID, {
    rows: [
      { id: 1, email: 'a@example.com', age: 10 },
      { id: 2, email: 'b@example.com', age: 20 },
    ],
  })
  assert.equal(result.status, 'COMPLETED')
  assert.ok(Array.isArray((await runState(MISSING_COLUMN_RUN_ID)).summary?.profiling_warnings))
  const ids = await columnIds(MISSING_COLUMN_RUN_ID)
  const metrics = await metricsFor(MISSING_COLUMN_RUN_ID)
  const noteNullCount = metrics.find((metric) => metric.profile_column_id === ids.get('note') && metric.metric_key === 'null_count')
  assert.equal(numeric(noteNullCount?.numeric_value), 2)
  const findings = await findingsFor(MISSING_COLUMN_RUN_ID)
  assert.ok(findings.some((finding) => finding.profile_column_id === ids.get('note') && finding.finding_type === 'COMPLETENESS'))
  assert.equal(numeric((await scoreFor(MISSING_COLUMN_RUN_ID))?.completeness_score), 0.75)
}

async function main() {
  await assertPrimaryExecution()
  await assertNoFindingsExecution()
  await assertFailureThenRetry()
  await assertEmptyDatasetScoring()
  await assertMissingObservedColumnScoring()

  console.log('Profiling deterministic metric runtime acceptance passed.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
