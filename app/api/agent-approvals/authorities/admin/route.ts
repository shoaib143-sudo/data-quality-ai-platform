import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { createGovernanceAdminApprovalAuthority } from '@/lib/governance/delegation-admin-service'
import type { RiskLevel } from '@/lib/governance/agent-policy-v2'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const actionKeys = Array.isArray(body?.actionKeys)
      ? body.actionKeys.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean)
      : []
    const approvalAxis = text(body?.approvalAxis)
    const maxRisk = text(body?.maxRisk)
    if (!['BUSINESS','GOVERNANCE'].includes(approvalAxis)) {
      return NextResponse.json({ error: 'approvalAxis must be BUSINESS or GOVERNANCE.' }, { status: 400 })
    }
    if (!['LOW','MEDIUM','HIGH','CRITICAL'].includes(maxRisk)) {
      return NextResponse.json({ error: 'maxRisk must be LOW, MEDIUM, HIGH, or CRITICAL.' }, { status: 400 })
    }

    const authority = await createGovernanceAdminApprovalAuthority({
      adminUserId: user.id,
      approverUserId: text(body?.approverUserId),
      projectId: text(body?.projectId),
      domain: text(body?.domain),
      approvalAxis: approvalAxis as 'BUSINESS' | 'GOVERNANCE',
      actionKeys,
      maxRisk: maxRisk as RiskLevel,
      startsAt: text(body?.startsAt) || null,
      endsAt: text(body?.endsAt) || null,
      reason: text(body?.reason),
    })
    return NextResponse.json({ authority }, { status: 201 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    return NextResponse.json(
      { error: authorization?.error ?? (error instanceof Error ? error.message : 'Unable to assign direct approval authority.') },
      { status: authorization?.status ?? 403 },
    )
  }
}
