import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { verifyExternalApprovalToken } from '@/lib/governance/external-approval-token'
import { recordAgentApprovalDecision } from '@/lib/governance/agent-approval-service'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireApiUser()
    const { token } = await context.params
    const payload = verifyExternalApprovalToken(token)

    if (payload.recipientUserId !== user.id) {
      return NextResponse.json({ error: 'This approval link was issued to a different user.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const decision = text(body?.decision)
    const comment = text(body?.comment)
    if (!['APPROVED','REJECTED'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be APPROVED or REJECTED.' }, { status: 400 })
    }
    if (!comment) return NextResponse.json({ error: 'comment is required.' }, { status: 400 })

    const approval = await recordAgentApprovalDecision({
      requestId: payload.requestId,
      approverUserId: user.id,
      axis: payload.axis,
      decision: decision as 'APPROVED' | 'REJECTED',
      comment,
      channel: payload.channel,
    })
    return NextResponse.json({ approval })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record external approval decision.' }, { status: 403 })
  }
}
