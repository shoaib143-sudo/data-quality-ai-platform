import { createAdminClient } from '@/lib/supabase/admin'

type MetricRow = {
  profile_column_id: string | null
  metric_key: string
  numeric_value: number | null
}

type ColumnRow = {
  id: string
  column_name: string
}

type ProfileRunRow = {
  id: string
  dataset_version_id: string
  status: string
}

type ChangeRow = {
  metric_key: string
  column_name: string | null
  baseline_value: number | null
  target_value: number | null
  absolute_change: number | null
  relative_change: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

async function loadRun(
  supabase: ReturnType<typeof createAdminClient>,
  profilingRunId: string,
): Promise<ProfileRunRow> {
  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id,dataset_version_id,status')
    .eq('id', profilingRunId)
    .maybeSingle()

  if (error) throw new Error(`Unable to load profiling run: ${error.message}`)
  if (!data) throw new Error(`Profiling run ${profilingRunId} was not found.`)
  return data as ProfileRunRow
}

async function loadMetrics(
  supabase: ReturnType<typeof createAdminClient>,
  profilingRunId: string,
): Promise<MetricRow[]> {
  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_metrics')
    .select('profile_column_id,metric_key,numeric_value')
    .eq('profile_run_id', profilingRunId)
    .order('metric_key', { ascending: true })
    .order('profile_column_id', { ascending: true, nullsFirst: true })

  if (error) throw new Error(`Unable to load profiling metrics: ${error.message}`)
  return (data ?? []) as MetricRow[]
}

async function loadColumns(
  supabase: ReturnType<typeof createAdminClient>,
  profilingRunId: string,
): Promise<ColumnRow[]> {
  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_columns')
    .select('id,column_name')
    .eq('profile_run_id', profilingRunId)
    .order('ordinal_position', { ascending: true })

  if (error) throw new Error(`Unable to load profile columns: ${error.message}`)
  return (data ?? []) as ColumnRow[]
}

function buildChanges(
  baselineMetrics: MetricRow[],
  targetMetrics: MetricRow[],
  baselineColumns: ColumnRow[],
  targetColumns: ColumnRow[],
): ChangeRow[] {
  const baselineNames = new Map(baselineColumns.map((column) => [column.id, column.column_name]))
  const targetNames = new Map(targetColumns.map((column) => [column.id, column.column_name]))
  const metricKey = (metric: MetricRow, names: Map<string, string>) =>
    `${metric.metric_key}:${metric.profile_column_id ? names.get(metric.profile_column_id) ?? metric.profile_column_id : 'DATASET'}`

  const map = new Map<string, Omit<ChangeRow, 'absolute_change' | 'relative_change'>>()
  for (const metric of baselineMetrics) {
    map.set(metricKey(metric, baselineNames), {
      metric_key: metric.metric_key,
      column_name: metric.profile_column_id ? baselineNames.get(metric.profile_column_id) ?? null : null,
      baseline_value: metric.numeric_value,
      target_value: null,
    })
  }

  for (const metric of targetMetrics) {
    const key = metricKey(metric, targetNames)
    const row = map.get(key) ?? {
      metric_key: metric.metric_key,
      column_name: metric.profile_column_id ? targetNames.get(metric.profile_column_id) ?? null : null,
      baseline_value: null,
      target_value: null,
    }
    row.target_value = metric.numeric_value
    map.set(key, row)
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      absolute_change:
        row.baseline_value !== null && row.target_value !== null
          ? row.target_value - row.baseline_value
          : null,
      relative_change:
        row.baseline_value !== null && row.target_value !== null && row.baseline_value !== 0
          ? (row.target_value - row.baseline_value) / Math.abs(row.baseline_value)
          : null,
    }))
    .sort((left, right) => {
      const metricOrder = left.metric_key.localeCompare(right.metric_key)
      if (metricOrder !== 0) return metricOrder
      return String(left.column_name ?? '').localeCompare(String(right.column_name ?? ''))
    })
}

function materialChanges(changes: ChangeRow[]) {
  return changes.filter((row) => {
    if (typeof row.relative_change === 'number') return Math.abs(row.relative_change) >= 0.2
    if (row.baseline_value === null && row.target_value !== null) return true
    if (row.baseline_value !== null && row.target_value === null) return true
    return false
  })
}

export async function compareProfilesReplaySafe(input: {
  baselineProfileRunId: string
  targetProfileRunId: string
}) {
  const { baselineProfileRunId, targetProfileRunId } = input
  if (!baselineProfileRunId || !targetProfileRunId || baselineProfileRunId === targetProfileRunId) {
    throw new Error('Distinct baseline and target profile run IDs are required.')
  }

  const supabase = createAdminClient()
  const [baseline, target] = await Promise.all([
    loadRun(supabase, baselineProfileRunId),
    loadRun(supabase, targetProfileRunId),
  ])

  if (!['COMPLETED', 'PARTIAL'].includes(baseline.status) || !['COMPLETED', 'PARTIAL'].includes(target.status)) {
    throw new Error('Profile comparison requires completed or partial terminal runs.')
  }

  const [baselineMetrics, targetMetrics, baselineColumns, targetColumns] = await Promise.all([
    loadMetrics(supabase, baselineProfileRunId),
    loadMetrics(supabase, targetProfileRunId),
    loadColumns(supabase, baselineProfileRunId),
    loadColumns(supabase, targetProfileRunId),
  ])

  const changes = buildChanges(baselineMetrics, targetMetrics, baselineColumns, targetColumns)
  const material = materialChanges(changes)
  const targetColumnIdByName = new Map(targetColumns.map((column) => [column.column_name, column.id]))
  const anomalyRows = material.slice(0, 200).map((row) => {
    const magnitude = typeof row.relative_change === 'number' ? Math.abs(row.relative_change) : 1
    const direction = typeof row.absolute_change === 'number'
      ? row.absolute_change > 0
        ? 'INCREASE'
        : row.absolute_change < 0
          ? 'DECREASE'
          : 'UNCHANGED'
      : 'CHANGED'

    return {
      profile_column_id: row.column_name ? targetColumnIdByName.get(row.column_name) ?? null : null,
      severity: magnitude >= 0.5 ? 'HIGH' : 'MEDIUM',
      metric_key: row.metric_key,
      current_value: row.target_value,
      baseline_value: row.baseline_value,
      absolute_change: row.absolute_change,
      relative_change: row.relative_change,
      direction,
      title: `${row.column_name ?? 'Dataset'} ${row.metric_key} changed materially`,
      description: typeof row.relative_change === 'number'
        ? `${row.metric_key} changed by ${Math.round(row.relative_change * 100)}% relative to the baseline profile.`
        : `${row.metric_key} is present in only one side of the profile comparison.`,
      evidence: {
        baseline_profile_run_id: baselineProfileRunId,
        target_profile_run_id: targetProfileRunId,
      },
    }
  })

  const summary = material.length
    ? `${material.length} material metric changes detected.`
    : 'No material metric changes detected.'

  const { data, error } = await supabase
    .schema('profiling')
    .rpc('persist_profile_comparison_replay_safe', {
      p_current_profile_run_id: targetProfileRunId,
      p_baseline_profile_run_id: baselineProfileRunId,
      p_summary: summary,
      p_changes: { changes, material_changes: material },
      p_anomalies: anomalyRows,
    })

  if (error) throw new Error(`Unable to persist replay-safe profile comparison: ${error.message}`)
  const persisted = asRecord(data)
  const comparisonId = typeof persisted?.comparison_id === 'string' ? persisted.comparison_id : null
  const status = typeof persisted?.status === 'string' ? persisted.status : null
  const metricsChanged = Number(persisted?.metrics_changed)
  const anomaliesFound = Number(persisted?.anomalies_found)

  if (!comparisonId || status !== 'COMPLETED' || !Number.isInteger(metricsChanged) || metricsChanged < 0 || !Number.isInteger(anomaliesFound) || anomaliesFound < 0) {
    throw new Error('Replay-safe profile comparison returned an invalid persistence contract.')
  }

  return {
    comparison_id: comparisonId,
    status,
    metrics_changed: metricsChanged,
    anomalies_found: anomaliesFound,
  }
}
