import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'

const ACTIVE_RUN_STATUSES = ['CREATED', 'RUNNING', 'QUEUED', 'WAITING']

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const user = await requireUser()
    const { runId } = await context.params
    if (!runId) return NextResponse.json({ error: 'runId is required.' }, { status: 400 })

    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: run, error: runError } = await admin
      .schema('agent')
      .from('agent_runs')
      .select('id, project_id, status')
      .eq('id', runId)
      .single()

    if (runError || !run) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })

    const { data: membership, error: membershipError } = await supabase
      .schema('catalog')
      .from('project_members')
      .select('project_id')
      .eq('project_id', run.project_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    if (!ACTIVE_RUN_STATUSES.includes(run.status)) {
      return NextResponse.json({ error: `Run is already ${String(run.status).toLowerCase()}.` }, { status: 409 })
    }

    const now = new Date().toISOString()
    const message = `Terminated by ${user.email ?? 'the authenticated user'} from Job Monitor.`

    const { data: cancelledRun, error: cancelError } = await admin
      .schema('agent')
      .from('agent_runs')
      .update({
        status: 'CANCELLED',
        cancel_requested_at: now,
        cancelled_at: now,
        cancelled_by: user.id,
        cancellation_reason: 'MANUAL_MONITOR_TERMINATION',
        error_code: 'TERMINATED_BY_USER',
        error_message: message,
        completed_at: now,
      })
      .eq('id', runId)
      .in('status', ACTIVE_RUN_STATUSES)
      .select('id, status, completed_at')
      .maybeSingle()

    if (cancelError) throw new Error(`Unable to terminate agent run: ${cancelError.message}`)
    if (!cancelledRun) return NextResponse.json({ error: 'Run changed state before termination could be applied.' }, { status: 409 })

    await admin
      .schema('agent')
      .from('agent_run_steps')
      .update({
        status: 'SKIPPED',
        error_code: 'TERMINATED_BY_USER',
        error_message: message,
        completed_at: now,
      })
      .eq('agent_run_id', runId)
      .in('status', ['PENDING', 'RUNNING', 'RETRYING'])

    await admin
      .schema('profiling')
      .from('profile_runs')
      .update({
        status: 'CANCELLED',
        error_code: 'TERMINATED_BY_USER',
        error_message: message,
        completed_at: now,
      })
      .eq('agent_run_id', runId)
      .in('status', ['CREATED', 'RUNNING', 'QUEUED', 'WAITING'])

    return NextResponse.json({
      runId,
      status: 'CANCELLED',
      terminatedAt: now,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to terminate agent run.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
