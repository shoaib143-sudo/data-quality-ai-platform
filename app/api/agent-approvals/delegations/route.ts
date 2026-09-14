import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import {
  createApprovalDelegation,
  loadApprovalDelegationWorkspace,
} from '@/lib/governance/agent-approval-service'
import type { RiskLevel } from '@/lib/governance/agent-policy-v2'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function GET() {
  try {
    const user = await requireApiUser()
    const workspace = await loadApprovalDelegationWorkspace(user.id)
    return NextResponse.json(workspace, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load approval delegations.' }, { status: 403 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const actionKeys = Array.isArray(body?.actionKeys)
      ? body.actionKeys.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean)
      : []
    const maxRisk = text(body?.maxRisk)
    if (!['LOW','MEDIUM','HIGH','CRITICAL'].includes(maxRisk)) {
      return NextResponse.json({ error: 'maxRisk must be LOW, MEDIUM, HIGH, or CRITICAL.' }, { status: 400 })
    }

    const delegation = await createApprovalDelegation({
      delegatorUserId: user.id,
      delegateUserId: text(body?.delegateUserId),
      authorityId: text(body?.authorityId),
      projectId: text(body?.projectId) || null,
      actionKeys,
      maxRisk: maxRisk as RiskLevel,
      startsAt: text(body?.startsAt) || null,
      endsAt: text(body?.endsAt) || null,
      reason: text(body?.reason),
    })
    return NextResponse.json({ delegation }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create approval delegation.' }, { status: 403 })
  }
}
