import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadFileSource } from '@/lib/profiling/file-source-adapter'
import { applySamplingPolicy, resolveSamplingPolicy } from '@/lib/profiling/sampling'

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function inferType(values: unknown[]) {
  const nonNull = values.filter((value) => value !== null && value !== undefined && value !== '')
  if (!nonNull.length) return 'unknown'
  if (nonNull.every((value) => typeof value === 'boolean')) return 'boolean'
  if (nonNull.every((value) => typeof value === 'number' && Number.isFinite(value))) return 'number'
  if (nonNull.every((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)))) return 'date'
  if (nonNull.every((value) => typeof value === 'string')) return 'string'
  return 'string'
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function executeFileProfileDataset(datasetVersionId: string, profilingRunId: string) {
  const supabase = createAdminClient()

  const { data: versionRows, error: versionError } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('id,metadata,source_uri,dataset_id')
    .eq('id', datasetVersionId)
    .limit(1)
  if (versionError) throw new Error(`Unable to load FILE dataset version: ${versionError.message}`)
  const version = versionRows?.[0]
  if (!version) throw new Error(`Unable to load FILE dataset version: ${datasetVersionId} was not found.`)

  const { data: sourceRows, error: sourceError } = await supabase
    .schema('profiling')
    .from('dataset_execution_sources')
    .select('source_type,source_uri,execution_config,active,updated_at')
    .eq('dataset_version_id', datasetVersionId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (sourceError) throw new Error(`Unable to load FILE execution source: ${sourceError.message}`)
  const executionSource = sourceRows?.[0]
  const sourceType = String(executionSource?.source_type ?? '').toUpperCase()
  if (!executionSource || !['FILE','CSV'].includes(sourceType)) throw new Error('FILE dataset execution source is not active.')

  const executionConfig = record(executionSource.execution_config)
  const connectionMetadata = record(executionConfig.connection_metadata)
  const sampling = await resolveSamplingPolicy(supabase, datasetVersionId, 1000)
  const loaded = await loadFileSource(
    supabase,
    {
      sourceUri: typeof executionSource.source_uri === 'string' ? executionSource.source_uri : version.source_uri,
      executionConfig: { ...connectionMetadata, ...executionConfig },
    },
    { maxRows: sampling.loadLimit, maxBytes: sampling.capacityMaxFileBytes },
  )

  const sampled = applySamplingPolicy(loaded.rows as Record<string, unknown>[], loaded.rowCount, sampling)
  const sampledRows = sampled.rows

  const names = Array.from(sampledRows.reduce<Set<string>>((set, row) => {
    Object.keys(row).forEach((name) => set.add(name))
    return set
  }, new Set()))

  const columns = names.map((name, index) => {
    const values = sampledRows.map((row) => row[name])
    const nullCount = values.filter((value) => value === null || value === undefined).length
    const distinct = new Set(values.filter((value) => value !== null && value !== undefined).map((value) => typeof value === 'string' ? value.trim() : JSON.stringify(value)))
    return {
      name,
      ordinal_position: index + 1,
      source_type: loaded.format === 'binary' ? 'metadata' : loaded.format,
      inferred_type: inferType(values),
      total_count: values.length,
      non_null_count: values.length - nullCount,
      null_count: nullCount,
      blank_count: values.filter((value) => typeof value === 'string' && value.trim() === '').length,
      zero_count: values.filter((value) => value === 0 || value === '0').length,
      distinct_count: distinct.size,
      distinct_percentage: values.length ? distinct.size / values.length * 100 : 0,
      metadata: {
        profiling_sampled: true,
        profiling_sample_size: sampledRows.length,
        profiling_row_count: sampled.sourceRowCount,
        file_format: loaded.format,
        file_metadata: loaded.metadata,
      },
    }
  })

  const sourceAccess = {
    mode: loaded.format === 'binary' ? 'metadata_only' : 'source_rows',
    connector: { kind: 'file', format: loaded.format, source_uri: loaded.sourceUri },
    sampled_rows: sampled.sampledRows,
    sampling_policy: sampled.policy,
    warnings: [...loaded.warnings, ...sampled.warnings],
    metadata: loaded.metadata,
  }
  const schemaSnapshot = { row_count: sampled.sourceRowCount, column_count: columns.length, source_access: sourceAccess, columns }
  const schemaHash = stableHash(columns.map((column) => ({ name: column.name, ordinal_position: column.ordinal_position, source_type: column.source_type, inferred_type: column.inferred_type })))

  const { error: deleteError } = await supabase.schema('profiling').from('profile_columns').delete().eq('profile_run_id', profilingRunId)
  if (deleteError) throw new Error(`Unable to reset FILE profile columns: ${deleteError.message}`)
  if (columns.length) {
    const { error: insertError } = await supabase.schema('profiling').from('profile_columns').insert(columns.map((column) => ({
      profile_run_id: profilingRunId,
      column_name: column.name,
      ordinal_position: column.ordinal_position,
      source_type: column.source_type,
      inferred_type: column.inferred_type,
      total_count: column.total_count,
      non_null_count: column.non_null_count,
      null_count: column.null_count,
      blank_count: column.blank_count,
      zero_count: column.zero_count,
      distinct_count: column.distinct_count,
      distinct_percentage: column.distinct_percentage,
      metadata: column.metadata,
    })))
    if (insertError) throw new Error(`Unable to persist FILE profile columns: ${insertError.message}`)
  }

  const { data: snapshot, error: snapshotError } = await supabase.schema('profiling').from('schema_snapshots').upsert({
    profile_run_id: profilingRunId,
    dataset_version_id: datasetVersionId,
    schema_hash: schemaHash,
    schema: schemaSnapshot,
  }, { onConflict: 'profile_run_id' }).select().single()
  if (snapshotError) throw new Error(`Unable to persist FILE schema snapshot: ${snapshotError.message}`)

  const { data: run, error: runError } = await supabase.schema('profiling').from('profile_runs').update({
    row_count: sampled.sourceRowCount,
    column_count: columns.length,
    schema_hash: schemaHash,
    summary: {
      row_count: sampled.sourceRowCount,
      column_count: columns.length,
      schema_hash: schemaHash,
      source_access: sourceAccess,
      file_metadata: loaded.metadata,
      columns: columns.map((column) => ({ name: column.name, type: column.inferred_type })),
    },
  }).eq('id', profilingRunId).select().single()
  if (runError) throw new Error(`Unable to update FILE profile run summary: ${runError.message}`)

  return {
    tool: 'profile_dataset',
    connector: 'file',
    profiling_run_id: profilingRunId,
    dataset_version_id: datasetVersionId,
    status: 'COMPLETED',
    row_count: sampled.sourceRowCount,
    column_count: columns.length,
    schema_hash: schemaHash,
    source_access: sourceAccess,
    snapshot,
    profile_run: run,
  }
}
