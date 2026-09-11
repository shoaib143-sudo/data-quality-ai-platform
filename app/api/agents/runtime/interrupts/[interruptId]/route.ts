import { NextResponse } from 'next/server'

import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_DECISIONS = new Set(['APPROVED', 'REJECTED'])
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/

export async function POST(request: Request, context: { params: Promise<{ interruptId: string }> }) {
  try {
    const user = await requireApiUser()
    const { interruptId } = await context.params
    if (!interruptId) return NextResponse.json({ error: 'interruptId is required.' }, { status: 400 })

    const body = await request.json().catch(() => ({})) as {
      decision?: unknown
      actionPayloadHash?: unknown
      response?: unknown
    }
    const decision = typeof body.decision === 'string' ? body.decision.trim().toUpperCase() : ''
    if (!ALLOWED_DECISIONS.has(decision)) {
      return NextResponse.json({ error: 'decision must be APPROVED or REJECTED.' }, { status: 400 })
    }

    const actionPayloadHash = typeof body.actionPayloadHash === 'string'
      ? body.actionPayloadHash.trim().toLowerCase()
      : null
    if (actionPayloadHash && !SHA256_PATTERN.test(actionPayloadHash)) {
      return NextResponse.json({ error: 'actionPayloadHash must be a sha256 digest.' }, { status: 400 })
    }

    const response = body.response && typeof body.response === 'object' && !Array.isArray(body.response)
      ? body.response as Record<string, unknown>
      : {}

    const supabase = await createClient()
    const { data: interrupt, error: interruptError } = await supabase
      .schema('agent')
      .from('agent_run_interrupts')
      .select('id,agent_run_id,status,action_payload_hash')
      .eq('id', interruptId)
      .maybeSingle()

    if (interruptError || !interrupt) {
      return NextResponse.json({ error: 'Agent runtime interrupt not found.' }, { status: 404 })
    }

    if (interrupt.status !== 'PENDING') {
      return NextResponse.json({ error: 'Agent runtime interrupt is not pending.' }, { status: 409 })
    }

    if (interrupt.action_payload_hash && interrupt.action_payload_hash !== actionPayloadHash) {
      return NextResponse.json({ error: 'Approval payload does not match the pending action.' }, { status: 409 })
    }

    const { data: agentRun, error: runError } = await supabase
      .schema('agent')
      .from('agent_runs')
      .select('id,project_id')
      .eq('id', interrupt.agent_run_id)
      .maybeSingle()

    if (runError || !agentRun) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })

    await authorizeProject(user.id, agentRun.project_id, 'agent.execute')

    const { data, error } = await supabase.schema('agent').rpc('resolve_runtime_interrupt', {
      p_interrupt_id: interruptId,
      p_decision: decision,
      p_action_payload_hash: actionPayloadHash,
      p_response: response,
    })

    if (error) {
      const forbidden = /authentication is required|administrator approval/i.test(error.message)
      const missing = /not found/i.test(error.message)
      const conflict = /not pending|does not match|expired/i.test(error.message)
      return NextResponse.json(
        { error: error.message },
        { status: forbidden ? 403 : missing ? 404 : conflict ? 409 : 400 },
      )
    }

    const resolution = Array.isArray(data) ? data[0] ?? null : data
    return NextResponse.json({ interrupt: resolution })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    const message = error instanceof Error ? error.message : 'Unable to resolve agent runtime interrupt.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
