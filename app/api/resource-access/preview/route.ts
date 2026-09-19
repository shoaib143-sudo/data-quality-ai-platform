import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { previewResourceAccessGrant } from '@/lib/governance/resource-access-admin-service'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const effect = text(body?.effect)
    if (!['ALLOW','DENY'].includes(effect)) {
      return NextResponse.json({ error: 'effect must be ALLOW or DENY.' }, { status: 400 })
    }
    const preview = await previewResourceAccessGrant({
      actorUserId: user.id,
      projectId: text(body?.projectId),
      datasetId: text(body?.datasetId),
      targetUserId: text(body?.targetUserId),
      effect: effect as 'ALLOW' | 'DENY',
    })
    return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    return NextResponse.json(
      { error: authorization?.error ?? (error instanceof Error ? error.message : 'Unable to preview resource access.') },
      { status: authorization?.status ?? 403 },
    )
  }
}
