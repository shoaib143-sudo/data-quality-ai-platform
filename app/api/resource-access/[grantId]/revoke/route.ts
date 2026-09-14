import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { revokeResourceAccessGrant } from '@/lib/governance/resource-access-admin-service'

export async function POST(
  _request: Request,
  context: { params: Promise<{ grantId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { grantId } = await context.params
    const grant = await revokeResourceAccessGrant({ actorUserId: user.id, grantId })
    return NextResponse.json({ grant })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    return NextResponse.json(
      { error: authorization?.error ?? (error instanceof Error ? error.message : 'Unable to revoke resource access.') },
      { status: authorization?.status ?? 403 },
    )
  }
}
