import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_ACTIONS = new Set(['RETRY', 'ACKNOWLEDGE', 'ROLLBACK_REVIEW'])

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const user = await requireApiUser()
    const { caseId } = await context.params
    if (!caseId) return NextResponse.json({ error: 'caseId is required.' }, { status: 400 })

    const body = await request.json().catch(() => ({})) as { action?: unknown }
    const action = typeof body.action === 'string' ? body.action.trim().toUpperCase() : ''
    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ error: 'action must be RETRY, ACKNOWLEDGE, or ROLLBACK_REVIEW.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: recoveryCase, error: caseError } = await supabase
      .schema('orchestration')
      .from('recovery_cases')
      .select('id,project_id')
      .eq('id', caseId)
      .maybeSingle()
    if (caseError || !recoveryCase) return NextResponse.json({ error: 'Recovery case not found.' }, { status: 404 })

    await authorizeProject(user.id, recoveryCase.project_id, 'agent.execute')

    const { data, error } = await supabase.schema('orchestration').rpc('request_execution_recovery_action', {
      p_case_id: caseId,
      p_action: action,
    })

    if (error) {
      const retryConflict = /not classified as safe|not in a retryable terminal state/i.test(error.message)
      const missing = /not found/i.test(error.message)
      const forbidden = /outside the current project scope|authentication is required/i.test(error.message)
      return NextResponse.json(
        { error: error.message },
        { status: forbidden ? 403 : missing ? 404 : retryConflict ? 409 : 400 },
      )
    }

    return NextResponse.json({ recovery: data })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    const message = error instanceof Error ? error.message : 'Unable to request recovery action.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
