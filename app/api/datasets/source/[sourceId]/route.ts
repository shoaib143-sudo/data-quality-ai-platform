import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'

export async function GET(_request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  try {
    const user = await requireUser()
    const { sourceId } = await params
    const admin = createAdminClient()
    const { data: source } = await admin.schema('catalog').from('data_sources').select('id, project_id, name, source_type, connection_metadata, status').eq('id', sourceId).maybeSingle()
    if (!source) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 })
    const { data: project } = await admin.schema('app').from('projects').select('organization_id').eq('id', source.project_id).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Connection access denied.' }, { status: 403 })
    const metadata = source.connection_metadata && typeof source.connection_metadata === 'object' ? source.connection_metadata as Record<string, unknown> : {}
    return NextResponse.json({ source: { id: source.id, projectId: source.project_id, name: source.name, sourceType: source.source_type, status: source.status, connectionKind: metadata.connection_kind ?? 'jdbc', jdbcUrl: metadata.jdbc_url ?? '', catalog: metadata.catalog ?? '', schema: metadata.schema ?? '', table: metadata.table ?? '' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load connection.' }, { status: 500 })
  }
}
