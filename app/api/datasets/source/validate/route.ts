import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
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

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const sourceId = text(body.sourceId)
    if (!projectId || !sourceId) return NextResponse.json({ error: 'projectId and sourceId are required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: project } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources').select('id, project_id, name, source_type, connection_metadata, status').eq('id', sourceId).eq('project_id', projectId).maybeSingle()
    if (sourceError || !source) return NextResponse.json({ error: 'Data source not found.' }, { status: 404 })

    const identifier = sourceIdentifier(source)
    const validation = await validateDataSourceForProfiling(admin, source, identifier)
    const now = new Date().toISOString()
    const nextStatus = validation.valid ? 'ACTIVE' : 'CONFIGURED'
    const { error: updateError } = await admin.schema('catalog').from('data_sources').update({ status: nextStatus, updated_at: now }).eq('id', source.id).eq('project_id', projectId)
    if (updateError) throw new Error(`Unable to update source status: ${updateError.message}`)

    if (!validation.valid) {
      const { data: datasets } = await admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('data_source_id', source.id)
      const datasetIds = (datasets ?? []).map(item => item.id)
      if (datasetIds.length) {
        const { data: versions } = await admin.schema('catalog').from('dataset_versions').select('id').in('dataset_id', datasetIds)
        const versionIds = (versions ?? []).map(item => item.id)
        if (versionIds.length) await admin.schema('profiling').from('dataset_execution_sources').update({ active: false, updated_at: now }).in('dataset_version_id', versionIds)
      }
    }

    return NextResponse.json({ source: { ...source, status: nextStatus }, validation, operational: validation.valid })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Source validation failed.' }, { status: 500 })
  }
}
