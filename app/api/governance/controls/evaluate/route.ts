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
    const scopeBindingId = text(body?.scopeBindingId ?? body?.scope_binding_id)

    if (!projectId || !controlId) {
      return NextResponse.json({ error: 'projectId and controlId are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.execute')

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('evaluate_governance_control', {
      p_project_id: projectId,
      p_control_id: controlId,
      p_scope_binding_id: scopeBindingId || null,
      p_actor: user.id,
    })
    if (error) throw new Error(`Unable to evaluate governance control: ${error.message}`)
    if (!data || typeof data !== 'object' || data.database_capability_verified !== true) {
      throw new Error('Governance control evaluation did not confirm database authorization.')
    }
    if (!['PASS', 'WARN', 'FAIL', 'UNKNOWN'].includes(String(data.result ?? ''))) {
      throw new Error('Governance control evaluation returned an invalid result.')
    }

    return NextResponse.json({ accepted: true, projectId, capability: 'agent.execute', evaluation: data })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance control evaluation failed.' }, { status: 500 })
  }
}
