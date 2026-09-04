import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function numericScore(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null
}

function text(value: unknown, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireUser()
    const { runId } = await context.params
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const score = numericScore(body?.score)
    const feedbackText = text(body?.feedback)
    if (score === null) return NextResponse.json({ error: 'score must be between 0 and 1.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: run, error: runError } = await admin.schema('agent').from('agent_runs')
      .select('id,project_id,status,agent_definition_id')
      .eq('id', runId)
      .maybeSingle()
    if (runError) throw new Error(`Unable to resolve agent run: ${runError.message}`)
    if (!run) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })

    await authorizeProject(user.id, run.project_id, 'agent.execute')
    if (!['SUCCEEDED','COMPLETED','PARTIAL'].includes(String(run.status).toUpperCase())) {
      return NextResponse.json({ error: 'Only completed or partial runs can be evaluated.' }, { status: 409 })
    }

    const { data: evaluation, error: evaluationError } = await admin.schema('agent').from('agent_evaluations').upsert({
      project_id: run.project_id,
      agent_run_id: run.id,
      evaluator_type: `USER_FEEDBACK:${user.id}`,
      evaluator_version: '1.0',
      score,
      dimensions: {
        usefulness: score,
        evaluator: 'USER',
      },
      feedback: {
        text: feedbackText || null,
        user_id: user.id,
      },
    }, { onConflict: 'agent_run_id,evaluator_type,evaluator_version' })
      .select('id,score,evaluator_type,evaluator_version,created_at')
      .single()
    if (evaluationError || !evaluation) throw new Error(`Unable to persist agent evaluation: ${evaluationError?.message ?? 'unknown error'}`)

    await writeGovernanceAudit({
      projectId: run.project_id,
      actorUserId: user.id,
      actorType: 'USER',
      eventType: 'AGENT_RUN_USER_EVALUATED',
      entityType: 'AGENT_RUN',
      entityId: run.id,
      metadata: { evaluation_id: evaluation.id, score, feedback_supplied: Boolean(feedbackText) },
    })

    return NextResponse.json({ evaluation })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to evaluate agent run.' }, { status: 500 })
  }
}
