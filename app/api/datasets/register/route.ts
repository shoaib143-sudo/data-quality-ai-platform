import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function jdbcTableParts(sourceIdentifier: string) {
  const normalized = sourceIdentifier.trim().replace(/^jdbc-table:\/\//i, '')
  const parts = normalized.split('.').map(part => part.trim()).filter(Boolean)
  if (parts.length >= 2) return { schema: parts[parts.length - 2], table: parts[parts.length - 1] }
  if (parts.length === 1) return { schema: 'public', table: parts[0] }
  return null
}

export async function POST(request: Request) {
  let datasetId: string | null = null
  let versionId: string | null = null
  try {
    const user = await requireUser()
    const admin = createAdminClient()
    const body = await request.json()
    const projectId = text(body.projectId), sourceId = text(body.sourceId), name = text(body.name)
    const description = text(body.description), sourceIdentifier = text(body.sourceIdentifier), businessDomain = text(body.businessDomain)
    if (!projectId || !sourceId || !name || !sourceIdentifier) return NextResponse.json({ error: 'projectId, sourceId, name, and sourceIdentifier are required.' }, { status: 400 })
    const { data: project, error: projectError } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (projectError || !project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership, error: membershipError } = await admin.schema('app').from('organization_members').select('organization_id, user_id, role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (membershipError || !membership) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    if (!['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Your role cannot register datasets.' }, { status: 403 })
    const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources').select('id, project_id, name, source_type, connection_metadata, status').eq('id', sourceId).eq('project_id', projectId).in('status', ['ACTIVE', 'CONFIGURED']).maybeSingle()
    if (sourceError || !source) return NextResponse.json({ error: 'The selected data source is unavailable.' }, { status: 404 })

    const sourceMetadata = source.connection_metadata && typeof source.connection_metadata === 'object' ? { ...(source.connection_metadata as Record<string, unknown>) } : {}
    const sourceType = String(source.source_type ?? '').trim().toLowerCase()
    const wasConfigured = String(source.status ?? '').toUpperCase() === 'CONFIGURED'
    if (wasConfigured && sourceType === 'jdbc') {
      const jdbcParts = jdbcTableParts(sourceIdentifier)
      if (!jdbcParts) return NextResponse.json({ error: 'Configured JDBC connections require a schema.table source identifier.' }, { status: 400 })
      sourceMetadata.schema = jdbcParts.schema
      sourceMetadata.table = jdbcParts.table
      const { data: activatedSource, error: activationError } = await admin.schema('catalog').from('data_sources').update({ connection_metadata: sourceMetadata, status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', source.id).eq('project_id', projectId).select('id, project_id, name, source_type, connection_metadata, status').single()
      if (activationError || !activatedSource) throw new Error(`Unable to activate configured data source: ${activationError?.message ?? 'unknown error'}`)
      source.connection_metadata = activatedSource.connection_metadata
      source.status = activatedSource.status
    }

    const sourceValidation = await validateDataSourceForProfiling(admin, source, sourceIdentifier)
    if (!sourceValidation.valid) {
      if (wasConfigured) await admin.schema('catalog').from('data_sources').update({ status: 'CONFIGURED', connection_metadata: source.connection_metadata, updated_at: new Date().toISOString() }).eq('id', source.id)
      return NextResponse.json({ error: 'The selected source is not profiling-ready.', source_validation: sourceValidation }, { status: 422 })
    }
    const { data: existingDataset, error: duplicateError } = await admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('name', name).maybeSingle()
    if (duplicateError) throw new Error(`Unable to validate dataset name: ${duplicateError.message}`)
    if (existingDataset) return NextResponse.json({ error: 'A dataset with this name already exists in the project.' }, { status: 409 })
    const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').insert({ project_id: projectId, data_source_id: source.id, name, description: description || null, source_identifier: sourceIdentifier, owner_user_id: user.id, business_domain: businessDomain || null, metadata: { registration: 'manual', registered_source_type: source.source_type, source_validation: sourceValidation } }).select('id, project_id, data_source_id, name, description, source_identifier, business_domain, status, created_at').single()
    if (datasetError || !dataset) throw new Error(`Unable to register dataset: ${datasetError?.message ?? 'unknown error'}`)
    datasetId = dataset.id
    const { data: latestVersion, error: versionLookupError } = await admin.schema('catalog').from('dataset_versions').select('version_number').eq('dataset_id', dataset.id).order('version_number', { ascending: false }).limit(1).maybeSingle()
    if (versionLookupError) throw new Error(`Unable to determine dataset version: ${versionLookupError.message}`)
    const versionNumber = Number(latestVersion?.version_number ?? 0) + 1
    const executionType = ['file', 'csv'].includes(sourceType) ? 'FILE' : sourceType === 'jdbc' ? 'JDBC' : 'TABLE'
    const connectionMetadata = source.connection_metadata && typeof source.connection_metadata === 'object' ? source.connection_metadata as Record<string, unknown> : {}
    const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').insert({ dataset_id: dataset.id, version_number: versionNumber, source_uri: sourceIdentifier, status: 'PROCESSING', observed_at: new Date().toISOString(), metadata: { registration: 'manual', source_type: source.source_type, source_validation: sourceValidation } }).select('id, dataset_id, version_number, source_uri, status, observed_at, created_at').single()
    if (versionError || !version) throw new Error(`Unable to create dataset version: ${versionError?.message ?? 'unknown error'}`)
    versionId = version.id
    const { error: executionSourceError } = await admin.schema('profiling').from('dataset_execution_sources').insert({ dataset_version_id: version.id, source_type: executionType, source_uri: sourceIdentifier, execution_config: { ...connectionMetadata, source_id: source.id, source_type: source.source_type, connection_metadata: connectionMetadata, validation: sourceValidation }, active: true })
    if (executionSourceError) throw new Error(`Unable to configure profiling source: ${executionSourceError.message}`)
    const { data: agentDefinition, error: agentError } = await admin.schema('agent').from('agent_definitions').select('id, agent_key, version, enabled').eq('agent_key', 'profiling_agent').eq('version', '2.0').eq('enabled', true).maybeSingle()
    if (agentError || !agentDefinition) throw new Error('Production Profiling Agent 2.0 is not available.')
    return NextResponse.json({ dataset, version, profiling_ready: true, source_validation: sourceValidation, execution_type: executionType, agentDefinitionId: agentDefinition.id, agent_key: agentDefinition.agent_key, agent_version: agentDefinition.version }, { status: 201 })
  } catch (error) {
    const admin = createAdminClient()
    if (versionId) await admin.schema('profiling').from('dataset_execution_sources').delete().eq('dataset_version_id', versionId)
    if (versionId) await admin.schema('catalog').from('dataset_versions').delete().eq('id', versionId)
    if (datasetId) await admin.schema('catalog').from('datasets').delete().eq('id', datasetId)
    const message = error instanceof Error ? error.message : 'Dataset registration failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
