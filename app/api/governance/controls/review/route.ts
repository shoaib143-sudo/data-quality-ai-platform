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
    const projectId = text(body?.projectId ?? body?.project_id)
    const controlId = text(body?.controlId ?? body?.control_id)
    const decision = text(body?.decision).toUpperCase()
    const comment = text(body?.comment).slice(0, 2000)

    if (!projectId || !controlId) {
      return NextResponse.json({ error: 'projectId and controlId are required.' }, { status: 400 })
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be APPROVED or REJECTED.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'policy.approve')

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('review_governance_control', {
      p_project_id: projectId,
      p_control_id: controlId,
      p_reviewer: user.id,
      p_decision: decision,
      p_comment: comment || null,
    })
    if (error) throw new Error(`Unable to review governance control: ${error.message}`)
    if (!data || typeof data !== 'object' || data.audit_atomic !== true || data.database_capability_verified !== true) {
      throw new Error('Governance control review did not confirm atomic database authorization and audit.')
    }

    const expectedLifecycle = decision === 'APPROVED' ? 'ACTIVE' : 'REJECTED'
    if (data.review_status !== decision || data.lifecycle_status !== expectedLifecycle) {
      throw new Error('Governance control review returned an invalid governed lifecycle transition.')
    }
    if (decision === 'APPROVED' && !['ENTERPRISE', 'BOOTSTRAP'].includes(String(data.authority_class ?? ''))) {
      throw new Error('Approved governance control did not return an eligible authority classification.')
    }

    return NextResponse.json({ accepted: true, projectId, capability: 'policy.approve', review: data })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance control review failed.' }, { status: 500 })
  }
}
