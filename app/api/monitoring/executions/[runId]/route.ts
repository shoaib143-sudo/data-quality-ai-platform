import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { readExecution } from '@/lib/monitoring/execution-read-model'
export async function GET(request: Request, context: { params: Promise<{runId:string}> }) {
  try {
    const user = await requireApiUser(); const {runId} = await context.params
    const raw = Number(new URL(request.url).searchParams.get('limit') ?? 100)
    const limit = Number.isFinite(raw) ? Math.max(10,Math.min(1000,Math.floor(raw))) : 100
    return NextResponse.json(await readExecution(user.id,runId,limit),{headers:{'Cache-Control':'private, no-store'}})
  } catch(error) {
    const auth = authorizationErrorResponse(error)
    return NextResponse.json({error:auth?.error ?? 'Unable to load execution. It may be unavailable or incomplete.'},{status:auth?.status ?? 400})
  }
}
