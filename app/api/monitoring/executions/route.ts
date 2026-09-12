import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { readExecutionRoots } from '@/lib/monitoring/execution-read-model'
export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const params = new URL(request.url).searchParams
    const raw = Number(params.get('offset') ?? 0)
    const offset = Number.isSafeInteger(raw) && raw >= 0 ? Math.min(raw, 100000) : 0
    return NextResponse.json(await readExecutionRoots(user.id, params.get('projectId') ?? '', offset, params.get('status') ?? ''), {headers: {'Cache-Control': 'private, no-store'}})
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    return NextResponse.json({error: auth?.error ?? 'Executions unavailable.'}, {status: auth?.status ?? 400, headers: {'Cache-Control': 'private, no-store'}})
  }
}
