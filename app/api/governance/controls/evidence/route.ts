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
    const evidence = body.evidence && typeof body.evidence === 'object' && !Array.isArray(body.evidence)
      ? body.evidence as Record<string, unknown>
      : {}

    if (!projectId || !controlId || Object.keys(evidence).length === 0) {
      return NextResponse.json({ error: 'projectId, controlId and evidence are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.execute')

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('record_governance_control_evidence', {
      p_project_id: projectId,
      p_control_id: controlId,
      p_actor: user.id,
      p_evidence: evidence,
    })
    if (error) throw new Error(`Unable to record governance control evidence: ${error.message}`)
    if (!data || typeof data !== 'object' || data.audit_atomic !== true || data.database_capability_verified !== true) {
      throw new Error('Governance control evidence did not confirm atomic database authorization and audit.')
    }

    return NextResponse.json({ accepted: true, projectId, capability: 'agent.execute', evidence: data })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance control evidence recording failed.' }, { status: 500 })
  }
}
