import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { readExecutionRoots } from '@/lib/monitoring/execution-read-model'
import { recordMonitorRead } from '@/lib/monitoring/telemetry'

export async function GET(request: Request) {
  const startedAt = Date.now()
  try {
    const user = await requireApiUser()
    const params = new URL(request.url).searchParams
    const raw = Number(params.get('offset') ?? 0)
    const offset = Number.isSafeInteger(raw) && raw >= 0 ? Math.min(raw, 100000) : 0
    const body = await readExecutionRoots(user.id, params.get('projectId') ?? '', offset, params.get('status') ?? '')
    const headers = recordMonitorRead('roots', startedAt, body, 200, {itemCount: body.runs.length})
    return NextResponse.json(body, {headers: {'Cache-Control': 'private, no-store', ...headers}})
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    const status = auth?.status ?? 400
    const body = {error: auth?.error ?? 'Executions unavailable.'}
    const headers = recordMonitorRead('roots', startedAt, body, status)
    return NextResponse.json(body, {status, headers: {'Cache-Control': 'private, no-store', ...headers}})
  }
}
