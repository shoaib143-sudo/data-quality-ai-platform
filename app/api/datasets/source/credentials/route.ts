import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function connectionRef(projectId: string) { return `DGP_${projectId.replace(/[^A-Za-z0-9]/g, '_')}_${crypto.randomUUID().replace(/-/g, '')}` }
function bridgeConfig() {
  const url = process.env.JDBC_BRIDGE_URL?.trim()
  const token = process.env.JDBC_BRIDGE_TOKEN?.trim()
  if (!url || !token) throw new Error('The connector service is not available. Please try again later.')
  return { url: url.replace(/\/$/, ''), token }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const username = text(body.username)
    const password = typeof body.password === 'string' ? body.password : ''
    const connectionKind = text(body.connectionKind) || 'jdbc'
    if (!projectId || !username || !password) return NextResponse.json({ error: 'Project, username, and password are required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: project } = await admin.schema('app').from('projects').select('id, organization_id').eq('id', projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    const credentialRef = connectionRef(projectId)
    const bridge = bridgeConfig()
    const response = await fetch(`${bridge.url}/v1/credentials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bridge.token}` },
      body: JSON.stringify({ credentialRef, username, password, connectionKind }),
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return NextResponse.json({ error: typeof payload.error === 'string' ? payload.error : 'Unable to securely save connection credentials.' }, { status: 502 })
    return NextResponse.json({ credentialRef, configured: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to configure connection credentials.' }, { status: 500 })
  }
}
