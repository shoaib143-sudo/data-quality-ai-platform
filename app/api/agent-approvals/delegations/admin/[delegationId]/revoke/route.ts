import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { revokeGovernanceAdminApprovalDelegation } from '@/lib/governance/delegation-admin-service'

export async function POST(
  _request: Request,
  context: { params: Promise<{ delegationId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { delegationId } = await context.params
    const delegation = await revokeGovernanceAdminApprovalDelegation({
      adminUserId: user.id,
      delegationId,
    })
    return NextResponse.json({ delegation })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    return NextResponse.json(
      { error: authorization?.error ?? (error instanceof Error ? error.message : 'Unable to revoke governance-admin delegation.') },
      { status: authorization?.status ?? 403 },
    )
  }
}
