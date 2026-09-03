import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'
import { writeGovernanceAudit } from '@/lib/governance/audit'

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
    const { data: dataset } = await admin.schema('catalog').from('datasets').select('id, project_id, data_source_id, source_identifier, metadata').eq('id', datasetId).maybeSingle()
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

    const { data: latestVersion, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id, version_number, metadata, source_uri, status').eq('dataset_id', datasetId).order('version_number', { ascending: false }).limit(1).maybeSingle()
    if (versionError || !latestVersion) throw new Error(`Unable to resolve latest dataset version: ${versionError?.message ?? 'not found'}`)

    const now = new Date().toISOString()
    const datasetMetadata = dataset.metadata && typeof dataset.metadata === 'object' ? { ...(dataset.metadata as Record<string, unknown>) } : {}
    const versionMetadata = latestVersion.metadata && typeof latestVersion.metadata === 'object' ? { ...(latestVersion.metadata as Record<string, unknown>) } : {}
    const executionType = ['file', 'csv'].includes(sourceType) ? 'FILE' : sourceType === 'jdbc' ? 'JDBC' : 'TABLE'
    const executionConfig = { ...connectionMetadata, source_id: source.id, source_type: source.source_type, connection_metadata: connectionMetadata, validation: sourceValidation }
    const sourceBindingChanged = dataset.data_source_id !== source.id || String(dataset.source_identifier ?? '') !== sourceIdentifier
    let activeVersionId = latestVersion.id
    let createdVersionNumber: number | null = null

    if (sourceBindingChanged) {
      const nextVersionNumber = Number(latestVersion.version_number) + 1
      const { data: newVersion, error: newVersionError } = await admin.schema('catalog').from('dataset_versions').insert({
        dataset_id: datasetId,
        version_number: nextVersionNumber,
        source_uri: sourceValidation.source_uri || sourceIdentifier,
        status: 'AVAILABLE',
        observed_at: now,
        metadata: {
          ...versionMetadata,
          profiling_ready: true,
          source_validation: sourceValidation,
          source_type: source.source_type,
          parent_version_id: latestVersion.id,
          version_reason: 'SOURCE_BINDING_CHANGED',
          source_identifier: sourceIdentifier,
        },
      }).select('id,version_number').single()
      if (newVersionError || !newVersion) throw new Error(`Unable to create immutable dataset version: ${newVersionError?.message ?? 'unknown error'}`)
      activeVersionId = newVersion.id
      createdVersionNumber = Number(newVersion.version_number)

      const { error: executionSourceError } = await admin.schema('profiling').from('dataset_execution_sources').insert({
        dataset_version_id: activeVersionId,
        source_type: executionType,
        source_uri: sourceValidation.source_uri || sourceIdentifier,
        execution_config: executionConfig,
        active: true,
      })
      if (executionSourceError) {
        await admin.schema('catalog').from('dataset_versions').delete().eq('id', activeVersionId)
        throw new Error(`Unable to create profiling source for the new dataset version: ${executionSourceError.message}`)
      }

      const { error: datasetError } = await admin.schema('catalog').from('datasets').update({
        data_source_id: source.id,
        name,
        description: description || null,
        business_domain: businessDomain || null,
        source_identifier: sourceIdentifier,
        metadata: {
          ...datasetMetadata,
          profiling_ready: true,
          source_validation: sourceValidation,
          registered_source_type: source.source_type,
          current_version_id: activeVersionId,
          current_version_number: nextVersionNumber,
        },
        updated_at: now,
      }).eq('id', datasetId)
      if (datasetError) {
        await admin.schema('catalog').from('dataset_versions').delete().eq('id', activeVersionId)
        throw new Error(`Unable to update dataset after version creation: ${datasetError.message}`)
      }

      const { error: lineageError } = await admin.schema('governance').from('lineage_edges').insert({
        project_id: dataset.project_id,
        source_type: 'DATASET_VERSION',
        source_id: latestVersion.id,
        target_type: 'DATASET_VERSION',
        target_id: activeVersionId,
        relationship: 'SUPERSEDED_BY',
        metadata: {
          dataset_id: datasetId,
          previous_version_number: latestVersion.version_number,
          current_version_number: nextVersionNumber,
          reason: 'SOURCE_BINDING_CHANGED',
          previous_source_uri: latestVersion.source_uri,
          current_source_uri: sourceValidation.source_uri || sourceIdentifier,
        },
      })
      if (lineageError) console.error('[dataset-version-lineage]', lineageError.message)
    } else {
      const { error: datasetError } = await admin.schema('catalog').from('datasets').update({
        name,
        description: description || null,
        business_domain: businessDomain || null,
        metadata: { ...datasetMetadata, profiling_ready: true, source_validation: sourceValidation, registered_source_type: source.source_type },
        updated_at: now,
      }).eq('id', datasetId)
      if (datasetError) throw new Error(`Unable to update dataset: ${datasetError.message}`)

      const { error: versionRefreshError } = await admin.schema('catalog').from('dataset_versions').update({
        metadata: { ...versionMetadata, profiling_ready: true, source_validation: sourceValidation, source_type: source.source_type },
      }).eq('id', latestVersion.id)
      if (versionRefreshError) throw new Error(`Unable to refresh dataset version validation metadata: ${versionRefreshError.message}`)

      const { data: executionRows, error: executionLookupError } = await admin.schema('profiling').from('dataset_execution_sources')
        .select('id')
        .eq('dataset_version_id', latestVersion.id)
        .eq('active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (executionLookupError) throw new Error(`Unable to resolve profiling source: ${executionLookupError.message}`)
      const existingExecution = executionRows?.[0]
      if (existingExecution) {
        const { error } = await admin.schema('profiling').from('dataset_execution_sources').update({
          execution_config: executionConfig,
          active: true,
          updated_at: now,
        }).eq('id', existingExecution.id)
        if (error) throw new Error(`Unable to refresh profiling source validation: ${error.message}`)
      } else {
        const { error } = await admin.schema('profiling').from('dataset_execution_sources').insert({
          dataset_version_id: latestVersion.id,
          source_type: executionType,
          source_uri: sourceValidation.source_uri || sourceIdentifier,
          execution_config: executionConfig,
          active: true,
        })
        if (error) throw new Error(`Unable to restore profiling source: ${error.message}`)
      }
    }

    await writeGovernanceAudit({
      projectId: dataset.project_id,
      actorUserId: user.id,
      eventType: sourceBindingChanged ? 'DATASET_VERSION_CREATED' : 'DATASET_METADATA_UPDATED',
      entityType: 'DATASET',
      entityId: datasetId,
      metadata: {
        source_binding_changed: sourceBindingChanged,
        previous_version_id: latestVersion.id,
        active_version_id: activeVersionId,
        created_version_number: createdVersionNumber,
        source_id: source.id,
        source_identifier: sourceIdentifier,
      },
    })

    return NextResponse.json({ updated: true, profiling_ready: true, source_validation: sourceValidation, source_binding_changed: sourceBindingChanged, active_version_id: activeVersionId, created_version_number: createdVersionNumber })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dataset update failed.' }, { status: 500 })
  }
}
