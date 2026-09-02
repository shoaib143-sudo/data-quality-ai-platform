import { createAdminClient } from '@/lib/supabase/admin'

type MetricRow = {
  id: string
  profile_run_id: string
  profile_column_id: string | null
  metric_key: string
  numeric_value: number | null
  text_value: string | null
  json_value: unknown
}

type ColumnRow = { id: string; column_name: string }

async function loadRun(supabase: ReturnType<typeof createAdminClient>, profilingRunId: string) {
  const { data, error } = await supabase.schema('profiling').from('profile_runs').select('id, dataset_version_id, status, row_count, column_count, summary').eq('id', profilingRunId).maybeSingle()
  if (error) throw new Error(`Unable to load profiling run: ${error.message}`)
  if (!data) throw new Error(`Profiling run ${profilingRunId} was not found.`)
  return data
}

async function loadMetrics(supabase: ReturnType<typeof createAdminClient>, profilingRunId: string, keys?: string[]) {
  let query = supabase.schema('profiling').from('profile_metrics').select('id, profile_run_id, profile_column_id, metric_key, numeric_value, text_value, json_value').eq('profile_run_id', profilingRunId)
  if (keys?.length) query = query.in('metric_key', keys)
  const { data, error } = await query
  if (error) throw new Error(`Unable to load profiling metrics: ${error.message}`)
  return (data ?? []) as MetricRow[]
}

async function loadColumns(supabase: ReturnType<typeof createAdminClient>, profilingRunId: string) {
  const { data, error } = await supabase.schema('profiling').from('profile_columns').select('id, column_name').eq('profile_run_id', profilingRunId).order('ordinal_position')
  if (error) throw new Error(`Unable to load profile columns: ${error.message}`)
  return (data ?? []) as ColumnRow[]
}

function columnMap(columns: ColumnRow[]) { return new Map(columns.map((column) => [column.id, column.column_name])) }

export async function detectPatterns(profilingRunId: string) {
  const supabase = createAdminClient()
  await loadRun(supabase, profilingRunId)
  const [metrics, columns] = await Promise.all([loadMetrics(supabase, profilingRunId, ['pattern_count', 'pattern_match_rate']), loadColumns(supabase, profilingRunId)])
  const names = columnMap(columns)
  const grouped = new Map<string, Record<string, unknown>>()
  for (const metric of metrics) {
    const key = metric.profile_column_id ?? 'dataset'
    const row = grouped.get(key) ?? { column_name: metric.profile_column_id ? names.get(metric.profile_column_id) ?? null : null }
    if (metric.metric_key === 'pattern_count') row.pattern_count = metric.numeric_value
    if (metric.metric_key === 'pattern_match_rate') row.pattern_match_rate = metric.numeric_value
    grouped.set(key, row)
  }
  return { tool: 'detect_patterns', status: 'COMPLETED', profiling_run_id: profilingRunId, columns: Array.from(grouped.values()) }
}

export async function inferCandidateKeys(profilingRunId: string) {
  const supabase = createAdminClient()
  await loadRun(supabase, profilingRunId)
  const [metrics, columns] = await Promise.all([loadMetrics(supabase, profilingRunId, ['candidate_key_confidence', 'unique_count', 'unique_rate', 'null_rate']), loadColumns(supabase, profilingRunId)])
  const names = columnMap(columns)
  const grouped = new Map<string, Record<string, unknown>>()
  for (const metric of metrics) {
    if (!metric.profile_column_id) continue
    const row = grouped.get(metric.profile_column_id) ?? { profile_column_id: metric.profile_column_id, column_name: names.get(metric.profile_column_id) ?? null }
    if (metric.metric_key === 'candidate_key_confidence') row.candidate_key_confidence = metric.numeric_value
    if (metric.metric_key === 'unique_count') row.unique_count = metric.numeric_value
    if (metric.metric_key === 'unique_rate') row.unique_rate = metric.numeric_value
    if (metric.metric_key === 'null_rate') row.null_rate = metric.numeric_value
    grouped.set(metric.profile_column_id, row)
  }
  const candidates = Array.from(grouped.values()).filter((row) => Number(row.candidate_key_confidence ?? 0) >= 0.95 && Number(row.null_rate ?? 1) === 0)
  return { tool: 'infer_candidate_keys', status: 'COMPLETED', profiling_run_id: profilingRunId, candidates }
}

export async function detectOutliers(profilingRunId: string) {
  const supabase = createAdminClient()
  await loadRun(supabase, profilingRunId)
  const [metrics, columns] = await Promise.all([loadMetrics(supabase, profilingRunId, ['outlier_count', 'outlier_rate', 'min', 'max', 'mean', 'stddev']), loadColumns(supabase, profilingRunId)])
  const names = columnMap(columns)
  const grouped = new Map<string, Record<string, unknown>>()
  for (const metric of metrics) {
    if (!metric.profile_column_id) continue
    const row = grouped.get(metric.profile_column_id) ?? { profile_column_id: metric.profile_column_id, column_name: names.get(metric.profile_column_id) ?? null }
    if (metric.metric_key === 'outlier_count') row.outlier_count = metric.numeric_value
    if (metric.metric_key === 'outlier_rate') row.outlier_rate = metric.numeric_value
    if (metric.metric_key === 'min') row.min = metric.numeric_value
    if (metric.metric_key === 'max') row.max = metric.numeric_value
    if (metric.metric_key === 'mean') row.mean = metric.numeric_value
    if (metric.metric_key === 'stddev') row.stddev = metric.numeric_value
    grouped.set(metric.profile_column_id, row)
  }
  return { tool: 'detect_outliers', status: 'COMPLETED', profiling_run_id: profilingRunId, columns: Array.from(grouped.values()).filter((row) => Number(row.outlier_count ?? 0) > 0) }
}

export async function detectSensitiveColumns(profilingRunId: string) {
  const supabase = createAdminClient()
  await loadRun(supabase, profilingRunId)
  const [metrics, columns] = await Promise.all([loadMetrics(supabase, profilingRunId, ['sensitive_match_rate', 'pattern_match_rate']), loadColumns(supabase, profilingRunId)])
  const names = columnMap(columns)
  const result = metrics.filter((metric) => metric.profile_column_id && Number(metric.numeric_value ?? 0) > 0).map((metric) => ({ profile_column_id: metric.profile_column_id, column_name: names.get(metric.profile_column_id!) ?? null, metric_key: metric.metric_key, match_rate: metric.numeric_value }))
  return { tool: 'detect_sensitive_columns', status: 'COMPLETED', profiling_run_id: profilingRunId, columns: result.filter((row) => row.metric_key === 'sensitive_match_rate' && Number(row.match_rate ?? 0) >= 0.8) }
}

export async function detectDuplicates(profilingRunId: string) {
  const supabase = createAdminClient()
  const run = await loadRun(supabase, profilingRunId)
  const metrics = await loadMetrics(supabase, profilingRunId, ['duplicate_row_count', 'duplicate_row_rate'])
  const result = Object.fromEntries(metrics.map((metric) => [metric.metric_key, metric.numeric_value]))
  const duplicateCount = Number(result.duplicate_row_count ?? run.summary?.duplicate_row_count ?? 0)
  const duplicateMetricBasis = run.summary?.duplicate_metric_basis ?? 'UNKNOWN'
  return {
    tool: 'detect_duplicates',
    status: 'COMPLETED',
    profiling_run_id: profilingRunId,
    duplicate_row_count: duplicateCount,
    duplicate_row_rate: result.duplicate_row_rate ?? null,
    basis: duplicateMetricBasis,
    sample_size: run.summary?.duplicate_metric_sample_size ?? null,
    denominator: run.summary?.duplicate_metric_denominator ?? null,
  }
}

export async function compareProfiles(baselineProfileRunId: string, targetProfileRunId: string) {
  if (!baselineProfileRunId || !targetProfileRunId || baselineProfileRunId === targetProfileRunId) throw new Error('Distinct baseline and target profile run IDs are required.')
  const supabase = createAdminClient()
  const [baseline, target] = await Promise.all([loadRun(supabase, baselineProfileRunId), loadRun(supabase, targetProfileRunId)])
  const [baselineMetrics, targetMetrics, baselineColumns, targetColumns] = await Promise.all([loadMetrics(supabase, baselineProfileRunId), loadMetrics(supabase, targetProfileRunId), loadColumns(supabase, baselineProfileRunId), loadColumns(supabase, targetProfileRunId)])
  const baselineNames = columnMap(baselineColumns)
  const targetNames = columnMap(targetColumns)
  const key = (metric: MetricRow, names: Map<string, string>) => `${metric.metric_key}:${metric.profile_column_id ? names.get(metric.profile_column_id) ?? metric.profile_column_id : 'DATASET'}`
  const map = new Map<string, { metric_key: string; column_name: string | null; baseline_value: number | null; target_value: number | null }>()
  for (const metric of baselineMetrics) map.set(key(metric, baselineNames), { metric_key: metric.metric_key, column_name: metric.profile_column_id ? baselineNames.get(metric.profile_column_id) ?? null : null, baseline_value: metric.numeric_value, target_value: null })
  for (const metric of targetMetrics) { const k = key(metric, targetNames); const row = map.get(k) ?? { metric_key: metric.metric_key, column_name: metric.profile_column_id ? targetNames.get(metric.profile_column_id) ?? null : null, baseline_value: null, target_value: null }; row.target_value = metric.numeric_value; map.set(k, row) }
  const changes = Array.from(map.values()).map((row) => ({ ...row, absolute_change: row.baseline_value !== null && row.target_value !== null ? row.target_value - row.baseline_value : null, relative_change: row.baseline_value !== null && row.target_value !== null && row.baseline_value !== 0 ? (row.target_value - row.baseline_value) / Math.abs(row.baseline_value) : null }))
  return { tool: 'compare_profiles', status: 'COMPLETED', baseline_profile_run_id: baseline.id, target_profile_run_id: target.id, baseline_dataset_version_id: baseline.dataset_version_id, target_dataset_version_id: target.dataset_version_id, changes }
}
