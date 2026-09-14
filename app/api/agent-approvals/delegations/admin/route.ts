import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import {
  createGovernanceAdminApprovalDelegation,
  loadGovernanceAdminDelegationWorkspace,
} from '@/lib/governance/delegation-admin-service'
import type { RiskLevel } from '@/lib/governance/agent-policy-v2'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function GET() {
  try {
    const user = await requireApiUser()
    const workspace = await loadGovernanceAdminDelegationWorkspace(user.id)
    return NextResponse.json(workspace, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    return NextResponse.json(
      { error: authorization?.error ?? (error instanceof Error ? error.message : 'Unable to load governance-admin delegations.') },
      { status: authorization?.status ?? 403 },
    )
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

    const delegation = await createGovernanceAdminApprovalDelegation({
      adminUserId: user.id,
      authorityId: text(body?.authorityId),
      delegateUserId: text(body?.delegateUserId),
      projectId: text(body?.projectId),
      actionKeys,
      maxRisk: maxRisk as RiskLevel,
      startsAt: text(body?.startsAt) || null,
      endsAt: text(body?.endsAt) || null,
      reason: text(body?.reason),
    })
    return NextResponse.json({ delegation }, { status: 201 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    return NextResponse.json(
      { error: authorization?.error ?? (error instanceof Error ? error.message : 'Unable to create governance-admin delegation.') },
      { status: authorization?.status ?? 403 },
    )
  }
}
