import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { evaluateProductionReadiness, persistProductionReadiness } from '@/lib/platform/production-readiness'

function text(value: unknown, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser()
    const { projectId } = await context.params
    await authorizeProject(user.id, projectId, 'admin.manage')
    const readiness = await evaluateProductionReadiness(projectId)
    return NextResponse.json(readiness)
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to evaluate production readiness.' }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser()
    const { projectId } = await context.params
    await authorizeProject(user.id, projectId, 'admin.manage')
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const notes = text(body?.notes)
    const persisted = await persistProductionReadiness({
      projectId,
      actorUserId: user.id,
      notes: notes || null,
    })
    return NextResponse.json(persisted, { status: 201 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to persist production readiness.' }, { status: 500 })
  }
}
