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
    if (sourceType === 'JDBC' && (!jdbcUrl || !credentialRef)) return NextResponse.json({ error: !credentialRef ? 'No server-managed JDBC credentials are configured for this connection type.' : 'JDBC connection string is required.' }, { status: !credentialRef ? 503 : 400 })
    if (sourceType === 'JDBC' && !connectionOnly && (!schema || !table)) return NextResponse.json({ error: 'JDBC sources require connection string, schema, and table.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: project } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Your role cannot register data sources.' }, { status: 403 })

    if (sourceType === 'JDBC' && connectionOnly) {
      const connectionMetadata = { jdbc_url: jdbcUrl, credential_ref: credentialRef, connection_kind: connectionKind }
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
      return NextResponse.json({ source, profiling_ready: true }, { status: 200 })
    }

    const { data: source, error } = await admin.schema('catalog').from('data_sources').insert({ project_id: projectId, name, source_type: sourceType, connection_metadata: connectionMetadata, status: 'ACTIVE' }).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
    if (error || !source) return NextResponse.json({ error: `Unable to register source: ${error?.message ?? 'unknown error'}` }, { status: 500 })
    return NextResponse.json({ source, profiling_ready: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Source registration failed.' }, { status: 500 })
  }
}
