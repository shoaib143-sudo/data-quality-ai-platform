import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'
import { validateJdbcConnection } from '@/lib/connectors/jdbc'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function serverCredentialRef(kind: string) {
  const normalized = kind.toLowerCase().replace(/[^a-z0-9]+/g, '_').toUpperCase()
  return process.env[`JDBC_${normalized}_CREDENTIAL_REF`]?.trim() || process.env.JDBC_CREDENTIAL_REF?.trim() || ''
}

function jdbcTableParts(sourceIdentifier: string) {
  const normalized = sourceIdentifier.trim().replace(/^jdbc-table:\/\//i, '')
  const parts = normalized.split('.').map(part => part.trim()).filter(Boolean)
  if (parts.length >= 2) return { schema: parts[parts.length - 2], table: parts[parts.length - 1] }
  if (parts.length === 1) return { schema: 'public', table: parts[0] }
  return null
}

type DatasetVersionForReconciliation = { id: string; dataset_id: string; version_number: number; metadata: unknown }

async function reconcileSourceBoundDatasets(admin: ReturnType<typeof createAdminClient>, source: { id: string; project_id: string; source_type: string; connection_metadata: unknown }) {
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
  const baseMetadata = source.connection_metadata && typeof source.connection_metadata === 'object' ? { ...(source.connection_metadata as Record<string, unknown>) } : {}

  for (const dataset of datasets) {
    const version = latestByDataset.get(dataset.id)
    if (!version || !dataset.source_identifier) continue
    const executionSource = executionByVersion.get(version.id)
    if (!executionSource) continue

    const connectionMetadata = { ...baseMetadata }
    if (sourceType === 'jdbc') {
      const parts = jdbcTableParts(dataset.source_identifier)
      if (!parts) continue
      connectionMetadata.schema = parts.schema
      connectionMetadata.table = parts.table
    }

    const validation = await validateDataSourceForProfiling(admin, { ...source, connection_metadata: connectionMetadata }, dataset.source_identifier)
    if (!validation.valid) continue

    const now = new Date().toISOString()
    const versionMetadata = version.metadata && typeof version.metadata === 'object' ? { ...(version.metadata as Record<string, unknown>) } : {}
    const datasetMetadata = dataset.metadata && typeof dataset.metadata === 'object' ? { ...(dataset.metadata as Record<string, unknown>) } : {}
    const executionConfig = executionSource.execution_config && typeof executionSource.execution_config === 'object' ? { ...(executionSource.execution_config as Record<string, unknown>) } : {}

    await admin.schema('catalog').from('dataset_versions').update({
      status: 'AVAILABLE',
      metadata: { ...versionMetadata, profiling_ready: true, source_validation: validation },
      observed_at: now,
    }).eq('id', version.id)
    await admin.schema('catalog').from('datasets').update({
      metadata: { ...datasetMetadata, profiling_ready: true, source_validation: validation },
      updated_at: now,
    }).eq('id', dataset.id)
    await admin.schema('profiling').from('dataset_execution_sources').update({
      execution_config: { ...executionConfig, ...connectionMetadata, source_id: source.id, source_type: source.source_type, connection_metadata: connectionMetadata, validation },
      active: true,
      updated_at: now,
    }).eq('id', executionSource.id)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const name = text(body.name)
    const sourceType = text(body.sourceType).toUpperCase() || 'JDBC'
    const sourceUri = text(body.sourceUri) || text(body.jdbcUrl)
    const jdbcUrl = text(body.jdbcUrl)
    const connectionKind = text(body.connectionKind) || 'jdbc'
    const schema = text(body.schema)
    const table = text(body.table)
    const connectionOnly = body.connectionOnly === true
    const credentialRef = sourceType === 'JDBC' ? serverCredentialRef(connectionKind) : ''

    if (!projectId || !name || !sourceUri) return NextResponse.json({ error: 'projectId, name, and source URI are required.' }, { status: 400 })
    if (!['JDBC', 'CSV', 'FILE'].includes(sourceType)) return NextResponse.json({ error: 'Unsupported source type.' }, { status: 400 })
    if (sourceType === 'JDBC' && !jdbcUrl) return NextResponse.json({ error: 'JDBC connection string is required.' }, { status: 400 })
    if (sourceType === 'JDBC' && !connectionOnly && !credentialRef) return NextResponse.json({ error: 'JDBC credentials are not configured on the server. Save the connection as configured, then configure server credentials before testing or activating it.' }, { status: 503 })
    if (sourceType === 'JDBC' && !connectionOnly && (!schema || !table)) return NextResponse.json({ error: 'JDBC sources require connection string, schema, and table.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: project } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Your role cannot register data sources.' }, { status: 403 })

    if (sourceType === 'JDBC' && connectionOnly) {
      const connectionMetadata: Record<string, unknown> = { jdbc_url: jdbcUrl, connection_kind: connectionKind }
      if (credentialRef) connectionMetadata.credential_ref = credentialRef
      const { data: existing } = await admin.schema('catalog').from('data_sources').select('id').eq('project_id', projectId).eq('name', name).maybeSingle()
      if (existing) {
        const { data: source, error } = await admin.schema('catalog').from('data_sources').update({ source_type: 'JDBC', connection_metadata: connectionMetadata, status: 'CONFIGURED', updated_at: new Date().toISOString() }).eq('id', existing.id).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
        if (error || !source) return NextResponse.json({ error: `Unable to save connection: ${error?.message ?? 'unknown error'}` }, { status: 500 })
        return NextResponse.json({ source, profiling_ready: false, connection_saved: true }, { status: 200 })
      }
      const { data: source, error } = await admin.schema('catalog').from('data_sources').insert({ project_id: projectId, name, source_type: 'JDBC', connection_metadata: connectionMetadata, status: 'CONFIGURED' }).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
      if (error || !source) return NextResponse.json({ error: `Unable to save connection: ${error?.message ?? 'unknown error'}` }, { status: 500 })
      return NextResponse.json({ source, profiling_ready: false, connection_saved: true }, { status: 201 })
    }

    let connectionMetadata: Record<string, unknown>
    if (sourceType === 'JDBC') {
      const validation = await validateJdbcConnection({ jdbcUrl, credentialRef, schema, table })
      if (!validation.valid) return NextResponse.json({ error: 'JDBC source validation failed.', validation }, { status: 422 })
      connectionMetadata = { jdbc_url: jdbcUrl, credential_ref: credentialRef, schema, table, connection_kind: connectionKind }
    } else {
      const metadata: Record<string, unknown> = /^https?:\/\//i.test(sourceUri) ? { url: sourceUri } : { bucket: sourceUri.split('/')[0], path: sourceUri.split('/').slice(1).join('/') }
      const validation = await validateDataSourceForProfiling(admin, { id: crypto.randomUUID(), project_id: projectId, source_type: sourceType, connection_metadata: metadata }, sourceUri)
      if (!validation.valid) return NextResponse.json({ error: 'CSV source validation failed.', validation }, { status: 422 })
      connectionMetadata = metadata
    }

    const { data: existing } = await admin.schema('catalog').from('data_sources').select('id, status').eq('project_id', projectId).eq('name', name).maybeSingle()
    if (existing && String(existing.status) !== 'CONFIGURED') return NextResponse.json({ error: 'A data source with this name already exists in the project.' }, { status: 409 })

    if (existing) {
      const { data: source, error } = await admin.schema('catalog').from('data_sources').update({ source_type: sourceType, connection_metadata: connectionMetadata, status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', existing.id).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
      if (error || !source) return NextResponse.json({ error: `Unable to activate source: ${error?.message ?? 'unknown error'}` }, { status: 500 })
      await reconcileSourceBoundDatasets(admin, source)
      return NextResponse.json({ source, profiling_ready: true }, { status: 200 })
    }

    const { data: source, error } = await admin.schema('catalog').from('data_sources').insert({ project_id: projectId, name, source_type: sourceType, connection_metadata: connectionMetadata, status: 'ACTIVE' }).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
    if (error || !source) return NextResponse.json({ error: `Unable to register source: ${error?.message ?? 'unknown error'}` }, { status: 500 })
    await reconcileSourceBoundDatasets(admin, source)
    return NextResponse.json({ source, profiling_ready: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Source registration failed.' }, { status: 500 })
  }
}
