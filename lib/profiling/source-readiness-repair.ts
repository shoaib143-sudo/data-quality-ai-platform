import { discoverNativeHierarchy } from '@/lib/connectors/native-hierarchy-discovery'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateDataSourceForProfiling, type SourceValidationResult } from '@/lib/profiling/source-validation'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

function sourceIdentifier(source: { source_type: string | null; connection_metadata: unknown }) {
  const metadata = record(source.connection_metadata)
  const type = String(source.source_type ?? '').toLowerCase()
  if (type === 'jdbc') {
    const catalog = text(metadata.catalog || metadata.catalog_name || metadata.catalogName)
    const schema = text(metadata.schema || metadata.schema_name || metadata.schemaName) || 'public'
    const table = text(metadata.table || metadata.table_name || metadata.tableName)
    return table ? `jdbc-table://${catalog ? `${catalog}.` : ''}${schema}.${table}` : ''
  }
  if (type === 'csv' || type === 'file') return text(metadata.url || metadata.source_url || metadata.sourceUrl) || (metadata.bucket && metadata.path ? `${metadata.bucket}/${metadata.path}` : '')
  const schema = text(metadata.schema || metadata.schema_name || metadata.schemaName) || 'public'
  const table = text(metadata.table || metadata.table_name || metadata.tableName)
  return table ? `${schema}.${table}` : ''
}

function validationCode(errors: string[]) {
  if (errors.some(error => error.includes('credential_ref'))) return 'JDBC_CREDENTIAL_REF_MISSING'
  if (errors.some(error => error.includes('table name') || error.includes('object/table identity'))) return 'SOURCE_TABLE_MISSING'
  if (errors.some(error => error.includes('source identifier'))) return 'SOURCE_IDENTIFIER_MISSING'
  if (errors.some(error => error.includes('jdbc_url'))) return 'JDBC_URL_MISSING'
  if (errors.some(error => error.includes('connectivity') || error.includes('bridge'))) return 'SOURCE_CONNECTIVITY_FAILED'
  return errors.length ? 'SOURCE_VALIDATION_FAILED' : null
}

async function validateNativeConnection(source: { source_type: string | null; connection_metadata: unknown }): Promise<SourceValidationResult | null> {
  if (String(source.source_type ?? '').toLowerCase() !== 'jdbc') return null
  const metadata = record(source.connection_metadata)
  if (!metadata.hierarchy_selection) return null
  const jdbcUrl = text(metadata.jdbc_url || metadata.jdbcUrl || metadata.url)
  const credentialRef = text(metadata.credential_ref || metadata.credentialRef || metadata.secret_ref || metadata.secretRef)
  if (!jdbcUrl || !credentialRef) return {
    valid: false,
    source_type: 'JDBC',
    execution_type: 'JDBC',
    source_uri: 'jdbc-connection://',
    checks: { configuration: false, connectivity: false, schema_available: false },
    details: { jdbc_url: jdbcUrl || null, credential_ref: credentialRef || null, native_hierarchy: true },
    errors: [!jdbcUrl ? 'JDBC sources require jdbc_url in connection metadata.' : 'JDBC sources require credential_ref; raw database passwords are not accepted.'],
    warnings: [],
  }

  try {
    const hierarchy = await discoverNativeHierarchy({ jdbcUrl, credentialRef })
    const objectCount = hierarchy.nodes.filter(node => node.kind === 'OBJECT').length
    const fieldCount = hierarchy.nodes.filter(node => node.kind === 'FIELD').length
    return {
      valid: hierarchy.nodes.length > 0,
      source_type: 'JDBC',
      execution_type: 'JDBC',
      source_uri: `jdbc-connection://${hierarchy.databaseProduct}`,
      checks: { configuration: true, connectivity: true, schema_available: objectCount > 0 },
      details: {
        jdbc_url: jdbcUrl,
        credential_ref: credentialRef,
        database_product: hierarchy.databaseProduct,
        database_version: hierarchy.databaseVersion,
        native_terms: hierarchy.terms,
        hierarchy_node_count: hierarchy.nodes.length,
        object_count: objectCount,
        field_count: fieldCount,
        hierarchy_truncated: hierarchy.truncated,
      },
      errors: [],
      warnings: hierarchy.warnings,
    }
  } catch (error) {
    return {
      valid: false,
      source_type: 'JDBC',
      execution_type: 'JDBC',
      source_uri: 'jdbc-connection://',
      checks: { configuration: true, connectivity: false, schema_available: false },
      details: { jdbc_url: jdbcUrl, credential_ref: credentialRef, native_hierarchy: true },
      errors: [error instanceof Error ? error.message : 'Native database hierarchy validation failed.'],
      warnings: [],
    }
  }
}

async function reconcileBoundDatasets(
  admin: ReturnType<typeof createAdminClient>,
  source: { id: string; project_id: string; source_type: string | null; connection_metadata: unknown },
  validation: Awaited<ReturnType<typeof validateDataSourceForProfiling>>,
  now: string,
) {
  const { data: datasets, error: datasetError } = await admin.schema('catalog').from('datasets').select('id, metadata').eq('project_id', source.project_id).eq('data_source_id', source.id)
  if (datasetError) throw new Error(`Unable to resolve source datasets: ${datasetError.message}`)
  const datasetIds = (datasets ?? []).map(item => item.id)
  if (!datasetIds.length) return

  const { data: versions, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,metadata').in('dataset_id', datasetIds).order('version_number', { ascending: false })
  if (versionError) throw new Error(`Unable to resolve source dataset versions: ${versionError.message}`)
  const latestByDataset = new Map<string, { id: string; dataset_id: string; metadata: unknown }>()
  for (const version of versions ?? []) if (!latestByDataset.has(version.dataset_id)) latestByDataset.set(version.dataset_id, version)
  const versionIds = [...latestByDataset.values()].map(version => version.id)
  if (!versionIds.length) return

  if (!validation.valid) {
    const { error } = await admin.schema('profiling').from('dataset_execution_sources').update({ active: false, updated_at: now }).in('dataset_version_id', versionIds)
    if (error) throw new Error(`Unable to deactivate invalid source execution bindings: ${error.message}`)
    return
  }

  const sourceMetadata = record(source.connection_metadata)
  const { data: executionSources, error: executionSourceError } = await admin.schema('profiling').from('dataset_execution_sources').select('id,dataset_version_id,execution_config').in('dataset_version_id', versionIds)
  if (executionSourceError) throw new Error(`Unable to resolve source execution bindings: ${executionSourceError.message}`)
  const executionByVersion = new Map((executionSources ?? []).map(item => [item.dataset_version_id, item]))
  const datasetById = new Map((datasets ?? []).map(dataset => [dataset.id, dataset]))

  for (const version of latestByDataset.values()) {
    const execution = executionByVersion.get(version.id)
    if (!execution) continue
    const executionConfig = record(execution.execution_config)
    const versionMetadata = record(version.metadata)
    const dataset = datasetById.get(version.dataset_id)
    const datasetMetadata = record(dataset?.metadata)

    const { error: versionUpdateError } = await admin.schema('catalog').from('dataset_versions').update({
      status: 'AVAILABLE',
      observed_at: now,
      metadata: { ...versionMetadata, profiling_ready: true, source_validation: validation },
    }).eq('id', version.id)
    if (versionUpdateError) throw new Error(`Unable to reconcile dataset version: ${versionUpdateError.message}`)

    const { error: datasetUpdateError } = await admin.schema('catalog').from('datasets').update({
      updated_at: now,
      metadata: { ...datasetMetadata, profiling_ready: true, source_validation: validation },
    }).eq('id', version.dataset_id)
    if (datasetUpdateError) throw new Error(`Unable to reconcile dataset: ${datasetUpdateError.message}`)

    const { error: bindingUpdateError } = await admin.schema('profiling').from('dataset_execution_sources').update({
      active: true,
      updated_at: now,
      execution_config: {
        ...executionConfig,
        ...sourceMetadata,
        source_id: source.id,
        source_type: source.source_type,
        connection_metadata: sourceMetadata,
        validation,
      },
    }).eq('id', execution.id)
    if (bindingUpdateError) throw new Error(`Unable to reconcile profiling execution source: ${bindingUpdateError.message}`)
  }
}

export async function revalidateAndReconcileSourceForProfiling(input: { projectId: string; sourceId: string }) {
  const admin = createAdminClient()
  const { data: source, error: sourceError } = await admin
    .schema('catalog')
    .from('data_sources')
    .select('id, project_id, name, source_type, connection_metadata, status')
    .eq('id', input.sourceId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (sourceError) throw new Error(`Unable to resolve data source: ${sourceError.message}`)
  if (!source) throw new Error('Data source not found.')

  const nativeValidation = await validateNativeConnection(source)
  const validation = nativeValidation ?? await validateDataSourceForProfiling(admin, source, sourceIdentifier(source))
  const now = new Date().toISOString()
  const nextStatus = validation.valid ? 'ACTIVE' : 'CONFIGURED'
  const { error: updateError } = await admin.schema('catalog').from('data_sources').update({ status: nextStatus, updated_at: now }).eq('id', source.id).eq('project_id', input.projectId)
  if (updateError) throw new Error(`Unable to update source status: ${updateError.message}`)

  await reconcileBoundDatasets(admin, source, validation, now)

  return {
    source: { ...source, status: nextStatus },
    validation,
    operational: validation.valid,
    code: validationCode(validation.errors),
  }
}
