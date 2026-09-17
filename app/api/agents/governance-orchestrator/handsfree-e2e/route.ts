import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { authorizeDataGovernanceAdmin } from '@/lib/auth/authorize-data-governance-admin'

export const maxDuration = 300

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

/**
 * Data Governance Admin-only entry point for unattended E2E certification.
 *
 * The endpoint intentionally does not impersonate approval authorities or
 * bypass authentication. Subsequent slices attach the durable certification
 * orchestrator and isolated synthetic personas behind this boundary.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    const authorization = await authorizeDataGovernanceAdmin(user.id, projectId)
    const certificationRunId = randomUUID()

    return NextResponse.json({
      accepted: true,
      status: 'READY',
      certificationRunId,
      projectId: authorization.projectId,
      initiatedBy: user.id,
      initiatorRole: authorization.roleKey,
      executionMode: 'HANDS_FREE_E2E',
      isolationRequired: true,
      approvalBypassAllowed: false,
      authBypassAllowed: false,
      message: 'Hands-free E2E authorization accepted. Durable certification execution is not started by this authorization-only slice.',
    }, { status: 202 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to authorize hands-free E2E certification.' }, { status: 500 })
  }
}
