import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadFileSource } from '@/lib/profiling/file-source-adapter'
import { loadJdbcRows, parseJdbcTableReference } from '@/lib/connectors/jdbc'
import { DETERMINISTIC_METRICS, isDeterministicMetric, type MetricScope } from '@/lib/profiling/metric-registry'
import { applySamplingPolicy, resolveSamplingPolicy } from '@/lib/profiling/sampling'

type Row = Record<string, unknown>
type MetricValue = {
  metric_key: string
  numeric_value?: number | null
  text_value?: string | null
  json_value?: unknown
  profile_column_id?: string | null
}
type ColumnResult = {
  column_name: string
  completeness_rate: number
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

type Definition = { id: string; metric_key: string; scope: MetricScope; enabled: boolean }
const RATE_SCALE = 4

function round(value: number, places = RATE_SCALE) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}
function isMissing(value: unknown) { return value === null || value === undefined }
function isBlank(value: unknown) { return typeof value === 'string' && value.trim() === '' }
function normalized(value: unknown) { return typeof value === 'string' ? value.trim() : value }
function stableKey(value: unknown): string {
  const v = normalized(value)
  if (v === null || v === undefined) return '__NULL__'
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return JSON.stringify(v)
  if (typeof v !== 'object') return JSON.stringify(v)
  const ordered: Record<string, unknown> = {}
  for (const key of Object.keys(v as Record<string, unknown>).sort()) ordered[key] = (v as Record<string, unknown>)[key]
  return JSON.stringify(ordered)
}
function emailMatch(value: unknown) { return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) }
function sensitiveMatch(columnName: string, value: unknown) {
  if (isMissing(value)) return false
  const name = columnName.toLowerCase()
  if (name.includes('email')) return emailMatch(value)
  if (name.includes('phone') || name.includes('mobile')) return typeof value === 'string' && /^[+()\d\s.-]{7,}$/.test(value.trim())
  if (name.includes('ssn') || name.includes('national_id')) return typeof value === 'string' && /^\d{3}-?\d{2}-?\d{4}$/.test(value.trim())
  if (name.includes('address')) return typeof value === 'string' && value.trim().length >= 8
  return false
}
function patternMatch(columnName: string, value: unknown) {
  if (isMissing(value)) return false
  const name = columnName.toLowerCase()
  if (name.includes('email')) return emailMatch(value)
  if (name.includes('phone') || name.includes('mobile')) return typeof value === 'string' && /^[+()\d\s.-]{7,}$/.test(value.trim())
  return true
}
function numericValues(values: unknown[]) {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
}
function percentile(values: number[], p: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}
function numericStats(values: unknown[]) {
  const nums = numericValues(values)
  if (!nums.length) return { nums, min: null, max: null, mean: null, median: null, stddev: null, negative: 0, zero: 0, outlier: 0 }
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const variance = nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nums.length
  const q1 = percentile(nums, 0.25)!
  const q3 = percentile(nums, 0.75)!
  const iqr = q3 - q1
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  return { nums, min: Math.min(...nums), max: Math.max(...nums), mean, median: percentile(nums, 0.5), stddev: Math.sqrt(variance), negative: nums.filter((v) => v < 0).length, zero: nums.filter((v) => v === 0).length, outlier: nums.filter((v) => v < lower || v > upper).length }
}
function histogram(values: number[]) {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [{ min: round(min), max: round(max), count: values.length }]
  const bins = Math.min(10, Math.max(2, Math.ceil(Math.sqrt(values.length))))
  const width = (max - min) / bins
  const result = Array.from({ length: bins }, (_, i) => ({ min: round(min + i * width), max: round(i === bins - 1 ? max : min + (i + 1) * width), count: 0 }))
  for (const value of values) result[Math.min(bins - 1, Math.floor((value - min) / width))].count += 1
  return result
}
function schemaHash(columnNames: string[]) { return createHash('sha256').update(JSON.stringify([...columnNames].sort())).digest('hex') }
function duplicateRowCount(rows: Row[]) {
  const frequencies = new Map<string, number>()
  for (const row of rows) {
    const k = stableKey(row)
    frequencies.set(k, (frequencies.get(k) ?? 0) + 1)
  }
  return Array.from(frequencies.values()).reduce((sum, count) => sum + (count > 1 ? count - 1 : 0), 0)
}
function metricDefinitionMap(definitions: Definition[]) { return new Map(definitions.map((definition) => [`${definition.scope}:${definition.metric_key}`, definition])) }

function calculateColumnMetrics(columnName: string, rows: Row[]): ColumnResult {
  const values = rows.map((row) => row[columnName])
  const rowCount = values.length
  const nullCount = values.filter(isMissing).length
  const blankCount = values.filter(isBlank).length
  const nonNullValues = values.filter((value) => !isMissing(value))
  const distinctCount = new Set(nonNullValues.map(stableKey)).size
  const distinctRate = nonNullValues.length ? distinctCount / nonNullValues.length : 0
  const frequencies = new Map<string, number>()
  for (const value of nonNullValues) frequencies.set(stableKey(value), (frequencies.get(stableKey(value)) ?? 0) + 1)
  const uniqueCount = Array.from(frequencies.values()).filter((count) => count === 1).length
  const uniqueRate = nonNullValues.length ? uniqueCount / nonNullValues.length : 0
  const nullRate = rowCount ? nullCount / rowCount : 0
  const completenessMissingCount = nullCount + blankCount
  const completenessMissingRate = rowCount ? completenessMissingCount / rowCount : 0
  const completenessRate = rowCount ? 1 - completenessMissingRate : 0
  const patternEligible = values.filter((value) => !isMissing(value))
  const patternCount = patternEligible.filter((value) => patternMatch(columnName, value)).length
  const patternMatchRate = patternEligible.length ? patternCount / patternEligible.length : null
  const sensitiveCount = patternEligible.filter((value) => sensitiveMatch(columnName, value)).length
  const sensitiveMatchRate = patternEligible.length ? sensitiveCount / patternEligible.length : 0
  const strings = nonNullValues.filter((value): value is string => typeof value === 'string')
  const lengths = strings.map((value) => value.length)
  const whitespaceOnlyCount = blankCount
  const emptyStringCount = strings.filter((value) => value === '').length
  const stats = numericStats(values)
  const candidateKeyConfidence = rowCount ? round(uniqueRate * (1 - completenessMissingRate)) : 0
  const metrics: MetricValue[] = [
    { metric_key: 'non_null_count', numeric_value: nonNullValues.length }, { metric_key: 'null_count', numeric_value: nullCount }, { metric_key: 'null_rate', numeric_value: round(nullRate) },
    { metric_key: 'distinct_count', numeric_value: distinctCount }, { metric_key: 'distinct_rate', numeric_value: round(distinctRate) }, { metric_key: 'unique_count', numeric_value: uniqueCount }, { metric_key: 'unique_rate', numeric_value: round(uniqueRate) },
    { metric_key: 'pattern_count', numeric_value: patternCount }, { metric_key: 'pattern_match_rate', numeric_value: patternMatchRate === null ? null : round(patternMatchRate) }, { metric_key: 'sensitive_match_rate', numeric_value: round(sensitiveMatchRate) },
    { metric_key: 'candidate_key_confidence', numeric_value: candidateKeyConfidence }, { metric_key: 'empty_string_count', numeric_value: emptyStringCount }, { metric_key: 'whitespace_only_count', numeric_value: whitespaceOnlyCount },
    { metric_key: 'length_min', numeric_value: lengths.length ? Math.min(...lengths) : null }, { metric_key: 'length_max', numeric_value: lengths.length ? Math.max(...lengths) : null }, { metric_key: 'length_mean', numeric_value: lengths.length ? round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null },
    { metric_key: 'min', numeric_value: stats.min === null ? null : round(stats.min) }, { metric_key: 'max', numeric_value: stats.max === null ? null : round(stats.max) }, { metric_key: 'mean', numeric_value: stats.mean === null ? null : round(stats.mean) }, { metric_key: 'median', numeric_value: stats.median === null ? null : round(stats.median) }, { metric_key: 'stddev', numeric_value: stats.stddev === null ? null : round(stats.stddev) },
    { metric_key: 'negative_count', numeric_value: stats.negative }, { metric_key: 'zero_count', numeric_value: stats.zero }, { metric_key: 'outlier_count', numeric_value: stats.outlier }, { metric_key: 'outlier_rate', numeric_value: stats.nums.length ? round(stats.outlier / stats.nums.length) : null },
  ]
  let finding: ColumnResult['finding']
  if (completenessMissingRate > 0.2) finding = { finding_type: 'COMPLETENESS', severity: completenessMissingRate >= 0.5 ? 'HIGH' : 'MEDIUM', title: `${columnName} has missing values`, description: `${round(completenessMissingRate * 100)}% of observed rows are null, empty, or whitespace-only.`, confidence: 1, evidence: { null_count: nullCount, blank_count: blankCount, missing_count: completenessMissingCount, row_count: rowCount, missing_rate: round(completenessMissingRate) }, recommendation: { action: 'review_source_completeness', threshold: 0.2 } }
  else if (sensitiveMatchRate > 0.8) finding = { finding_type: 'SENSITIVITY', severity: 'INFO', title: `${columnName} appears sensitive`, description: 'Observed values match a known sensitive data pattern.', confidence: round(sensitiveMatchRate), evidence: { sensitive_match_rate: round(sensitiveMatchRate) }, recommendation: { action: 'apply_data_classification_and_access_controls' } }
  return { column_name: columnName, completeness_rate: round(completenessRate), metrics, candidate_key_confidence: candidateKeyConfidence, sensitive_match_rate: round(sensitiveMatchRate), pattern_match_rate: patternMatchRate === null ? null : round(patternMatchRate), finding }
}

export async function loadProfilingRows(supabase: ReturnType<typeof createAdminClient>, datasetVersionId: string, requestedMaxRows: number) {
  const sampling = await resolveSamplingPolicy(supabase, datasetVersionId, requestedMaxRows)
  const maxRows = sampling.loadLimit

  const sampledResult = (rows: Row[], rowCount: number | null, sourceAccess: Record<string, unknown>) => {
    const sampled = applySamplingPolicy(rows, rowCount, sampling)
    const existingWarnings = Array.isArray(sourceAccess.warnings) ? sourceAccess.warnings.filter((item): item is string => typeof item === 'string') : []
    return {
      rowCount: sampled.sourceRowCount,
      rows: sampled.rows,
      sourceAccess: {
        ...sourceAccess,
        sampled_rows: sampled.sampledRows,
        sampling_policy: sampled.policy,
        warnings: [...existingWarnings, ...sampled.warnings],
      },
    }
  }

  const { data: executionRows, error: executionError } = await supabase
    .schema('profiling')
    .from('dataset_execution_sources')
    .select('source_type, source_uri, execution_config, active, updated_at')
    .eq('dataset_version_id', datasetVersionId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (executionError) throw new Error(`Unable to resolve execution source for dataset version ${datasetVersionId}: ${executionError.message}`)

  const executionSource = executionRows?.[0]
  if (executionSource) {
    const sourceType = String(executionSource.source_type ?? '').trim().toLowerCase()
    const executionConfig = executionSource.execution_config && typeof executionSource.execution_config === 'object'
      ? executionSource.execution_config as Record<string, unknown>
      : {}

    if (sourceType === 'file' || sourceType === 'csv') {
      const loaded = await loadFileSource(supabase, { sourceUri: executionSource.source_uri, executionConfig }, { maxRows })
      return sampledResult(loaded.rows as Row[], loaded.rowCount, {
        source_type: sourceType === 'csv' ? 'CSV' : 'FILE',
        source_uri: loaded.sourceUri,
        content_hash: loaded.contentHash,
        warnings: loaded.warnings,
      })
    }

    if (sourceType === 'jdbc') {
      const nested = executionConfig.connection_metadata && typeof executionConfig.connection_metadata === 'object' && !Array.isArray(executionConfig.connection_metadata)
        ? executionConfig.connection_metadata as Record<string, unknown>
        : {}
      const metadata = { ...nested, ...executionConfig }
      const stringField = (keys: string[]) => {
        for (const key of keys) {
          const value = metadata[key]
          if (typeof value === 'string' && value.trim()) return value.trim()
        }
        return null
      }
      const parsed = parseJdbcTableReference(typeof executionSource.source_uri === 'string' ? executionSource.source_uri : null)
      const jdbcUrl = stringField(['jdbc_url', 'jdbcUrl', 'url'])
      const credentialRef = stringField(['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
      const schema = stringField(['schema', 'schema_name', 'schemaName']) ?? parsed?.schema ?? 'public'
      const table = stringField(['table', 'table_name', 'tableName']) ?? parsed?.table
      if (!jdbcUrl || !credentialRef || !table) throw new Error('JDBC execution source configuration is incomplete.')
      const loaded = await loadJdbcRows({ jdbcUrl, credentialRef, schema, table }, maxRows)
      return sampledResult(loaded.rows as Row[], loaded.rowCount ?? loaded.rows.length, {
        source_type: 'JDBC',
        source_uri: executionSource.source_uri,
        connector: { schema, table },
        warnings: loaded.rows.length === maxRows ? [`Connector load was capped at ${maxRows} rows before sampling policy application.`] : [],
      })
    }

    if (['supabase', 'supabase_table', 'postgres', 'postgres_table', 'table'].includes(sourceType)) {
      const schema = typeof executionConfig.schema === 'string' && executionConfig.schema.trim() ? executionConfig.schema.trim() : 'public'
      const table = typeof executionConfig.table === 'string' && executionConfig.table.trim()
        ? executionConfig.table.trim()
        : typeof executionSource.source_uri === 'string'
          ? executionSource.source_uri.replace(/^\w+:\/\//, '').split('.').filter(Boolean).at(-1)
          : null
      if (!table) throw new Error('Table execution source configuration is incomplete.')
      const { count, error: countError } = await supabase.schema(schema).from(table).select('*', { count: 'exact', head: true })
      if (countError) throw new Error(`Unable to count source rows: ${countError.message}`)
      const { data, error } = await supabase.schema(schema).from(table).select('*').range(0, maxRows - 1)
      if (error) throw new Error(`Unable to load source rows: ${error.message}`)
      return sampledResult((data ?? []) as Row[], count ?? 0, { source_type: 'TABLE', schema, table, warnings: [] })
    }
  }

  const { data: versionRows, error: versionError } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('id, dataset_id, source_uri')
    .eq('id', datasetVersionId)
    .limit(1)
  if (versionError) throw new Error(`Unable to resolve dataset version: ${versionError.message}`)
  const version = versionRows?.[0]
  if (!version) throw new Error(`Dataset version ${datasetVersionId} was not found.`)

  const { data: datasetRows, error: datasetError } = await supabase
    .schema('catalog')
    .from('datasets')
    .select('id, data_source_id, source_identifier')
    .eq('id', version.dataset_id)
    .limit(1)
  if (datasetError) throw new Error(`Unable to resolve dataset: ${datasetError.message}`)
  const dataset = datasetRows?.[0]
  if (!dataset?.data_source_id) throw new Error(`No executable source is configured for dataset version ${datasetVersionId}.`)

  const { data: sourceRows, error: sourceError } = await supabase
    .schema('catalog')
    .from('data_sources')
    .select('source_type, connection_metadata')
    .eq('id', dataset.data_source_id)
    .limit(1)
  if (sourceError) throw new Error(`Unable to resolve data source: ${sourceError.message}`)
  const dataSource = sourceRows?.[0]
  const sourceType = String(dataSource?.source_type ?? '').toLowerCase()
  const metadata = dataSource?.connection_metadata && typeof dataSource.connection_metadata === 'object'
    ? dataSource.connection_metadata as Record<string, unknown>
    : {}
  const table = typeof metadata.table === 'string' ? metadata.table : typeof metadata.table_name === 'string' ? metadata.table_name : typeof metadata.tableName === 'string' ? metadata.tableName : null
  const schema = typeof metadata.schema === 'string' && metadata.schema.trim() ? metadata.schema.trim() : typeof metadata.schema_name === 'string' && metadata.schema_name.trim() ? metadata.schema_name.trim() : typeof metadata.schemaName === 'string' && metadata.schemaName.trim() ? metadata.schemaName.trim() : 'public'
  if (!['supabase', 'supabase_table', 'postgres', 'postgres_table', 'table'].includes(sourceType) || !table) throw new Error(`No executable source is configured for dataset version ${datasetVersionId}.`)
  const { count, error: countError } = await supabase.schema(schema).from(table).select('*', { count: 'exact', head: true })
  if (countError) throw new Error(`Unable to count source rows: ${countError.message}`)
  const { data, error } = await supabase.schema(schema).from(table).select('*').range(0, maxRows - 1)
  if (error) throw new Error(`Unable to load source rows: ${error.message}`)
  return sampledResult((data ?? []) as Row[], count ?? 0, { source_type: 'TABLE', schema, table, warnings: [] })
}

export async function executeProfilingMetrics(datasetVersionId: string, profilingRunId: string, input: Record<string, unknown> = {}) {
  const supabase = createAdminClient()
  const { data: activeRun, error: activeRunError } = await supabase.schema('profiling').from('profile_runs').select('id, dataset_version_id, status, summary').eq('id', profilingRunId).maybeSingle()
  if (activeRunError) throw new Error(`Unable to verify profiling run: ${activeRunError.message}`)
  if (!activeRun) throw new Error(`Profiling run ${profilingRunId} was not found.`)
  if (activeRun.dataset_version_id !== datasetVersionId) throw new Error(`Profiling run ${profilingRunId} does not belong to dataset version ${datasetVersionId}.`)
  if (activeRun.status === 'CANCELLED') throw new Error(`Profiling run ${profilingRunId} has been cancelled.`)

  const inputRows = Array.isArray(input.rows) ? input.rows.filter((row): row is Row => !!row && typeof row === 'object' && !Array.isArray(row)) : null
  const loaded = inputRows ? { rowCount: inputRows.length, rows: inputRows } : await loadProfilingRows(supabase, datasetVersionId, 1000)
  const rows = loaded.rows

  const { data: profileColumns, error: columnsError } = await supabase.schema('profiling').from('profile_columns').select('id, column_name').eq('profile_run_id', profilingRunId).order('column_name')
  if (columnsError) throw new Error(`Unable to load profile columns: ${columnsError.message}`)
  const registeredColumnNames = (profileColumns ?? []).map((column) => column.column_name)
  const sourceColumnNames = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const missingRegisteredColumns = registeredColumnNames.filter((name) => !sourceColumnNames.includes(name))
  const unregisteredSourceColumns = sourceColumnNames.filter((name) => !registeredColumnNames.includes(name))
  if (unregisteredSourceColumns.length) throw new Error(`Profile column contract violation for run ${profilingRunId}: source columns are not fully registered.`)
  const columnNames = Array.from(new Set([...registeredColumnNames, ...sourceColumnNames]))

  const { data: definitions, error: definitionError } = await supabase.schema('profiling').from('metric_definitions').select('id, metric_key, scope, enabled').eq('enabled', true)
  if (definitionError) throw new Error(`Unable to load metric definitions: ${definitionError.message}`)
  const enabledDefinitions = (definitions ?? []) as Definition[]
  const unsupportedDefinitions = enabledDefinitions.filter((definition) => !isDeterministicMetric(definition.metric_key, definition.scope))
  if (unsupportedDefinitions.length) throw new Error(`Metric registry does not implement enabled definitions: ${unsupportedDefinitions.map((d) => `${d.scope}:${d.metric_key}`).join(', ')}`)
  const definitionMap = metricDefinitionMap(enabledDefinitions)
  const enabled = DETERMINISTIC_METRICS.filter((metric) => definitionMap.get(`${metric.scope}:${metric.metric_key}`)?.enabled)
  if (!enabled.length) throw new Error('No enabled deterministic metric definitions are available for execution.')

  const results = columnNames.map((columnName) => calculateColumnMetrics(columnName, rows))
  const columnIdByName = new Map((profileColumns ?? []).map((column) => [column.column_name, column.id]))
  if (missingRegisteredColumns.length === 0 && columnNames.some((name) => !columnIdByName.has(name))) throw new Error(`Profile column contract violation for run ${profilingRunId}: source columns are not fully registered.`)

  const metricRows: Record<string, unknown>[] = []
  for (const result of results) for (const metric of result.metrics) { const definition = definitionMap.get(`COLUMN:${metric.metric_key}`); if (!definition?.enabled) continue; metricRows.push({ metric_definition_id: definition.id, profile_column_id: columnIdByName.get(result.column_name), metric_key: metric.metric_key, ...(metric.numeric_value !== undefined && metric.numeric_value !== null ? { numeric_value: metric.numeric_value } : {}), ...(metric.text_value !== undefined && metric.text_value !== null ? { text_value: metric.text_value } : {}), ...(metric.json_value !== undefined && metric.json_value !== null ? { json_value: metric.json_value } : {}) }) }
  const duplicateRows = duplicateRowCount(rows)
  const duplicateMetricBasis = rows.length < loaded.rowCount ? 'SAMPLE' : 'FULL_DATASET'
  const datasetMetricValues: Record<string, number | string> = { column_count: columnNames.length, row_count: loaded.rowCount, duplicate_row_count: duplicateRows, duplicate_row_rate: rows.length ? round(duplicateRows / rows.length) : 0, schema_hash: schemaHash(columnNames) }
  for (const metric of enabled.filter((m) => m.scope === 'DATASET')) { const definition = definitionMap.get(`DATASET:${metric.metric_key}`); if (!definition) throw new Error(`Enabled dataset metric ${metric.metric_key} is missing from the registry catalog.`); const value = datasetMetricValues[metric.metric_key]; metricRows.push({ metric_definition_id: definition.id, profile_column_id: null, metric_key: metric.metric_key, ...(typeof value === 'number' ? { numeric_value: value } : {}), ...(typeof value === 'string' ? { text_value: value } : {}) }) }
  for (const result of results) {
    const values = rows.map((row) => row[result.column_name])
    const stats = numericStats(values)
    for (const metric of enabled.filter((m) => m.scope === 'DISTRIBUTION')) { const definition = definitionMap.get(`DISTRIBUTION:${metric.metric_key}`); if (!definition) throw new Error(`Enabled distribution metric ${metric.metric_key} is missing from the registry catalog.`); const nonNull = values.filter((v) => !isMissing(v)); const frequencies = new Map<string, { value: unknown; count: number }>(); for (const value of nonNull) { const k = stableKey(value); const existing = frequencies.get(k); frequencies.set(k, existing ? { value: existing.value, count: existing.count + 1 } : { value, count: 1 }) }; let jsonValue: unknown = []; if (metric.metric_key === 'top_values') jsonValue = Array.from(frequencies.values()).sort((a, b) => b.count - a.count).slice(0, 10); if (metric.metric_key === 'quantiles') jsonValue = stats.nums.length ? { p01: round(percentile(stats.nums, 0.01)!), p05: round(percentile(stats.nums, 0.05)!), p25: round(percentile(stats.nums, 0.25)!), p50: round(percentile(stats.nums, 0.5)!), p75: round(percentile(stats.nums, 0.75)!), p95: round(percentile(stats.nums, 0.95)!), p99: round(percentile(stats.nums, 0.99)!) } : {}; if (metric.metric_key === 'histogram') jsonValue = histogram(stats.nums); metricRows.push({ metric_definition_id: definition.id, profile_column_id: columnIdByName.get(result.column_name), metric_key: metric.metric_key, json_value: jsonValue }) }
  }

  const findings = results.filter((result) => result.finding).map((result) => ({ profile_column_id: columnIdByName.get(result.column_name), ...result.finding }))
  const completeness = results.length ? results.reduce((sum, result) => sum + result.completeness_rate, 0) / results.length : 0
  const uniqueness = results.length ? results.reduce((sum, result) => sum + (result.metrics.find((m) => m.metric_key === 'unique_rate')?.numeric_value ?? 0), 0) / results.length : 0
  const validityCandidates = results.map((result) => result.pattern_match_rate).filter((value): value is number => value !== null)
  const validity = validityCandidates.length ? validityCandidates.reduce((sum, value) => sum + value, 0) / validityCandidates.length : 1
  const scorePayload = { completeness_score: round(completeness), uniqueness_score: round(uniqueness), validity_score: round(validity), accuracy_score: null, overall_score: round((completeness + uniqueness + validity) / 3), scoring_basis: 'deterministic_metrics' }
  const existingSummary = activeRun.summary && typeof activeRun.summary === 'object' && !Array.isArray(activeRun.summary) ? activeRun.summary as Record<string, unknown> : {}
  const baseSummary = { ...existingSummary, metric_engine: 'deterministic_registry', metric_registry_version: '1.1', sample_size: rows.length, score: scorePayload, source_access: 'sourceAccess' in loaded ? loaded.sourceAccess : { source_type: 'TABLE' }, enabled_metric_count: enabled.length, schema_columns: columnNames, duplicate_metric_basis: duplicateMetricBasis, duplicate_metric_sample_size: rows.length, duplicate_metric_denominator: rows.length, profiling_warnings: missingRegisteredColumns.length ? [`${missingRegisteredColumns.length} registered schema columns had no observed rows in the sample.`] : [] }
  const metricsPayload = metricRows.map((metric) => ({ profile_run_id: profilingRunId, ...metric }))
  const findingsPayload = findings.map((finding) => ({ profile_run_id: profilingRunId, ...finding }))
  const { error: persistenceError } = await supabase.schema('profiling').rpc('persist_profiling_results', { p_profile_run_id: profilingRunId, p_dataset_version_id: datasetVersionId, p_metrics: metricsPayload, p_findings: findingsPayload, p_score: scorePayload, p_summary: baseSummary, p_status: 'COMPLETED' })
  if (persistenceError) throw new Error(`Unable to atomically persist profiling results: ${persistenceError.message}`)
  return { tool: 'execute_metrics', status: 'COMPLETED', dataset_version_id: datasetVersionId, profiling_run_id: profilingRunId, row_count: loaded.rowCount, column_count: columnNames.length, metrics_persisted: metricRows.length, findings_persisted: findings.length, score: scorePayload, source_access: 'sourceAccess' in loaded ? loaded.sourceAccess : { source_type: 'TABLE' }, columns: results, registry_metrics_enabled: enabled.length, duplicate_metric_basis: duplicateMetricBasis }
}
