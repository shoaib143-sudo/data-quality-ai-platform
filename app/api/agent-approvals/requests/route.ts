import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAgentApprovalRequest } from '@/lib/governance/agent-approval-service'
import { approvalRequestClientView, loadApprovalInbox } from '@/lib/governance/approval-inbox'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function GET() {
  try {
    const user = await requireApiUser()
    const items = await loadApprovalInbox(user.id)
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to list approval requests.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const parameters = body?.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
      ? body.parameters as Record<string, unknown>
      : {}

    const { approval, riskContext } = await createAgentApprovalRequest({
      requestedBy: user.id,
      actionKey: text(body?.actionKey ?? body?.action_key),
      projectId: text(body?.projectId ?? body?.project_id) || null,
      datasetId: text(body?.datasetId ?? body?.dataset_id) || null,
      parameters,
    })

    return NextResponse.json({
      approval: approvalRequestClientView(approval as Record<string, unknown>),
      riskContext: {
        domain: riskContext.domain,
        environment: riskContext.environment,
        businessCriticality: riskContext.businessCriticality,
        dataSensitivity: riskContext.dataSensitivity,
        risk: riskContext.risk,
      },
    }, { status: 201 })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create approval request.' }, { status: 400 })
  }
}
