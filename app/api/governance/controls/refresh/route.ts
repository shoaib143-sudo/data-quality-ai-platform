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
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'agent.execute')

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('refresh_project_governance_control_intelligence', {
      p_project_id: projectId,
      p_actor: user.id,
    })
    if (error) throw new Error(`Unable to refresh governance control intelligence: ${error.message}`)
    if (!data || typeof data !== 'object' || data.database_capability_verified !== true) {
      throw new Error('Governance control intelligence refresh did not confirm the database authorization boundary.')
    }

    return NextResponse.json({
      accepted: true,
      projectId,
      capability: 'agent.execute',
      refresh: data,
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance control intelligence refresh failed.' }, { status: 500 })
  }
}
