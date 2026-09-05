import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'JSON request body is required.' }, { status: 400 })

    const projectId = text(body.projectId ?? body.project_id)
    const controlId = text(body.controlId ?? body.control_id)
    const scope = body.scope && typeof body.scope === 'object' && !Array.isArray(body.scope)
      ? body.scope as Record<string, unknown>
      : {}

    if (!projectId || !controlId || Object.keys(scope).length === 0) {
      return NextResponse.json({ error: 'projectId, controlId and scope are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'catalog.update')

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('bind_governance_control_scope', {
      p_project_id: projectId,
      p_control_id: controlId,
      p_actor: user.id,
      p_scope: scope,
    })
    if (error) throw new Error(`Unable to bind governance control scope: ${error.message}`)
    if (!data || typeof data !== 'object' || data.audit_atomic !== true || data.database_capability_verified !== true || data.status !== 'ACTIVE') {
      throw new Error('Governance control scope binding did not confirm governed atomic persistence.')
    }

    return NextResponse.json({ accepted: true, projectId, capability: 'catalog.update', scope: data })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance control scope binding failed.' }, { status: 500 })
  }
}
