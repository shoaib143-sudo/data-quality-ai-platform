import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { readExecutionBranch } from '@/lib/monitoring/execution-branch'
import { recordMonitorRead } from '@/lib/monitoring/telemetry'

export async function GET(request: Request, context: {params: Promise<{runId: string; branchId: string}>}) {
  const startedAt = Date.now()
  try {
    const user = await requireApiUser()
    const {runId, branchId} = await context.params
    const raw = Number(new URL(request.url).searchParams.get('offset') ?? 0)
    const offset = Number.isSafeInteger(raw) && raw >= 0 ? Math.min(raw, 100000) : 0
    const body = await readExecutionBranch(user.id, runId, branchId, offset)
    const itemCount = body.steps.length + body.attempts.length + (body.checkpoints?.length ?? 0) + (body.events?.length ?? 0)
    const headers = recordMonitorRead('branch', startedAt, body, 200, {itemCount})
    return NextResponse.json(body, {headers: {'Cache-Control': 'private, no-store', ...headers}})
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    const status = auth?.status ?? 404
    const body = {error: auth?.error ?? 'Branch diagnostics unavailable.'}
    const headers = recordMonitorRead('branch', startedAt, body, status)
    return NextResponse.json(body, {status, headers: {'Cache-Control': 'private, no-store', ...headers}})
  }
}
