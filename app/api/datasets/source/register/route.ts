import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { validateJdbcConnection } from '@/lib/connectors/jdbc'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const name = text(body.name)
    const jdbcUrl = text(body.jdbcUrl)
    const credentialRef = text(body.credentialRef)
    const schema = text(body.schema)
    const table = text(body.table)
    if (!projectId || !name || !jdbcUrl || !credentialRef || !schema || !table) return NextResponse.json({ error: 'projectId, name, jdbcUrl, credentialRef, schema, and table are required.' }, { status: 400 })
    const admin = createAdminClient()
    const { data: project } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Your role cannot register data sources.' }, { status: 403 })
    const validation = await validateJdbcConnection({ jdbcUrl, credentialRef, schema, table })
    if (!validation.valid) return NextResponse.json({ error: 'JDBC source validation failed.', validation }, { status: 422 })
    const { data: existing } = await admin.schema('catalog').from('data_sources').select('id').eq('project_id', projectId).eq('name', name).maybeSingle()
    if (existing) return NextResponse.json({ error: 'A data source with this name already exists in the project.' }, { status: 409 })
    const { data: source, error } = await admin.schema('catalog').from('data_sources').insert({ project_id: projectId, name, source_type: 'JDBC', connection_metadata: { jdbc_url: jdbcUrl, credential_ref: credentialRef, schema, table }, status: 'ACTIVE' }).select('id, project_id, name, source_type, connection_metadata, status, created_at, updated_at').single()
    if (error || !source) return NextResponse.json({ error: `Unable to register JDBC source: ${error?.message ?? 'unknown error'}` }, { status: 500 })
    return NextResponse.json({ source, validation }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'JDBC source registration failed.' }, { status: 500 })
  }
}
