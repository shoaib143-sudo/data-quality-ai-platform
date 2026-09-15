import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentExecutionFingerprint, validateApprovalForExecution } from '@/lib/governance/agent-approval-service'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const user = await requireApiUser()
    const { requestId } = await context.params
    const admin = createAdminClient()
    const { data: approval, error } = await admin.schema('governance').from('agent_approval_requests')
      .select('id,project_id,status,action_key,fingerprint_payload')
      .eq('id', requestId)
      .maybeSingle()
    if (error) throw new Error(`Unable to load execution request: ${error.message}`)
    if (!approval) return NextResponse.json({ error: 'Execution request was not found.' }, { status: 404 })

    const payload = record(approval.fingerprint_payload)
    const parameters = record(payload.parameters)
    const currentFingerprint = await currentExecutionFingerprint({ requestId: approval.id, parameters })
    await validateApprovalForExecution({
      requestId: approval.id,
      executorUserId: user.id,
      currentFingerprint,
      expectedActionKey: String(approval.action_key),
    })

    let pathname: string
    let body: Record<string, unknown>

    if (approval.action_key === 'RUN_PROFILING') {
      pathname = '/api/agents/run'
      body = {
        ...parameters,
        projectId: approval.project_id,
        approvalRequestId: approval.id,
      }
    } else if (approval.action_key === 'RUN_DATA_QUALITY') {
      pathname = '/api/data-quality/run'
      body = {
        ...parameters,
        approvalRequestId: approval.id,
      }
    } else if (approval.action_key === 'RUN_SUPERVISOR') {
      pathname = '/api/agents/supervisor/run'
      body = {
        ...parameters,
        projectId: approval.project_id,
        approvalRequestId: approval.id,
      }
    } else {
      return NextResponse.json({ error: 'This requested action is not yet executable from the approval inbox.' }, { status: 409 })
    }

    const cookie = request.headers.get('cookie') ?? ''
    const response = await fetch(new URL(pathname, request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie,
        'x-datanexus-execution-request': approval.id,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const text = await response.text()
    return new NextResponse(text, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to fulfill execution request.' }, { status: 500 })
  }
}
