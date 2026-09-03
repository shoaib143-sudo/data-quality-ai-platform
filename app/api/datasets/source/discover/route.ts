import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { discoverJdbcCatalog } from '@/lib/connectors/jdbc'

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
    const jdbcUrl = text(body.jdbcUrl)
    const connectionKind = text(body.connectionKind) || 'jdbc'
    const schema = text(body.schema)
    const credentialRef = serverCredentialRef(connectionKind)

    if (!projectId || !jdbcUrl) {
      return NextResponse.json({ error: 'projectId and connection string are required.', code: 'INVALID_DISCOVERY_REQUEST' }, { status: 400 })
    }
    if (!credentialRef) {
      return NextResponse.json({ error: 'JDBC credential configuration is missing for this connection type.', code: 'JDBC_CREDENTIAL_REF_MISSING', connectionKind }, { status: 503 })
    }

    const admin = createAdminClient()
    const { data: project } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.', code: 'PROJECT_ACCESS_DENIED' }, { status: 403 })

    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) {
      return NextResponse.json({ error: 'Project access denied.', code: 'PROJECT_ACCESS_DENIED' }, { status: 403 })
    }

    try {
      const catalog = await discoverJdbcCatalog({ jdbcUrl, credentialRef, schema: schema || undefined })
      return NextResponse.json({ ...catalog, schema: schema || null })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'JDBC catalog discovery failed.', code: 'JDBC_DISCOVERY_FAILED', connectionKind }, { status: 502 })
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'JDBC catalog discovery failed.', code: 'JDBC_DISCOVERY_REQUEST_FAILED' }, { status: 400 })
  }
}
