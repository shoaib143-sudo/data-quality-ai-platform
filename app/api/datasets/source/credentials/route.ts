import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function refPart(value: string) { return value.replace(/[^A-Za-z0-9]/g, '_') }
function connectionRef(projectId: string, sourceId?: string) {
  const suffix = sourceId ? refPart(sourceId) : crypto.randomUUID().replace(/-/g, '')
  return `DGP_${refPart(projectId)}_${suffix}`
}
function bridgeConfig() {
  const url = process.env.JDBC_BRIDGE_URL?.trim()
  const token = process.env.JDBC_BRIDGE_TOKEN?.trim()
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}
function isPostgres(kind: string, jdbcUrl: string) {
  return kind.toLowerCase() === 'postgresql' || jdbcUrl.toLowerCase().startsWith('jdbc:postgresql://')
}
function isDatabricks(kind: string, jdbcUrl: string) {
  return kind.toLowerCase() === 'databricks' || jdbcUrl.toLowerCase().startsWith('jdbc:databricks://')
}

async function storeViaEdge(
  admin: ReturnType<typeof createAdminClient>,
  functionName: string,
  credentialRef: string,
  username: string,
  password: string,
  engineLabel: string,
) {
  const { data, error } = await admin.functions.invoke(functionName, {
    body: { action: 'credential', credential_ref: credentialRef, username, password },
  })
  if (error) throw new Error(error.message || `Unable to store ${engineLabel} credentials.`)
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  if (typeof payload.error === 'string') throw new Error(payload.error)
}

async function storeViaBridge(
  bridge: { url: string; token: string },
  credentialRef: string,
  username: string,
  password: string,
  connectionKind: string,
) {
  const response = await fetch(`${bridge.url}/v1/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bridge.token}` },
    body: JSON.stringify({ credentialRef, username, password, connectionKind }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to securely save connection credentials.')
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const sourceId = text(body.sourceId)
    const username = text(body.username)
    const password = typeof body.password === 'string' ? body.password : ''
    const connectionKind = text(body.connectionKind) || 'jdbc'
    const jdbcUrl = text(body.jdbcUrl)
    if (!projectId || !username || !password) return NextResponse.json({ error: 'Project, username, and password are required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: project } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    if (sourceId) {
      const { data: source } = await admin.schema('catalog').from('data_sources').select('id').eq('id', sourceId).eq('project_id', projectId).maybeSingle()
      if (!source) return NextResponse.json({ error: 'Connection access denied.' }, { status: 403 })
    }

    const credentialRef = connectionRef(projectId, sourceId || undefined)

    if (isPostgres(connectionKind, jdbcUrl)) {
      await storeViaEdge(admin, 'dgp-postgres-connector', credentialRef, username, password, 'PostgreSQL')
      return NextResponse.json({ credentialRef, configured: true, connector: 'supabase-edge-postgres' })
    }

    if (isDatabricks(connectionKind, jdbcUrl)) {
      await storeViaEdge(admin, 'dgp-databricks-connector', credentialRef, username, password, 'Databricks')
      return NextResponse.json({ credentialRef, configured: true, connector: 'supabase-edge-databricks' })
    }

    const bridge = bridgeConfig()
    if (bridge) {
      await storeViaBridge(bridge, credentialRef, username, password, connectionKind)
      return NextResponse.json({ credentialRef, configured: true, connector: 'jdbc-bridge' })
    }

    return NextResponse.json({
      error: 'The connector service is not available for this database type. PostgreSQL and Databricks have built-in secure connectors; other JDBC drivers still require the JDBC bridge.',
      code: 'CONNECTOR_UNAVAILABLE',
    }, { status: 503 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to configure connection credentials.' }, { status: 500 })
  }
}
