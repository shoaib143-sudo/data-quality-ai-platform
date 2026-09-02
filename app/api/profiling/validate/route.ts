import { NextResponse } from 'next/server'

import { validateProfilingRun } from '@/lib/profiling/run-validation'
import { requireUser } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const profilingRunId = body?.profilingRunId ?? body?.profiling_run_id

    if (typeof profilingRunId !== 'string' || !profilingRunId.trim()) {
      return NextResponse.json(
        { error: 'profilingRunId is required' },
        { status: 400 },
      )
    }

    const validation = await validateProfilingRun(profilingRunId, user.id)
    return NextResponse.json(validation)
  } catch (error) {
    console.error('PROFILING_VALIDATION_ERROR', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.includes('not found')
      ? 404
      : message.includes('do not have access')
        ? 403
        : 500

    return NextResponse.json({ error: message }, { status })
  }
}
