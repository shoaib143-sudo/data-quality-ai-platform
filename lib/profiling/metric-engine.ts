import { createAdminClient } from '@/lib/supabase/admin'

type Row = Record<string, unknown>

type MetricValue = {
  metric_key: string
  numeric_value: number | null
  text_value?: string | null
  profile_column_id?: string | null
}

type ColumnResult = {
  column_name: string
  metrics: MetricValue[]
  candidate_key_confidence: number
  sensitive_match_rate: number
  pattern_match_rate: number | null
  finding?: {
    finding_type: string
    severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH'
    title: string
    description: string
    confidence: number
    evidence: Record<string, unknown>
    recommendation: Record<string, unknown>
  }
}

const RATE_SCALE = 4

function round(value: number, places = RATE_SCALE) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function isMissing(value: unknown) {
  return value === null || value === undefined
}

function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

function key(value: unknown) {
  const normalizedValue = normalized(value)
  return normalizedValue === null || normalizedValue === undefined
    ? '__NULL__'
    : typeof normalizedValue === 'string'
      ? normalizedValue
      : JSON.stringify(normalizedValue)
}

function emailMatch(value: unknown) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function sensitiveMatch(columnName: string, value: unknown) {
  if (isMissing(value)) return false
  const name = columnName.toLowerCase()
  if (name.includes('email')) return emailMatch(value)
  if (name.includes('phone') || name.includes('mobile')) {
    return typeof value === 'string' && /^[+()\d\s.-]{7,}$/.test(value.trim())
  }
  if (name.includes('ssn') || name.includes('national_id')) {
    return typeof value === 'string' && /^\d{3}-?\d{2}-?\d{4}$/.test(value.trim())
  }
  if (name.includes('address')) return typeof value === 'string' && value.trim().length >= 8
  return false
}

function patternMatch(columnName: string, value: unknown) {
  if (isMissing(value)) return false
  const name = columnName.toLowerCase()
  if (name.includes('email')) return emailMatch(value)
  if (name.includes('phone') || name.includes('mobile')) {
    return typeof value === 'string' && /^[+()\d\s.-]{7,}$/.test(value.trim())
  }
  return true
}

function calculateColumnMetrics(columnName: string, rows: Row[]): Omit<ColumnResult, 'metrics'> & { metrics: MetricValue[] } {
  const values = rows.map((row) => row[columnName])
  const rowCount = values.length
  const nullCount = values.filter(isMissing).length
  const nonNullValues = values.filter((value) => !isMissing(value))
  const distinctCount = new Set(nonNullValues.map(key)).size
  const frequencies = new Map<string, number>()

  for (const value of nonNullValues) {
    const k = key(value)
    frequencies.set(k, (frequencies.get(k) ?? 0) + 1)
  }

  const uniqueCount = Array.from(frequencies.values()).filter((count) => count === 1).length
  const uniqueRate = nonNullValues.length === 0 ? 0 : uniqueCount / nonNullValues.length
  const nullRate = rowCount === 0 ? 0 : nullCount / rowCount
  const distinctRate = rowCount === 0 ? 0 : distinctCount / rowCount

  const patternEligible = values.filter((value) => !isMissing(value))
  const patternMatchRate = patternEligible.length === 0
    ? null
    : patternEligible.filter((value) => patternMatch(columnName, value)).length / patternEligible.length

  const sensitiveMatchRate = patternEligible.length === 0
    ? 0
    : patternEligible.filter((value) => sensitiveMatch(columnName, value)).length / patternEligible.length

  const candidateKeyConfidence = rowCount === 0
    ? 0
    : round(uniqueRate * (1 - nullRate))

  const metrics: MetricValue[] = [
    { metric_key: 'column_count', numeric_value: 1 },
    { metric_key: 'row_count', numeric_value: rowCount },
    { metric_key: 'non_null_count', numeric_value: nonNullValues.length },
    { metric_key: 'null_count', numeric_value: nullCount },
    { metric_key: 'null_rate', numeric_value: round(nullRate) },
    { metric_key: 'distinct_count', numeric_value: distinctCount },
    { metric_key: 'distinct_rate', numeric_value: round(distinctRate) },
    { metric_key: 'unique_count', numeric_value: uniqueCount },
    { metric_key: 'unique_rate', numeric_value: round(uniqueRate) },
    { metric_key: 'pattern_match_rate', numeric_value: patternMatchRate === null ? null : round(patternMatchRate) },
    { metric_key: 'sensitive_match_rate', numeric_value: round(sensitiveMatchRate) },
    { metric_key: 'candidate_key_confidence', numeric_value: candidateKeyConfidence },
  ]

  let finding: ColumnResult['finding']
  if (nullRate > 0.2) {
    finding = {
      finding_type: 'COMPLETENESS',
      severity: nullRate >= 0.5 ? 'HIGH' : 'MEDIUM',
      title: `${columnName} has missing values`,
      description: `${round(nullRate * 100)}% of observed rows are null or missing.`,
      confidence: 1,
      evidence: { null_count: nullCount, row_count: rowCount, null_rate: round(nullRate) },
      recommendation: { action: 'review_source_completeness', threshold: 0.2 },
    }
  } else if (sensitiveMatchRate > 0.8) {
    finding = {
      finding_type: 'SENSITIVITY',
      severity: 'INFO',
      title: `${columnName} appears sensitive`,
      description: `Observed values match a known sensitive data pattern.`,
      confidence: round(sensitiveMatchRate),
      evidence: { sensitive_match_rate: round(sensitiveMatchRate) },
      recommendation: { action: 'apply_data_classification_and_access_controls' },
    }
  }

  return {
    column_name: columnName,
    metrics,
    candidate_key_confidence: candidateKeyConfidence,
    sensitive_match_rate: round(sensitiveMatchRate),
    pattern_match_rate: patternMatchRate === null ? null : round(patternMatchRate),
    finding,
  }
}

async function loadRowsFromTable(
  supabase: ReturnType<typeof createAdminClient>,
  datasetVersionId: string,
  maxRows: number,
) {
  const { data: version, error: versionError } = await supabase.rpc('get_dataset_version_for_profiling', {
    dataset_version_id: datasetVersionId,
  })
  if (versionError) throw new Error(`Unable to resolve dataset version: ${versionError.message}`)

  const dataset = Array.isArray(version?.datasets) ? version.datasets[0] : version?.datasets
  const dataSource = Array.isArray(dataset?.data_sources) ? dataset.data_sources[0] : dataset?.data_sources
  const sourceType = String(dataSource?.source_type ?? '').toLowerCase()
  const metadata = dataSource?.connection_metadata ?? {}
  const table = metadata.table ?? metadata.table_name ?? metadata.tableName
  const schema = metadata.schema ?? metadata.schema_name ?? metadata.schemaName ?? 'public'

  if (!['supabase', 'supabase_table', 'postgres', 'postgres_table', 'table'].includes(sourceType) || !table) {
    throw new Error(
      `No executable table source is configured for dataset version ${datasetVersionId}. ` +
      'FILE sources require a storage/HTTP adapter before row profiling can execute.',
    )
  }

  const { count, error: countError } = await supabase.schema(schema).from(table).select('*', { count: 'exact', head: true })
  if (countError) throw new Error(`Unable to count source rows: ${countError.message}`)

  const { data, error } = await supabase.schema(schema).from(table).select('*').range(0, maxRows - 1)
  if (error) throw new Error(`Unable to load source rows: ${error.message}`)

  return { rowCount: count ?? 0, rows: (data ?? []) as Row[] }
}

export async function executeProfilingMetrics(
  datasetVersionId: string,
  profilingRunId: string,
  input: Record<string, unknown> = {},
) {
  const supabase = createAdminClient()
  const inputRows = Array.isArray(input.rows) ? input.rows.filter((row): row is Row => !!row && typeof row === 'object' && !Array.isArray(row)) : null
  const loaded = inputRows ? { rowCount: inputRows.length, rows: inputRows } : await loadRowsFromTable(supabase, datasetVersionId, 1000)
  const rows = loaded.rows
  const columnNames = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))

  const { data: definitions, error: definitionError } = await supabase
    .schema('profiling')
    .from('metric_definitions')
    .select('id, metric_key')
    .in('metric_key', [
      'column_count', 'row_count', 'non_null_count', 'null_count', 'null_rate',
      'distinct_count', 'distinct_rate', 'unique_count', 'unique_rate',
      'pattern_match_rate', 'sensitive_match_rate', 'candidate_key_confidence',
    ])
  if (definitionError) throw new Error(`Unable to load metric definitions: ${definitionError.message}`)

  const definitionByKey = new Map((definitions ?? []).map((definition) => [definition.metric_key, definition.id]))
  const results = columnNames.map((columnName) => calculateColumnMetrics(columnName, rows))

  const { data: profileColumns, error: columnsError } = await supabase
    .schema('profiling')
    .from('profile_columns')
    .select('id, column_name')
    .eq('profile_run_id', profilingRunId)
  if (columnsError) throw new Error(`Unable to load profile columns: ${columnsError.message}`)

  const columnIdByName = new Map((profileColumns ?? []).map((column) => [column.column_name, column.id]))

  await supabase.schema('profiling').from('profile_metrics').delete().eq('profile_run_id', profilingRunId)
  await supabase.schema('profiling').from('profile_findings').delete().eq('profile_run_id', profilingRunId)

  const metricRows = results.flatMap((result) => result.metrics.flatMap((metric) => {
    const definitionId = definitionByKey.get(metric.metric_key)
    if (!definitionId) return []
    return [{
      profile_run_id: profilingRunId,
      metric_definition_id: definitionId,
      profile_column_id: columnIdByName.get(result.column_name) ?? null,
      metric_key: metric.metric_key,
      numeric_value: metric.numeric_value,
    }]
  }))

  if (metricRows.length) {
    const { error } = await supabase.schema('profiling').from('profile_metrics').insert(metricRows)
    if (error) throw new Error(`Unable to persist profile metrics: ${error.message}`)
  }

  const findings = results.filter((result) => result.finding).map((result) => ({
    profile_run_id: profilingRunId,
    profile_column_id: columnIdByName.get(result.column_name) ?? null,
    ...result.finding,
  }))

  if (findings.length) {
    const { error } = await supabase.schema('profiling').from('profile_findings').insert(findings)
    if (error) throw new Error(`Unable to persist profile findings: ${error.message}`)
  }

  const completeness = results.length === 0 ? 0 : results.reduce((sum, result) => {
    const metric = result.metrics.find((item) => item.metric_key === 'null_rate')?.numeric_value ?? 1
    return sum + (1 - metric)
  }, 0) / results.length
  const uniqueness = results.length === 0 ? 0 : results.reduce((sum, result) => {
    const metric = result.metrics.find((item) => item.metric_key === 'unique_rate')?.numeric_value ?? 0
    return sum + metric
  }, 0) / results.length
  const validityCandidates = results.map((result) => result.pattern_match_rate).filter((value): value is number => value !== null)
  const validity = validityCandidates.length ? validityCandidates.reduce((sum, value) => sum + value, 0) / validityCandidates.length : 1
  const overall = round((completeness + uniqueness + validity) / 3)

  const scorePayload = {
    completeness_score: round(completeness),
    uniqueness_score: round(uniqueness),
    validity_score: round(validity),
    accuracy_score: null,
    overall_score: overall,
    scoring_basis: 'deterministic_metrics',
  }

  const { error: scoreError } = await supabase.schema('profiling').from('data_quality_scores').upsert({
    profile_run_id: profilingRunId,
    completeness_score: scorePayload.completeness_score,
    uniqueness_score: scorePayload.uniqueness_score,
    validity_score: scorePayload.validity_score,
    accuracy_score: null,
    overall_score: scorePayload.overall_score,
  }, { onConflict: 'profile_run_id' })
  if (scoreError) throw new Error(`Unable to persist quality score: ${scoreError.message}`)

  await supabase.schema('profiling').from('profile_runs').update({
    row_count: loaded.rowCount,
    column_count: columnNames.length,
    summary: { metric_engine: 'deterministic', sample_size: rows.length, score: scorePayload },
  }).eq('id', profilingRunId)

  return {
    tool: 'execute_metrics',
    status: 'COMPLETED',
    dataset_version_id: datasetVersionId,
    profiling_run_id: profilingRunId,
    row_count: loaded.rowCount,
    column_count: columnNames.length,
    metrics_persisted: metricRows.length,
    findings_persisted: findings.length,
    score: scorePayload,
    columns: results,
  }
}
