import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function sourceIdentifier(source: { source_type: string | null; connection_metadata: unknown }) {
  const metadata = source.connection_metadata && typeof source.connection_metadata === 'object' && !Array.isArray(source.connection_metadata)
    ? source.connection_metadata as Record<string, unknown>
    : {}
  const type = String(source.source_type ?? '').toLowerCase()
  if (type === 'jdbc') {
    const schema = text(metadata.schema || metadata.schema_name || metadata.schemaName) || 'public'
    const table = text(metadata.table || metadata.table_name || metadata.tableName)
    return table ? `jdbc-table://${schema}.${table}` : ''
  }
  if (type === 'csv' || type === 'file') return text(metadata.url || metadata.source_url || metadata.sourceUrl) || (metadata.bucket && metadata.path ? `${metadata.bucket}/${metadata.path}` : '')
  const schema = text(metadata.schema || metadata.schema_name || metadata.schemaName) || 'public'
  const table = text(metadata.table || metadata.table_name || metadata.tableName)
  return table ? `${schema}.${table}` : ''
}

function validationCode(errors: string[]) {
  if (errors.some(error => error.includes('credential_ref'))) return 'JDBC_CREDENTIAL_REF_MISSING'
  if (errors.some(error => error.includes('table name'))) return 'SOURCE_TABLE_MISSING'
  if (errors.some(error => error.includes('source identifier'))) return 'SOURCE_IDENTIFIER_MISSING'
  if (errors.some(error => error.includes('jdbc_url'))) return 'JDBC_URL_MISSING'
  if (errors.some(error => error.includes('connectivity') || error.includes('bridge'))) return 'SOURCE_CONNECTIVITY_FAILED'
  return errors.length ? 'SOURCE_VALIDATION_FAILED' : null
}

async function reconcileBoundDatasets(
  admin: ReturnType<typeof createAdminClient>,
  source: { id: string; project_id: string; source_type: string | null; connection_metadata: unknown },
  validation: Awaited<ReturnType<typeof validateDataSourceForProfiling>>,
  now: string,
) {
  const { data: datasets } = await admin.schema('catalog').from('datasets').select('id, metadata').eq('project_id', source.project_id).eq('data_source_id', source.id)
  const datasetIds = (datasets ?? []).map(item => item.id)
  if (!datasetIds.length) return

  const { data: versions } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,metadata').in('dataset_id', datasetIds).order('version_number', { ascending: false })
  const latestByDataset = new Map<string, { id: string; dataset_id: string; metadata: unknown }>()
  for (const version of versions ?? []) if (!latestByDataset.has(version.dataset_id)) latestByDataset.set(version.dataset_id, version)
  const versionIds = [...latestByDataset.values()].map(version => version.id)
  if (!versionIds.length) return

  if (!validation.valid) {
    await admin.schema('profiling').from('dataset_execution_sources').update({ active: false, updated_at: now }).in('dataset_version_id', versionIds)
    return
  }

  const sourceMetadata = source.connection_metadata && typeof source.connection_metadata === 'object' && !Array.isArray(source.connection_metadata)
    ? source.connection_metadata as Record<string, unknown>
    : {}
  const { data: executionSources } = await admin.schema('profiling').from('dataset_execution_sources').select('id,dataset_version_id,execution_config').in('dataset_version_id', versionIds)
  const executionByVersion = new Map((executionSources ?? []).map(item => [item.dataset_version_id, item]))
  const datasetById = new Map((datasets ?? []).map(dataset => [dataset.id, dataset]))

  for (const version of latestByDataset.values()) {
    const execution = executionByVersion.get(version.id)
    if (!execution) continue
    const executionConfig = execution.execution_config && typeof execution.execution_config === 'object' && !Array.isArray(execution.execution_config)
      ? execution.execution_config as Record<string, unknown>
      : {}
    const versionMetadata = version.metadata && typeof version.metadata === 'object' && !Array.isArray(version.metadata)
      ? version.metadata as Record<string, unknown>
      : {}
    const dataset = datasetById.get(version.dataset_id)
    const datasetMetadata = dataset?.metadata && typeof dataset.metadata === 'object' && !Array.isArray(dataset.metadata)
      ? dataset.metadata as Record<string, unknown>
      : {}

    await admin.schema('catalog').from('dataset_versions').update({
      status: 'AVAILABLE',
      observed_at: now,
      metadata: { ...versionMetadata, profiling_ready: true, source_validation: validation },
    }).eq('id', version.id)
    await admin.schema('catalog').from('datasets').update({
      updated_at: now,
      metadata: { ...datasetMetadata, profiling_ready: true, source_validation: validation },
    }).eq('id', version.dataset_id)
    await admin.schema('profiling').from('dataset_execution_sources').update({
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
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const sourceId = text(body.sourceId)
    if (!projectId || !sourceId) return NextResponse.json({ error: 'projectId and sourceId are required.', code: 'INVALID_VALIDATION_REQUEST' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')
    const admin = createAdminClient()

    const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources').select('id, project_id, name, source_type, connection_metadata, status').eq('id', sourceId).eq('project_id', projectId).maybeSingle()
    if (sourceError || !source) return NextResponse.json({ error: 'Data source not found.', code: 'SOURCE_NOT_FOUND' }, { status: 404 })

    const identifier = sourceIdentifier(source)
    const validation = await validateDataSourceForProfiling(admin, source, identifier)
    const now = new Date().toISOString()
    const nextStatus = validation.valid ? 'ACTIVE' : 'CONFIGURED'
    const { error: updateError } = await admin.schema('catalog').from('data_sources').update({ status: nextStatus, updated_at: now }).eq('id', source.id).eq('project_id', projectId)
    if (updateError) throw new Error(`Unable to update source status: ${updateError.message}`)

    await reconcileBoundDatasets(admin, source, validation, now)

    return NextResponse.json({ source: { ...source, status: nextStatus }, validation, operational: validation.valid, code: validationCode(validation.errors) })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message, code: 'PROJECT_ACCESS_DENIED' }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Source validation failed.', code: 'SOURCE_VALIDATION_REQUEST_FAILED' }, { status: 500 })
  }
}
