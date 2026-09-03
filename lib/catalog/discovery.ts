import { createAdminClient } from '@/lib/supabase/admin'
import { discoverJdbcCatalog, validateJdbcConnection } from '@/lib/connectors/jdbc'
import { loadFileSource } from '@/lib/profiling/file-source-adapter'

type Source = {
  id: string
  project_id: string
  name: string
  source_type: string
  status: string
  connection_metadata: Record<string, unknown> | null
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function stringField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}
function inferType(value: unknown) {
  if (value === null || value === undefined) return 'unknown'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'datetime'
  return typeof value
}

async function resolveSourceLocation(source: Source) {
  const admin = createAdminClient()
  const metadata = record(source.connection_metadata)
  const explicit = stringField(metadata, ['source_uri','sourceUri','url','path','file'])
  if (explicit && (/^https?:\/\//i.test(explicit) || explicit.includes('/'))) return { sourceUri: explicit, executionConfig: metadata }

  const { data: dataset, error: datasetError } = await admin
    .schema('catalog')
    .from('datasets')
    .select('id,source_identifier')
    .eq('data_source_id', source.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (datasetError) throw new Error(`Unable to resolve FILE source dataset: ${datasetError.message}`)
  if (!dataset) return null

  const { data: version, error: versionError } = await admin
    .schema('catalog')
    .from('dataset_versions')
    .select('id,source_uri')
    .eq('dataset_id', dataset.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (versionError) throw new Error(`Unable to resolve FILE source version: ${versionError.message}`)

  if (version) {
    const { data: execution, error: executionError } = await admin
      .schema('profiling')
      .from('dataset_execution_sources')
      .select('source_uri,execution_config')
      .eq('dataset_version_id', version.id)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (executionError) throw new Error(`Unable to resolve FILE execution source: ${executionError.message}`)
    if (execution?.source_uri) return { sourceUri: execution.source_uri, executionConfig: { ...metadata, ...record(execution.execution_config) } }
    if (version.source_uri) return { sourceUri: version.source_uri, executionConfig: metadata }
  }
  if (dataset.source_identifier) return { sourceUri: dataset.source_identifier, executionConfig: metadata }
  return null
}

async function discoverJdbc(source: Source) {
  const metadata = record(source.connection_metadata)
  const jdbcUrl = stringField(metadata, ['jdbc_url','jdbcUrl','url'])
  const credentialRef = stringField(metadata, ['credential_ref','credentialRef','secret_ref','secretRef'])
  const configuredSchema = stringField(metadata, ['schema','schema_name','schemaName'])
  if (!jdbcUrl || !credentialRef) throw new Error('JDBC source discovery requires jdbc_url and credential_ref.')

  const root = await discoverJdbcCatalog({ jdbcUrl, credentialRef, ...(configuredSchema ? { schema: configuredSchema } : {}) })
  const schemas = configuredSchema ? [configuredSchema] : root.schemas.slice(0, 25)
  const assets: Array<{asset_type:string;namespace:string|null;name:string;columns:unknown[];metadata:Record<string,unknown>}> = []

  const discoverSchema = async (schema: string) => {
    const catalog = configuredSchema === schema ? root : await discoverJdbcCatalog({ jdbcUrl, credentialRef, schema })
    return catalog.tables.slice(0, 100).map((table) => ({ schema, table }))
  }
  const tableRefs = (await Promise.all((schemas.length ? schemas : ['public']).map(discoverSchema))).flat().slice(0, 250)

  for (let index = 0; index < tableRefs.length; index += 5) {
    const batch = tableRefs.slice(index, index + 5)
    const results = await Promise.all(batch.map(async ({ schema, table }) => {
      const validation = await validateJdbcConnection({ jdbcUrl, credentialRef, schema, table: table.name })
      return {
        asset_type: String(table.type ?? 'TABLE').toUpperCase(),
        namespace: schema,
        name: table.name,
        columns: validation.columns,
        metadata: {
          source_type: 'JDBC',
          table_type: table.type ?? null,
          row_count: validation.rowCount,
          validation_errors: validation.errors,
          validation_warnings: validation.warnings,
          validation_details: validation.details,
        },
      }
    }))
    assets.push(...results)
  }

  return {
    assets,
    snapshot: {
      source_type: 'JDBC',
      schemas: root.schemas,
      configured_schema: configuredSchema,
      asset_count: assets.length,
      truncated: tableRefs.length >= 250,
      catalog_details: root.details,
    },
  }
}

async function discoverFile(source: Source) {
  const location = await resolveSourceLocation(source)
  if (!location) throw new Error('FILE source has no executable URL, Supabase Storage path, or registered dataset execution location.')
  const admin = createAdminClient()
  const loaded = await loadFileSource(admin, location, { maxRows: 100, maxBytes: 50 * 1024 * 1024 })
  const columnNames = Array.from(loaded.rows.reduce<Set<string>>((names, row) => {
    Object.keys(row).forEach((name) => names.add(name))
    return names
  }, new Set()))
  const columns = columnNames.map((name) => {
    const sample = loaded.rows.find((row) => row[name] !== null && row[name] !== undefined)?.[name]
    return { name, type: inferType(sample) }
  })
  const name = String(loaded.metadata.file_name ?? source.name)
  return {
    assets: [{
      asset_type: loaded.format === 'binary' ? 'FILE_METADATA' : 'FILE',
      namespace: null,
      name,
      columns,
      metadata: {
        ...loaded.metadata,
        format: loaded.format,
        content_type: loaded.contentType,
        row_count: loaded.rowCount,
        sampled_rows: loaded.rows.length,
        warnings: loaded.warnings,
      },
    }],
    snapshot: {
      source_type: source.source_type,
      source_uri: loaded.sourceUri,
      format: loaded.format,
      content_type: loaded.contentType,
      asset_count: 1,
      metadata: loaded.metadata,
      warnings: loaded.warnings,
    },
  }
}

export async function executeMetadataDiscovery(sourceId: string) {
  const admin = createAdminClient()
  const { data: source, error: sourceError } = await admin
    .schema('catalog')
    .from('data_sources')
    .select('id,project_id,name,source_type,status,connection_metadata')
    .eq('id', sourceId)
    .maybeSingle()
  if (sourceError || !source) throw new Error(`Unable to resolve discovery source: ${sourceError?.message ?? 'not found'}`)
  if (!['ACTIVE','CONFIGURED'].includes(String(source.status).toUpperCase())) throw new Error('Source must be ACTIVE or CONFIGURED before metadata discovery.')

  const typedSource = source as Source
  const { data: run, error: runError } = await admin.schema('catalog').from('discovery_runs').insert({
    project_id: source.project_id,
    source_id: source.id,
    status: 'RUNNING',
  }).select('id').single()
  if (runError || !run) throw new Error(`Unable to create metadata discovery run: ${runError?.message ?? 'unknown error'}`)

  try {
    const sourceType = String(source.source_type).toUpperCase()
    const result = sourceType === 'JDBC'
      ? await discoverJdbc(typedSource)
      : ['FILE','CSV'].includes(sourceType)
        ? await discoverFile(typedSource)
        : { assets: [], snapshot: { source_type: sourceType, asset_count: 0, warning: 'No discovery adapter is registered for this source type.' } }

    if (result.assets.length) {
      const { error: assetsError } = await admin.schema('catalog').from('discovered_assets').insert(result.assets.map((asset) => ({
        discovery_run_id: run.id,
        source_id: source.id,
        asset_type: asset.asset_type,
        namespace: asset.namespace,
        name: asset.name,
        columns: asset.columns,
        metadata: asset.metadata,
      })))
      if (assetsError) throw new Error(`Unable to persist discovered assets: ${assetsError.message}`)
    }

    const completedAt = new Date().toISOString()
    const { error: completeError } = await admin.schema('catalog').from('discovery_runs').update({
      status: 'COMPLETED',
      assets_discovered: result.assets.length,
      schema_snapshot: result.snapshot,
      completed_at: completedAt,
    }).eq('id', run.id)
    if (completeError) throw new Error(`Unable to complete discovery run: ${completeError.message}`)

    const { data: datasets, error: datasetsError } = await admin.schema('catalog').from('datasets').select('id').eq('data_source_id', source.id)
    if (datasetsError) throw new Error(`Unable to resolve discovery lineage datasets: ${datasetsError.message}`)
    for (const dataset of datasets ?? []) {
      const { error: lineageError } = await admin.schema('governance').from('lineage_edges').upsert({
        project_id: source.project_id,
        source_type: 'DATA_SOURCE',
        source_id: source.id,
        target_type: 'DATASET',
        target_id: dataset.id,
        relationship: 'DISCOVERED_SOURCE',
        metadata: { discovery_run_id: run.id, assets_discovered: result.assets.length, discovered_at: completedAt },
      }, { onConflict: 'project_id,source_type,source_id,target_type,target_id,relationship' })
      if (lineageError) console.error('[metadata-discovery-lineage]', lineageError.message)
    }

    return { discoveryRunId: run.id, sourceId: source.id, assetsDiscovered: result.assets.length, snapshot: result.snapshot }
  } catch (error) {
    await admin.schema('catalog').from('discovery_runs').update({
      status: 'FAILED',
      error_message: error instanceof Error ? error.message : 'Metadata discovery failed.',
      completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    throw error
  }
}
