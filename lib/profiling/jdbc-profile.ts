import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadJdbcRows, parseJdbcTableReference } from '@/lib/connectors/jdbc'
import { applySamplingPolicy, resolveSamplingPolicy } from '@/lib/profiling/sampling'

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstString(source: RecordValue, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(source[key])
    if (value) return value
  }
  return null
}

function inferType(values: unknown[], declared?: string | null) {
  const type = declared?.toLowerCase() ?? ''
  if (/bool/.test(type)) return 'boolean'
  if (/date|time|timestamp/.test(type)) return 'date'
  if (/int|decimal|numeric|real|double|float|number|money/.test(type)) return 'number'
  if (/char|text|string|uuid|json|xml/.test(type)) return 'string'
  const nonNull = values.filter((value) => value !== null && value !== undefined && value !== '')
  if (nonNull.length === 0) return 'unknown'
  if (nonNull.every((value) => typeof value === 'boolean' || /^(true|false)$/i.test(String(value)))) return 'boolean'
  if (nonNull.every((value) => typeof value === 'number' || /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim()))) return 'number'
  if (nonNull.every((value) => !Number.isNaN(Date.parse(String(value))) && /^\d{4}-\d{2}-\d{2}/.test(String(value)))) return 'date'
  return 'string'
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function executeJdbcProfileDataset(datasetVersionId: string, profilingRunId: string) {
  const supabase = createAdminClient()
  const { data: datasetVersionRows, error: versionError } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('id, metadata, source_uri, dataset_id')
    .eq('id', datasetVersionId)
    .limit(1)
  if (versionError) throw new Error(`Unable to load JDBC dataset version: ${versionError.message}`)
  const datasetVersion = datasetVersionRows?.[0]
  if (!datasetVersion) throw new Error(`Unable to load JDBC dataset version: ${datasetVersionId} was not found.`)

  const { data: executionSourceRows, error: executionSourceError } = await supabase
    .schema('profiling')
    .from('dataset_execution_sources')
    .select('source_type, source_uri, execution_config, active, updated_at')
    .eq('dataset_version_id', datasetVersionId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (executionSourceError) throw new Error(`Unable to load JDBC execution source: ${executionSourceError.message}`)
  const executionSource = executionSourceRows?.[0]
  if (!executionSource || String(executionSource.source_type).toUpperCase() !== 'JDBC') throw new Error('JDBC dataset execution source is not active.')

  const executionConfig = record(executionSource.execution_config)
  const nestedConnectionMetadata = record(executionConfig.connection_metadata)
  const metadata = { ...nestedConnectionMetadata, ...executionConfig }
  const versionMetadata = record(datasetVersion.metadata)
  const jdbcUrl = firstString(metadata, ['jdbc_url', 'jdbcUrl', 'url'])
  const credentialRef = firstString(metadata, ['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
  const parsedReference = parseJdbcTableReference(stringValue(executionSource.source_uri) ?? stringValue(datasetVersion.source_uri))
  const schema = firstString(metadata, ['schema', 'schema_name', 'schemaName']) ?? parsedReference?.schema ?? 'public'
  const table = firstString(metadata, ['table', 'table_name', 'tableName']) ?? parsedReference?.table
  if (!jdbcUrl || !credentialRef || !table || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema) || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(table)) throw new Error('JDBC dataset source configuration is incomplete or invalid.')

  const sampling = await resolveSamplingPolicy(supabase, datasetVersionId, 1000)
  const loaded = await loadJdbcRows({ jdbcUrl, credentialRef, schema, table }, sampling.loadLimit)
  const sampled = applySamplingPolicy(loaded.rows as Record<string, unknown>[], loaded.rowCount ?? sampledRows.length, sampling)
  const sampledRows = sampled.rows
  const metadataColumns = Array.isArray(versionMetadata.columns) ? versionMetadata.columns : []
  const declared = new Map(metadataColumns.map((column) => {
    const item = record(column)
    return [firstString(item, ['name', 'column_name', 'columnName']), firstString(item, ['data_type', 'physical_type', 'logical_type', 'type'])] as const
  }).filter(([name]) => Boolean(name)))
  const names = Array.from(new Set([...metadataColumns.map((column) => firstString(record(column), ['name', 'column_name', 'columnName'])).filter((name): name is string => Boolean(name)), ...loaded.columns.map((column) => column.name), ...sampledRows.flatMap((row) => Object.keys(row))]))
  const columns = names.map((name, index) => {
    const values = sampledRows.map((row) => row[name])
    const nullCount = values.filter((value) => value === null || value === undefined).length
    const distinct = new Set(values.filter((value) => value !== null && value !== undefined).map((value) => typeof value === 'string' ? value.trim() : JSON.stringify(value)))
    return {
      name,
      ordinal_position: index + 1,
      source_type: declared.get(name) ?? loaded.columns.find((column) => column.name === name)?.type ?? null,
      inferred_type: inferType(values, declared.get(name) ?? loaded.columns.find((column) => column.name === name)?.type),
      total_count: values.length,
      non_null_count: values.length - nullCount,
      null_count: nullCount,
      blank_count: values.filter((value) => typeof value === 'string' && value.trim() === '').length,
      zero_count: values.filter((value) => value === 0 || value === '0').length,
      distinct_count: distinct.size,
      distinct_percentage: values.length ? distinct.size / values.length * 100 : 0,
      metadata: { profiling_sampled: true, profiling_sample_size: sampledRows.length, profiling_row_count: sampled.sourceRowCount },
    }
  })
  const schemaSnapshot = { row_count: sampled.sourceRowCount, column_count: columns.length, source_access: { mode: 'source_rows', connector: { kind: 'jdbc', schema, table }, sampled_rows: sampled.sampledRows, sampling_policy: sampled.policy, warnings: sampled.warnings }, columns }
  const schemaHash = stableHash(columns.map((column) => ({ name: column.name, ordinal_position: column.ordinal_position, source_type: column.source_type, inferred_type: column.inferred_type })))

  const { error: deleteColumnsError } = await supabase.schema('profiling').from('profile_columns').delete().eq('profile_run_id', profilingRunId)
  if (deleteColumnsError) throw new Error(`Unable to reset JDBC profile columns: ${deleteColumnsError.message}`)
  if (columns.length) {
    const { error: insertColumnsError } = await supabase.schema('profiling').from('profile_columns').insert(columns.map((column) => ({ profile_run_id: profilingRunId, column_name: column.name, ordinal_position: column.ordinal_position, source_type: column.source_type, inferred_type: column.inferred_type, total_count: column.total_count, non_null_count: column.non_null_count, null_count: column.null_count, blank_count: column.blank_count, zero_count: column.zero_count, distinct_count: column.distinct_count, distinct_percentage: column.distinct_percentage, metadata: column.metadata })))
    if (insertColumnsError) throw new Error(`Unable to persist JDBC profile columns: ${insertColumnsError.message}`)
  }
  const { data: snapshot, error: snapshotError } = await supabase.schema('profiling').from('schema_snapshots').upsert({ profile_run_id: profilingRunId, dataset_version_id: datasetVersionId, schema_hash: schemaHash, schema: schemaSnapshot }, { onConflict: 'profile_run_id' }).select().single()
  if (snapshotError) throw new Error(`Unable to persist JDBC schema snapshot: ${snapshotError.message}`)
  const { data: run, error: runError } = await supabase.schema('profiling').from('profile_runs').update({ row_count: sampled.sourceRowCount, column_count: columns.length, schema_hash: schemaHash, summary: { row_count: sampled.sourceRowCount, column_count: columns.length, schema_hash: schemaHash, source_access: schemaSnapshot.source_access, columns: columns.map((column) => ({ name: column.name, type: column.inferred_type })) } }).eq('id', profilingRunId).select().single()
  if (runError) throw new Error(`Unable to update JDBC profile run summary: ${runError.message}`)
  return { tool: 'profile_dataset', connector: 'jdbc', profiling_run_id: profilingRunId, dataset_version_id: datasetVersionId, status: 'COMPLETED', row_count: sampled.sourceRowCount, column_count: columns.length, schema_hash: schemaHash, source_access: schemaSnapshot.source_access, snapshot, profile_run: run }
}
