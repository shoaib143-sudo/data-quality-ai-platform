import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { versionSnapshot } from '@/lib/monitoring/execution-contract'
import { readExecution } from '@/lib/monitoring/execution-read-model'
import { recordMonitorRead } from '@/lib/monitoring/telemetry'

export async function GET(request: Request, context: { params: Promise<{runId:string}> }) {
  const startedAt = Date.now()
  try {
    const user = await requireApiUser(); const {runId} = await context.params
    const raw = Number(new URL(request.url).searchParams.get('limit') ?? 100)
    const limit = Number.isFinite(raw) ? Math.max(10,Math.min(1000,Math.floor(raw))) : 100
    const body = versionSnapshot(await readExecution(user.id,runId,limit))
    const headers = recordMonitorRead('execution', startedAt, body, 200, {itemCount: body.runs.length, truncated: body.truncated})
    return NextResponse.json(body,{headers:{'Cache-Control':'private, no-store','X-Monitor-Schema-Version':String(body.schemaVersion),...headers}})
  } catch(error) {
    const auth = authorizationErrorResponse(error)
    if (!auth) console.error('Monitoring execution read failed')
    const status = auth?.status ?? 400
    const body = {error:auth?.error ?? 'Unable to load execution. It may be unavailable or incomplete.'}
    const headers = recordMonitorRead('execution', startedAt, body, status)
    return NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store',...headers}})
  }
}
