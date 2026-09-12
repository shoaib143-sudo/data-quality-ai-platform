import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { readExecutionBranch } from '@/lib/monitoring/execution-branch'
export async function GET(request: Request, context: {params: Promise<{runId: string; branchId: string}>}) {
  try {
    const user = await requireApiUser()
    const {runId, branchId} = await context.params
    const raw = Number(new URL(request.url).searchParams.get('offset') ?? 0)
    const offset = Number.isSafeInteger(raw) && raw >= 0 ? Math.min(raw, 100000) : 0
    return NextResponse.json(await readExecutionBranch(user.id, runId, branchId, offset), {headers: {'Cache-Control': 'private, no-store'}})
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    return NextResponse.json({error: auth?.error ?? 'Branch diagnostics unavailable.'}, {status: auth?.status ?? 404, headers: {'Cache-Control': 'private, no-store'}})
  }
}
