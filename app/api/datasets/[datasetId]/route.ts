import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function jdbcTableParts(sourceIdentifier: string, defaultSchema = 'public') {
  const normalized = sourceIdentifier.trim().replace(/^jdbc-table:\/\//i, '')
  const parts = normalized.split('.').map(part => part.trim()).filter(Boolean)
  if (parts.length >= 2) return { schema: parts[parts.length - 2], table: parts[parts.length - 1] }
  if (parts.length === 1) return { schema: defaultSchema, table: parts[0] }
  return null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ datasetId: string }> }) {
  try {
    const user = await requireUser()
    const { datasetId } = await params
    const body = await request.json()
    const name = text(body.name)
    const description = text(body.description)
    const businessDomain = text(body.businessDomain)
    const sourceIdentifier = text(body.sourceIdentifier)
    const sourceId = text(body.sourceId)
    if (!name || !sourceIdentifier || !sourceId) return NextResponse.json({ error: 'Dataset name, source, and source identifier are required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: dataset } = await admin.schema('catalog').from('datasets').select('id, project_id, metadata').eq('id', datasetId).maybeSingle()
    if (!dataset) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 })

    const { data: project } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', dataset.project_id).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Dataset access denied.' }, { status: 403 })

    const { data: duplicate } = await admin.schema('catalog').from('datasets').select('id').eq('project_id', dataset.project_id).eq('name', name).neq('id', datasetId).maybeSingle()
    if (duplicate) return NextResponse.json({ error: 'A dataset with this name already exists in the project.' }, { status: 409 })

    const { data: source } = await admin.schema('catalog').from('data_sources').select('id, project_id, source_type, connection_metadata, status').eq('id', sourceId).eq('project_id', dataset.project_id).in('status', ['ACTIVE', 'CONFIGURED']).maybeSingle()
    if (!source) return NextResponse.json({ error: 'The selected connection is unavailable.' }, { status: 404 })

    const sourceType = String(source.source_type ?? '').trim().toLowerCase()
    const connectionMetadata = source.connection_metadata && typeof source.connection_metadata === 'object' ? { ...(source.connection_metadata as Record<string, unknown>) } : {}
    if (sourceType === 'jdbc') {
      const defaultSchema = typeof connectionMetadata.schema === 'string' && connectionMetadata.schema.trim() ? connectionMetadata.schema.trim() : 'public'
      const parts = jdbcTableParts(sourceIdentifier, defaultSchema)
      if (!parts) return NextResponse.json({ error: 'JDBC datasets require a schema.table source identifier.' }, { status: 400 })
      connectionMetadata.schema = parts.schema
      connectionMetadata.table = parts.table
    }

    const validationSource = { ...source, connection_metadata: connectionMetadata }
    const sourceValidation = await validateDataSourceForProfiling(admin, validationSource, sourceIdentifier)
    if (!sourceValidation.valid) return NextResponse.json({ error: 'The updated dataset source could not be validated.', source_validation: sourceValidation }, { status: 422 })

    if (String(source.status).toUpperCase() === 'CONFIGURED') {
      const { error } = await admin.schema('catalog').from('data_sources').update({ connection_metadata: connectionMetadata, status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', source.id)
      if (error) throw new Error(`Unable to activate connection: ${error.message}`)
    }

    const { data: latestVersion, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id, metadata').eq('dataset_id', datasetId).order('version_number', { ascending: false }).limit(1).maybeSingle()
    if (versionError || !latestVersion) throw new Error(`Unable to resolve latest dataset version: ${versionError?.message ?? 'not found'}`)

    const now = new Date().toISOString()
    const datasetMetadata = dataset.metadata && typeof dataset.metadata === 'object' ? { ...(dataset.metadata as Record<string, unknown>) } : {}
    const versionMetadata = latestVersion.metadata && typeof latestVersion.metadata === 'object' ? { ...(latestVersion.metadata as Record<string, unknown>) } : {}
    const { error: datasetError } = await admin.schema('catalog').from('datasets').update({
      data_source_id: source.id,
      name,
      description: description || null,
      business_domain: businessDomain || null,
      source_identifier: sourceIdentifier,
      metadata: { ...datasetMetadata, profiling_ready: true, source_validation: sourceValidation, registered_source_type: source.source_type },
      updated_at: now,
    }).eq('id', datasetId)
    if (datasetError) throw new Error(`Unable to update dataset: ${datasetError.message}`)

    const { error: latestError } = await admin.schema('catalog').from('dataset_versions').update({
      source_uri: sourceValidation.source_uri || sourceIdentifier,
      status: 'AVAILABLE',
      metadata: { ...versionMetadata, profiling_ready: true, source_validation: sourceValidation, source_type: source.source_type },
      observed_at: now,
    }).eq('id', latestVersion.id)
    if (latestError) throw new Error(`Unable to update dataset version: ${latestError.message}`)

    const executionType = ['file', 'csv'].includes(sourceType) ? 'FILE' : sourceType === 'jdbc' ? 'JDBC' : 'TABLE'
    const executionConfig = { ...connectionMetadata, source_id: source.id, source_type: source.source_type, connection_metadata: connectionMetadata, validation: sourceValidation }
    const { data: existingExecution } = await admin.schema('profiling').from('dataset_execution_sources').select('id').eq('dataset_version_id', latestVersion.id).maybeSingle()
    if (existingExecution) {
      const { error } = await admin.schema('profiling').from('dataset_execution_sources').update({ source_type: executionType, source_uri: sourceValidation.source_uri || sourceIdentifier, execution_config: executionConfig, active: true, updated_at: now }).eq('id', existingExecution.id)
      if (error) throw new Error(`Unable to update profiling source: ${error.message}`)
    } else {
      const { error } = await admin.schema('profiling').from('dataset_execution_sources').insert({ dataset_version_id: latestVersion.id, source_type: executionType, source_uri: sourceValidation.source_uri || sourceIdentifier, execution_config: executionConfig, active: true })
      if (error) throw new Error(`Unable to create profiling source: ${error.message}`)
    }

    return NextResponse.json({ updated: true, profiling_ready: true, source_validation: sourceValidation })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dataset update failed.' }, { status: 500 })
  }
}
