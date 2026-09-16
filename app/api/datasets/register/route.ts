import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function jdbcTableParts(sourceIdentifier: string, defaultSchema = 'public') {
  const normalized = sourceIdentifier.trim().replace(/^jdbc-table:\/\//i, '')
  const parts = normalized.split('.').map(part => part.trim()).filter(Boolean)
  if (parts.length >= 2) return { schema: parts[parts.length - 2], table: parts[parts.length - 1] }
  if (parts.length === 1) return { schema: defaultSchema, table: parts[0] }
  return null
}

function storageSourceUri(provider: string, bucket: string, key: string) {
  if (provider === 'r2') return `r2://${bucket}/${key}`
  if (provider === 'supabase') return `storage://${bucket}/${key}`
  throw new Error(`Unsupported storage provider: ${provider}`)
}

export async function POST(request: Request) {
  let datasetId: string | null = null
  let versionId: string | null = null
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const projectId = text(body.projectId), sourceId = text(body.sourceId), name = text(body.name)
    const description = text(body.description), requestedSourceIdentifier = text(body.sourceIdentifier), businessDomain = text(body.businessDomain)
    const storageObjectId = text(body.storageObjectId)
    if (!projectId || !sourceId || !name || (!requestedSourceIdentifier && !storageObjectId)) {
      return NextResponse.json({ error: 'projectId, sourceId, name, and either sourceIdentifier or storageObjectId are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'catalog.update')
    const admin = createAdminClient()

    const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources').select('id, project_id, name, source_type, connection_metadata, status').eq('id', sourceId).eq('project_id', projectId).in('status', ['ACTIVE', 'CONFIGURED']).maybeSingle()
    if (sourceError || !source) return NextResponse.json({ error: 'The selected data source is unavailable.' }, { status: 404 })

    const sourceType = String(source.source_type ?? '').trim().toLowerCase()
    const wasConfigured = String(source.status ?? '').toUpperCase() === 'CONFIGURED'
    if (wasConfigured) await authorizeProject(user.id, projectId, 'source.manage')

    let effectiveSourceIdentifier = requestedSourceIdentifier
    let verifiedStorageObject: { id: string; provider: string; bucket: string; object_key: string; content_type: string | null; size_bytes: number | null } | null = null
    const connectionMetadata = source.connection_metadata && typeof source.connection_metadata === 'object' ? { ...(source.connection_metadata as Record<string, unknown>) } : {}

    if (storageObjectId) {
      if (!['file', 'csv'].includes(sourceType)) {
        return NextResponse.json({ error: 'storageObjectId can only be used with FILE/CSV data sources.' }, { status: 400 })
      }
      const { data: storageObject, error: storageError } = await admin
        .schema('catalog')
        .from('storage_objects')
        .select('id, project_id, provider, bucket, object_key, content_type, size_bytes, state')
        .eq('id', storageObjectId)
        .eq('project_id', projectId)
        .maybeSingle()
      if (storageError) throw new Error(`Unable to resolve storage object: ${storageError.message}`)
      if (!storageObject) return NextResponse.json({ error: 'Storage object was not found in this project.' }, { status: 404 })
      if (storageObject.state !== 'READY') {
        return NextResponse.json({ error: `Storage object is not ready for dataset registration (state=${storageObject.state}).` }, { status: 409 })
      }
      if (!['r2', 'supabase'].includes(storageObject.provider)) throw new Error(`Unsupported storage provider: ${storageObject.provider}`)

      effectiveSourceIdentifier = storageSourceUri(storageObject.provider, storageObject.bucket, storageObject.object_key)
      verifiedStorageObject = {
        id: storageObject.id,
        provider: storageObject.provider,
        bucket: storageObject.bucket,
        object_key: storageObject.object_key,
        content_type: storageObject.content_type,
        size_bytes: storageObject.size_bytes == null ? null : Number(storageObject.size_bytes),
      }
      connectionMetadata.storage_provider = storageObject.provider
      connectionMetadata.storage_bucket = storageObject.bucket
      connectionMetadata.storage_path = storageObject.object_key
      connectionMetadata.storage_object_id = storageObject.id
      connectionMetadata.content_type = storageObject.content_type
      connectionMetadata.size_bytes = storageObject.size_bytes
    }

    if (wasConfigured && sourceType === 'jdbc') {
      const defaultSchema = typeof connectionMetadata.schema === 'string' && connectionMetadata.schema.trim() ? connectionMetadata.schema.trim() : 'public'
      const jdbcParts = jdbcTableParts(effectiveSourceIdentifier, defaultSchema)
      if (!jdbcParts) return NextResponse.json({ error: 'Configured JDBC connections require a schema.table source identifier.' }, { status: 400 })
      connectionMetadata.schema = jdbcParts.schema
      connectionMetadata.table = jdbcParts.table
    }

    const validationSource = { ...source, connection_metadata: connectionMetadata }
    let sourceValidation = await validateDataSourceForProfiling(admin, validationSource, effectiveSourceIdentifier)
    const sourceReady = sourceValidation.valid

    if (!sourceReady && wasConfigured && sourceType === 'jdbc') {
      sourceValidation = {
        ...sourceValidation,
        warnings: [...sourceValidation.warnings, 'Dataset registration completed, but the configured JDBC source is not profiling-ready yet. Configure server-side credentials and validate the source before profiling.'],
      }
    }

    if (sourceReady && wasConfigured) {
      const { error: activationError } = await admin.schema('catalog').from('data_sources').update({ connection_metadata: connectionMetadata, status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', source.id).eq('project_id', projectId)
      if (activationError) throw new Error(`Unable to activate configured data source: ${activationError.message}`)
      source.connection_metadata = connectionMetadata
      source.status = 'ACTIVE'
    }

    const { data: existingDataset, error: duplicateError } = await admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('name', name).maybeSingle()
    if (duplicateError) throw new Error(`Unable to validate dataset name: ${duplicateError.message}`)
    if (existingDataset) return NextResponse.json({ error: 'A dataset with this name already exists in the project.' }, { status: 409 })

    const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').insert({
      project_id: projectId,
      data_source_id: source.id,
      name,
      description: description || null,
      source_identifier: effectiveSourceIdentifier,
      owner_user_id: user.id,
      business_domain: businessDomain || null,
      metadata: {
        registration: 'manual',
        registered_source_type: source.source_type,
        source_validation: sourceValidation,
        profiling_ready: sourceReady,
        storage_object_id: verifiedStorageObject?.id ?? null,
      },
    }).select('id, project_id, data_source_id, name, description, source_identifier, business_domain, status, created_at').single()
    if (datasetError || !dataset) throw new Error(`Unable to register dataset: ${datasetError?.message ?? 'unknown error'}`)
    datasetId = dataset.id

    const { data: latestVersion, error: versionLookupError } = await admin.schema('catalog').from('dataset_versions').select('version_number').eq('dataset_id', dataset.id).order('version_number', { ascending: false }).limit(1).maybeSingle()
    if (versionLookupError) throw new Error(`Unable to determine dataset version: ${versionLookupError.message}`)
    const versionNumber = Number(latestVersion?.version_number ?? 0) + 1
    const executionType = ['file', 'csv'].includes(sourceType) ? 'FILE' : sourceType === 'jdbc' ? 'JDBC' : 'TABLE'
    const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').insert({
      dataset_id: dataset.id,
      version_number: versionNumber,
      source_uri: effectiveSourceIdentifier,
      storage_object_id: verifiedStorageObject?.id ?? null,
      status: sourceReady ? 'AVAILABLE' : 'PROCESSING',
      observed_at: new Date().toISOString(),
      metadata: { registration: 'manual', source_type: source.source_type, source_validation: sourceValidation, profiling_ready: sourceReady, storage_object_id: verifiedStorageObject?.id ?? null },
    }).select('id, dataset_id, version_number, source_uri, storage_object_id, status, observed_at, created_at').single()
    if (versionError || !version) throw new Error(`Unable to create dataset version: ${versionError?.message ?? 'unknown error'}`)
    versionId = version.id

    const { error: executionSourceError } = await admin.schema('profiling').from('dataset_execution_sources').insert({
      dataset_version_id: version.id,
      source_type: executionType,
      source_uri: effectiveSourceIdentifier,
      execution_config: { ...connectionMetadata, source_id: source.id, source_type: source.source_type, connection_metadata: connectionMetadata, validation: sourceValidation, storage_object_id: verifiedStorageObject?.id ?? null },
      active: sourceReady,
    })
    if (executionSourceError) throw new Error(`Unable to configure profiling source: ${executionSourceError.message}`)

    const { data: agentDefinition, error: agentError } = await admin.schema('agent').from('agent_definitions').select('id, agent_key, version, enabled').eq('agent_key', 'profiling_agent').eq('version', '2.0').eq('enabled', true).maybeSingle()
    if (agentError || !agentDefinition) throw new Error('Production Profiling Agent 2.0 is not available.')

    return NextResponse.json({
      dataset,
      version,
      storage_object_id: verifiedStorageObject?.id ?? null,
      profiling_ready: sourceReady,
      source_validation: sourceValidation,
      execution_type: executionType,
      agentDefinitionId: agentDefinition.id,
      agent_key: agentDefinition.agent_key,
      agent_version: agentDefinition.version,
    }, { status: 201 })
  } catch (error) {
    const admin = createAdminClient()
    if (versionId) await admin.schema('profiling').from('dataset_execution_sources').delete().eq('dataset_version_id', versionId)
    if (versionId) await admin.schema('catalog').from('dataset_versions').delete().eq('id', versionId)
    if (datasetId) await admin.schema('catalog').from('datasets').delete().eq('id', datasetId)
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    const message = error instanceof Error ? error.message : 'Dataset registration failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}