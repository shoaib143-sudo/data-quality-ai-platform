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
    const requirementIds = Array.isArray(body.requirementIds ?? body.requirement_ids)
      ? (body.requirementIds ?? body.requirement_ids) as unknown[]
      : []
    const control = body.control && typeof body.control === 'object' && !Array.isArray(body.control)
      ? body.control as Record<string, unknown>
      : {}

    if (!projectId || requirementIds.length === 0 || Object.keys(control).length === 0) {
      return NextResponse.json({ error: 'projectId, requirementIds and control are required.' }, { status: 400 })
    }
    if (requirementIds.some((value) => !text(value))) {
      return NextResponse.json({ error: 'requirementIds must contain non-empty requirement UUIDs.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'catalog.update')

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('propose_governance_control', {
      p_project_id: projectId,
      p_actor: user.id,
      p_requirement_ids: requirementIds,
      p_control: control,
    })
    if (error) throw new Error(`Unable to propose governance control: ${error.message}`)
    if (!data || typeof data !== 'object' || data.audit_atomic !== true || data.database_capability_verified !== true) {
      throw new Error('Governance control proposal did not confirm atomic database authorization and audit.')
    }
    if (data.lifecycle_status !== 'PROPOSED' || data.review_status !== 'PENDING' || data.authority_class !== 'UNVERIFIED') {
      throw new Error('Governance control proposal returned an invalid initial lifecycle state.')
    }

    return NextResponse.json({ accepted: true, projectId, capability: 'catalog.update', control: data }, { status: 202 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance control proposal failed.' }, { status: 500 })
  }
}
