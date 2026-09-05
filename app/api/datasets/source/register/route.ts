import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'
import { validateJdbcConnection } from '@/lib/connectors/jdbc'
import { discoverNativeHierarchy } from '@/lib/connectors/native-hierarchy-discovery'
import { hierarchySelection } from '@/lib/connectors/native-hierarchy'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function record(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function serverCredentialRef(kind: string) {
  const normalized = kind.toLowerCase().replace(/[^a-z0-9]+/g, '_').toUpperCase()
  return process.env[`JDBC_${normalized}_CREDENTIAL_REF`]?.trim() || process.env.JDBC_CREDENTIAL_REF?.trim() || ''
}
function uiCredentialRef(value: string, projectId: string) {
  return /^DGP_[A-Za-z0-9_]+$/.test(value) && value.startsWith(`DGP_${projectId.replace(/[^A-Za-z0-9]/g, '_')}_`)
}
function jdbcCatalog(jdbcUrl: string, requested: string) {
  if (requested) return requested
  const match = jdbcUrl.match(/(?:[?&;])ConnCatalog=([^;?&]+)/i)
  return match?.[1]?.trim() ?? ''
}
function jdbcTableParts(sourceIdentifier: string, defaultSchema = 'public', defaultCatalog = '') {
  const parts = sourceIdentifier.trim().replace(/^jdbc-table:\/\//i, '').split('.').map(part => part.trim()).filter(Boolean)
  if (parts.length >= 3) return { catalog: parts.at(-3)!, schema: parts.at(-2)!, table: parts.at(-1)! }
  if (parts.length === 2) return { catalog: defaultCatalog, schema: parts[0], table: parts[1] }
  if (parts.length === 1) return { catalog: defaultCatalog, schema: defaultSchema, table: parts[0] }
  return null
}
function fileConnectionMetadata(sourceUri: string, projectId: string) {
  if (/^https?:\/\//i.test(sourceUri)) return { url: sourceUri }
  const normalized = sourceUri.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
  const parts = normalized.split('/')
  if (parts.length < 2 || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('FILE/CSV source URI must use bucket/path syntax with a normalized object path.')
  }
  const bucket = parts[0]
  const path = parts.slice(1).join('/')
  const requiredPrefix = `projects/${projectId}/`
  if (bucket !== 'dataset-files' || !path.startsWith(requiredPrefix) || path.length <= requiredPrefix.length) {
    throw new Error(`FILE/CSV sources must be stored under dataset-files/${requiredPrefix}...`)
  }
  return { bucket, path }
}

type DatasetVersionForReconciliation = { id: string; dataset_id: string; version_number: number; metadata: unknown }

type ScopeBoundSource = {
  id: string
  project_id: string
  connection_metadata: unknown
}

async function ensureSourceScopeVersion(
  admin: ReturnType<typeof createAdminClient>,
  source: ScopeBoundSource,
  actorUserId: string,
) {
  const metadata = record(source.connection_metadata)
  const nativeSelection = metadata.hierarchy_selection ?? { mode: 'ALL', nodeIds: [], qualifiedNames: [], excludedNodeIds: [], excludedQualifiedNames: [], includeSystem: false, inheritFutureChildren: true }
  const { data, error } = await admin.schema('catalog').rpc('ensure_source_scope_version', {
    p_project_id: source.project_id,
    p_source_id: source.id,
    p_native_selection: nativeSelection,
    p_actor: actorUserId,
  })
  if (error) throw new Error(`Unable to version governed discovery scope: ${error.message}`)
  return data
}

async function persistConnectorCapabilities(
  admin: ReturnType<typeof createAdminClient>,
  source: { id: string; project_id: string; connection_metadata: unknown },
) {
  const metadata = record(source.connection_metadata)
  const nativeHierarchy = record(metadata.native_hierarchy)
  const details = record(nativeHierarchy.details)
  const capabilities = record(metadata.connector_capabilities ?? details.capabilities)
  if (!Object.keys(capabilities).length) return
  const now = new Date().toISOString()
  const { error } = await admin.schema('catalog').from('source_discovery_capabilities').upsert({
    source_id: source.id,
    project_id: source.project_id,
    capabilities,
    discovered_at: now,
    updated_at: now,
  }, { onConflict: 'source_id' })
  if (error) throw new Error(`Unable to persist connector capabilities: ${error.message}`)
}

async function reconcileSourceBoundDatasets(
  admin: ReturnType<typeof createAdminClient>,
  source: { id: string; project_id: string; source_type: string; connection_metadata: unknown },
) {
  const sourceType = String(source.source_type).trim().toLowerCase()
  const { data: datasets } = await admin.schema('catalog').from('datasets').select('id, source_identifier, metadata').eq('project_id', source.project_id).eq('data_source_id', source.id)
  if (!datasets?.length) return

  const datasetIds = datasets.map(dataset => dataset.id)
  const { data: versions } = await admin.schema('catalog').from('dataset_versions').select('id, dataset_id, version_number, metadata').in('dataset_id', datasetIds).order('version_number', { ascending: false })
  const typedVersions = (versions ?? []) as DatasetVersionForReconciliation[]
  const { data: executionSources } = await admin.schema('profiling').from('dataset_execution_sources').select('id, dataset_version_id, execution_config, active').in('dataset_version_id', typedVersions.map(version => version.id))
  const latestByDataset = new Map<string, DatasetVersionForReconciliation>()
  for (const version of typedVersions) if (!latestByDataset.has(version.dataset_id)) latestByDataset.set(version.dataset_id, version)
  const executionByVersion = new Map((executionSources ?? []).map(item => [item.dataset_version_id, item]))
  const baseMetadata = record(source.connection_metadata)

  for (const dataset of datasets) {
    const version = latestByDataset.get(dataset.id)
    const executionSource = version ? executionByVersion.get(version.id) : undefined
    if (!version || !dataset.source_identifier || !executionSource) continue

    const connectionMetadata = { ...baseMetadata }
    if (sourceType === 'jdbc') {
      const defaultSchema = typeof connectionMetadata.schema === 'string' && connectionMetadata.schema.trim() ? connectionMetadata.schema.trim() : 'public'
      const defaultCatalog = typeof connectionMetadata.catalog === 'string' && connectionMetadata.catalog.trim() ? connectionMetadata.catalog.trim() : ''
      const parts = jdbcTableParts(dataset.source_identifier, defaultSchema, defaultCatalog)
      if (!parts) continue
      if (parts.catalog) connectionMetadata.catalog = parts.catalog
      connectionMetadata.schema = parts.schema
      connectionMetadata.table = parts.table
    }

    const validation = await validateDataSourceForProfiling(admin, { ...source, connection_metadata: connectionMetadata }, dataset.source_identifier)
    if (!validation.valid) continue

    const now = new Date().toISOString()
    const versionMetadata = record(version.metadata)
    const datasetMetadata = record(dataset.metadata)
    const executionConfig = record(executionSource.execution_config)

    await admin.schema('catalog').from('dataset_versions').update({ status: 'AVAILABLE', metadata: { ...versionMetadata, profiling_ready: true, source_validation: validation }, observed_at: now }).eq('id', version.id)
    await admin.schema('catalog').from('datasets').update({ metadata: { ...datasetMetadata, profiling_ready: true, source_validation: validation }, updated_at: now }).eq('id', dataset.id)
    await admin.schema('profiling').from('dataset_execution_sources').update({
      execution_config: {
        ...executionConfig,
        ...connectionMetadata,
        source_id: source.id,
        source_type: source.source_type,
        connection_metadata: connectionMetadata,
        validation,
      },
      active: true,
      updated_at: now,
    }).eq('id', executionSource.id)
  }
}

async function nativeConnectionMetadata(input: {
  jdbcUrl: string
  credentialRef: string
  connectionKind: string
  selectionInput: unknown
}) {
  const hierarchy = await discoverNativeHierarchy({ jdbcUrl: input.jdbcUrl, credentialRef: input.credentialRef })
  const selection = hierarchySelection(input.selectionInput)
  const selectable = hierarchy.nodes.filter(node => node.selectable)
  const selectableIds = new Set(selectable.map(node => node.id))
  const selectableNames = new Set(selectable.map(node => node.qualifiedName))

  selection.nodeIds = selection.nodeIds.filter(id => selectableIds.has(id))
  selection.qualifiedNames = selection.qualifiedNames.filter(name => selectableNames.has(name))
  selection.excludedNodeIds = selection.excludedNodeIds.filter(id => selectableIds.has(id))
  selection.excludedQualifiedNames = selection.excludedQualifiedNames.filter(name => selectableNames.has(name))
  selection.includeSystem = selection.includeSystem === true
  selection.inheritFutureChildren = selection.inheritFutureChildren !== false

  if (selection.mode === 'SELECTED' && !selection.nodeIds.length && !selection.qualifiedNames.length) {
    throw new Error('Select at least one catalog, database, schema, object, or field from the discovered hierarchy.')
  }

  const capabilities = record(hierarchy.details.capabilities)
  return {
    jdbc_url: input.jdbcUrl,
    connection_kind: input.connectionKind,
    credential_ref: input.credentialRef,
    hierarchy_selection: selection,
    connector_capabilities: capabilities,
    native_hierarchy: {
      database_product: hierarchy.databaseProduct,
      database_version: hierarchy.databaseVersion,
      terms: hierarchy.terms,
      root_ids: hierarchy.rootIds,
      hierarchy_node_count: hierarchy.nodes.length,
      hierarchy_truncated: hierarchy.truncated,
      warnings: hierarchy.warnings,
      details: hierarchy.details,
      discovered_at: new Date().toISOString(),
    },
  } satisfies Record<string, unknown>
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const sourceId = text(body.sourceId)
    const name = text(body.name)
    const sourceType = text(body.sourceType).toUpperCase() || 'JDBC'
    const sourceUri = text(body.sourceUri) || text(body.jdbcUrl)
    const jdbcUrl = text(body.jdbcUrl)
    const connectionKind = text(body.connectionKind) || 'jdbc'
    const schema = text(body.schema)
    const table = text(body.table)
    const connectionOnly = body.connectionOnly === true
    const requestedCredentialRef = text(body.credentialRef)
    const catalogName = jdbcCatalog(jdbcUrl, text(body.catalog))

    if (!projectId || !name || !sourceUri) return NextResponse.json({ error: 'projectId, name, and source URI are required.' }, { status: 400 })
    if (!['JDBC', 'CSV', 'FILE'].includes(sourceType)) return NextResponse.json({ error: 'Unsupported source type.' }, { status: 400 })
    if (sourceType === 'JDBC' && !jdbcUrl) return NextResponse.json({ error: 'JDBC connection string is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')
    const admin = createAdminClient()

    const credentialRef = sourceType === 'JDBC'
      ? (requestedCredentialRef && uiCredentialRef(requestedCredentialRef, projectId) ? requestedCredentialRef : serverCredentialRef(connectionKind))
      : ''
    if (sourceType === 'JDBC' && !credentialRef) return NextResponse.json({ error: 'Database credentials are required. Enter them in the connection form and test the connection.' }, { status: 400 })

    if (sourceType === 'JDBC' && connectionOnly) {
      const connectionMetadata = await nativeConnectionMetadata({
        jdbcUrl,
        credentialRef,
        connectionKind,
        selectionInput: body.hierarchySelection,
      })

      const existingQuery = admin.schema('catalog').from('data_sources').select('id').eq('project_id', projectId)
      const { data: existing } = await (sourceId ? existingQuery.eq('id', sourceId) : existingQuery.eq('name', name)).maybeSingle()
      if (sourceId && !existing) return NextResponse.json({ error: 'Connection access denied.' }, { status: 403 })
      if (existing) {
        const { data: source, error } = await admin.schema('catalog').from('data_sources').update({ source_type: 'JDBC', connection_metadata: connectionMetadata, status: 'CONFIGURED', updated_at: new Date().toISOString() }).eq('id', existing.id).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
        if (error || !source) return NextResponse.json({ error: `Unable to save connection: ${error?.message ?? 'unknown error'}` }, { status: 500 })
        const scope = await ensureSourceScopeVersion(admin, source, user.id)
        await persistConnectorCapabilities(admin, source)
        return NextResponse.json({ source, scope, capabilities: record(connectionMetadata.connector_capabilities), profiling_ready: false, connection_saved: true })
      }

      const { data: source, error } = await admin.schema('catalog').from('data_sources').insert({ project_id: projectId, name, source_type: 'JDBC', connection_metadata: connectionMetadata, status: 'CONFIGURED' }).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
      if (error || !source) return NextResponse.json({ error: `Unable to save connection: ${error?.message ?? 'unknown error'}` }, { status: 500 })
      const scope = await ensureSourceScopeVersion(admin, source, user.id)
      await persistConnectorCapabilities(admin, source)
      return NextResponse.json({ source, scope, capabilities: record(connectionMetadata.connector_capabilities), profiling_ready: false, connection_saved: true })
    }

    let connectionMetadata: Record<string, unknown>
    if (sourceType === 'JDBC') {
      const validation = await validateJdbcConnection({ jdbcUrl, credentialRef, schema, table, catalog: catalogName || undefined })
      if (!validation.valid) return NextResponse.json({ error: 'JDBC source validation failed.', validation }, { status: 422 })
      const resolvedCatalog = catalogName || (typeof validation.details.catalog === 'string' ? validation.details.catalog.trim() : '')
      connectionMetadata = { jdbc_url: jdbcUrl, credential_ref: credentialRef, schema, table, connection_kind: connectionKind }
      if (resolvedCatalog) connectionMetadata.catalog = resolvedCatalog
    } else {
      const metadata: Record<string, unknown> = fileConnectionMetadata(sourceUri, projectId)
      const validation = await validateDataSourceForProfiling(admin, { id: crypto.randomUUID(), project_id: projectId, source_type: sourceType, connection_metadata: metadata }, sourceUri)
      if (!validation.valid) return NextResponse.json({ error: 'CSV/FILE source validation failed.', validation }, { status: 422 })
      connectionMetadata = metadata
    }

    const { data: existing } = await admin.schema('catalog').from('data_sources').select('id, status').eq('project_id', projectId).eq('name', name).maybeSingle()
    if (existing && String(existing.status) !== 'CONFIGURED') return NextResponse.json({ error: 'A data source with this name already exists in the project.' }, { status: 409 })

    if (existing) {
      const { data: source, error } = await admin.schema('catalog').from('data_sources').update({ source_type: sourceType, connection_metadata: connectionMetadata, status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', existing.id).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
      if (error || !source) return NextResponse.json({ error: `Unable to activate source: ${error?.message ?? 'unknown error'}` }, { status: 500 })
      const scope = await ensureSourceScopeVersion(admin, source, user.id)
      await persistConnectorCapabilities(admin, source)
      await reconcileSourceBoundDatasets(admin, source)
      return NextResponse.json({ source, scope, profiling_ready: true })
    }

    const { data: source, error } = await admin.schema('catalog').from('data_sources').insert({ project_id: projectId, name, source_type: sourceType, connection_metadata: connectionMetadata, status: 'ACTIVE' }).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
    if (error || !source) return NextResponse.json({ error: `Unable to register source: ${error?.message ?? 'unknown error'}` }, { status: 500 })
    const scope = await ensureSourceScopeVersion(admin, source, user.id)
    await persistConnectorCapabilities(admin, source)
    await reconcileSourceBoundDatasets(admin, source)
    return NextResponse.json({ source, scope, profiling_ready: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Source registration failed.' }, { status: 500 })
  }
}
