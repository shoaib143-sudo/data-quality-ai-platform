import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { loadApprovalInbox } from '@/lib/governance/approval-inbox'

export async function GET(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const user = await requireApiUser()
    const { requestId } = await context.params
    const items = await loadApprovalInbox(user.id)
    const item = items.find(candidate => String(candidate.request.id ?? '') === requestId)
    if (!item) return NextResponse.json({ error: 'Approval request was not found.' }, { status: 404 })
    return NextResponse.json({ item }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load approval request.' }, { status: 500 })
  }
}
