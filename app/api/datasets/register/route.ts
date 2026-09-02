import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const admin = createAdminClient()
    const body = await request.json()

    const projectId = text(body.projectId)
    const sourceId = text(body.sourceId)
    const name = text(body.name)
    const description = text(body.description)
    const sourceIdentifier = text(body.sourceIdentifier)
    const businessDomain = text(body.businessDomain)

    if (!projectId || !sourceId || !name || !sourceIdentifier) {
      return NextResponse.json({ error: 'projectId, sourceId, name, and sourceIdentifier are required.' }, { status: 400 })
    }

    const { data: project, error: projectError } = await admin
      .schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (projectError || !project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    const { data: membership, error: membershipError } = await admin
      .schema('app').from('organization_members').select('organization_id, user_id, role')
      .eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (membershipError || !membership) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    if (!['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) {
      return NextResponse.json({ error: 'Your role cannot register datasets.' }, { status: 403 })
    }

    const { data: source, error: sourceError } = await admin
      .schema('catalog').from('data_sources')
      .select('id, project_id, name, source_type, connection_metadata, status')
      .eq('id', sourceId).eq('project_id', projectId).eq('status', 'ACTIVE').maybeSingle()
    if (sourceError || !source) return NextResponse.json({ error: 'The selected data source is unavailable.' }, { status: 404 })

    const { data: existingDataset, error: duplicateError } = await admin
      .schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('name', name).maybeSingle()
    if (duplicateError) throw new Error(`Unable to validate dataset name: ${duplicateError.message}`)
    if (existingDataset) return NextResponse.json({ error: 'A dataset with this name already exists in the project.' }, { status: 409 })

    const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').insert({
      project_id: projectId,
      data_source_id: source.id,
      name,
      description: description || null,
      source_identifier: sourceIdentifier,
      owner_user_id: user.id,
      business_domain: businessDomain || null,
      metadata: { registration: 'manual', registered_source_type: source.source_type },
    }).select('id, project_id, data_source_id, name, description, source_identifier, business_domain, status, created_at').single()
    if (datasetError || !dataset) throw new Error(`Unable to register dataset: ${datasetError?.message ?? 'unknown error'}`)

    const { data: latestVersion, error: versionLookupError } = await admin.schema('catalog').from('dataset_versions')
      .select('version_number').eq('dataset_id', dataset.id).order('version_number', { ascending: false }).limit(1).maybeSingle()
    if (versionLookupError) throw new Error(`Unable to determine dataset version: ${versionLookupError.message}`)

    const versionNumber = Number(latestVersion?.version_number ?? 0) + 1
    const sourceType = String(source.source_type ?? '').trim().toLowerCase()
    const executionType = ['file', 'csv'].includes(sourceType) ? 'FILE' : 'TABLE'

    const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').insert({
      dataset_id: dataset.id,
      version_number: versionNumber,
      source_uri: sourceIdentifier,
      status: 'PROCESSING',
      observed_at: new Date().toISOString(),
      metadata: { registration: 'manual', source_type: source.source_type },
    }).select('id, dataset_id, version_number, source_uri, status, observed_at, created_at').single()
    if (versionError || !version) {
      await admin.schema('catalog').from('datasets').delete().eq('id', dataset.id)
      throw new Error(`Unable to create dataset version: ${versionError?.message ?? 'unknown error'}`)
    }

    const { error: executionSourceError } = await admin.schema('profiling').from('dataset_execution_sources').insert({
      dataset_version_id: version.id,
      source_type: executionType,
      source_uri: sourceIdentifier,
      execution_config: { source_id: source.id, source_type: source.source_type, connection_metadata: source.connection_metadata ?? {} },
      active: true,
    })
    if (executionSourceError) {
      await admin.schema('catalog').from('dataset_versions').delete().eq('id', version.id)
      await admin.schema('catalog').from('datasets').delete().eq('id', dataset.id)
      throw new Error(`Unable to configure profiling source: ${executionSourceError.message}`)
    }

    const { data: agentDefinition, error: agentError } = await admin.schema('agent').from('agent_definitions')
      .select('id, agent_key, version, enabled').eq('agent_key', 'profiling_agent').eq('version', '2.0').eq('enabled', true).maybeSingle()
    if (agentError || !agentDefinition) throw new Error('Production Profiling Agent 2.0 is not available.')

    return NextResponse.json({
      dataset,
      version,
      profiling_ready: true,
      execution_type: executionType,
      agentDefinitionId: agentDefinition.id,
      agent_key: agentDefinition.agent_key,
      agent_version: agentDefinition.version,
    }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dataset registration failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
