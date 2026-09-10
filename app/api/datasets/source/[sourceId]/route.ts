import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'

export async function GET(_request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  try {
    const user = await requireApiUser()
    const { sourceId } = await params
    const admin = createAdminClient()
    const { data: source } = await admin.schema('catalog').from('data_sources').select('id, project_id, name, source_type, connection_metadata, status').eq('id', sourceId).maybeSingle()
    if (!source) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 })

    await authorizeProject(user.id, source.project_id, 'source.manage')

    const metadata = source.connection_metadata && typeof source.connection_metadata === 'object' ? source.connection_metadata as Record<string, unknown> : {}
    return NextResponse.json({ source: { id: source.id, projectId: source.project_id, name: source.name, sourceType: source.source_type, status: source.status, connectionKind: metadata.connection_kind ?? 'jdbc', jdbcUrl: metadata.jdbc_url ?? '', catalog: metadata.catalog ?? '', schema: metadata.schema ?? '', table: metadata.table ?? '' } })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load connection.' }, { status: 500 })
  }
}
