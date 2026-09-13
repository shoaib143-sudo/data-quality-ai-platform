import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { recordAgentApprovalDecision } from '@/lib/governance/agent-approval-service'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const user = await requireApiUser()
    const { requestId } = await context.params
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const axis = text(body?.axis)
    const decision = text(body?.decision)
    const comment = text(body?.comment)
    const channel = text(body?.channel) || 'DATANEXUS'

    if (!['BUSINESS','GOVERNANCE'].includes(axis)) {
      return NextResponse.json({ error: 'axis must be BUSINESS or GOVERNANCE.' }, { status: 400 })
    }
    if (!['APPROVED','REJECTED'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be APPROVED or REJECTED.' }, { status: 400 })
    }
    if (!comment) return NextResponse.json({ error: 'comment is required.' }, { status: 400 })
    if (!['DATANEXUS','EMAIL','TEAMS'].includes(channel)) {
      return NextResponse.json({ error: 'Unsupported approval channel.' }, { status: 400 })
    }

    const approval = await recordAgentApprovalDecision({
      requestId,
      approverUserId: user.id,
      axis: axis as 'BUSINESS' | 'GOVERNANCE',
      decision: decision as 'APPROVED' | 'REJECTED',
      comment,
      channel: channel as 'DATANEXUS' | 'EMAIL' | 'TEAMS',
    })
    return NextResponse.json({ approval })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record approval decision.' }, { status: 403 })
  }
}
