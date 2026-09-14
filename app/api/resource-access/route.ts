import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { createResourceAccessGrant, loadResourceAccessWorkspace } from '@/lib/governance/resource-access-admin-service'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function GET() {
  try {
    const user = await requireApiUser()
    const workspace = await loadResourceAccessWorkspace(user.id)
    return NextResponse.json(workspace, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    return NextResponse.json(
      { error: authorization?.error ?? (error instanceof Error ? error.message : 'Unable to load resource access.') },
      { status: authorization?.status ?? 403 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const effect = text(body?.effect)
    if (!['ALLOW','DENY'].includes(effect)) {
      return NextResponse.json({ error: 'effect must be ALLOW or DENY.' }, { status: 400 })
    }
    const grant = await createResourceAccessGrant({
      actorUserId: user.id,
      projectId: text(body?.projectId),
      datasetId: text(body?.datasetId),
      targetUserId: text(body?.targetUserId),
      effect: effect as 'ALLOW' | 'DENY',
      startsAt: text(body?.startsAt) || null,
      endsAt: text(body?.endsAt) || null,
      reason: text(body?.reason),
    })
    return NextResponse.json({ grant }, { status: 201 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    return NextResponse.json(
      { error: authorization?.error ?? (error instanceof Error ? error.message : 'Unable to create resource access.') },
      { status: authorization?.status ?? 403 },
    )
  }
}
