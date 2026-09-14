import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { revokeApprovalDelegation } from '@/lib/governance/agent-approval-service'

export async function POST(_request: Request, context: { params: Promise<{ delegationId: string }> }) {
  try {
    const user = await requireApiUser()
    const { delegationId } = await context.params
    const delegation = await revokeApprovalDelegation({ delegationId, revokedBy: user.id })
    return NextResponse.json({ delegation })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to revoke approval delegation.' }, { status: 403 })
  }
}
