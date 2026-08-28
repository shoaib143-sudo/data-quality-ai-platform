import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const user = await requireUser()
    const { runId } = await context.params
    if (!runId) return NextResponse.json({ error: 'runId is required.' }, { status: 400 })

    const supabase = await createClient()
    const { data: run, error: runError } = await supabase
      .schema('agent')
      .from('agent_runs')
      .select('id, project_id')
      .eq('id', runId)
      .single()
    if (runError || !run) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })

    const { data: membership } = await supabase
      .schema('catalog')
      .from('project_members')
      .select('project_id')
      .eq('project_id', run.project_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    const url = new URL(request.url)
    const level = url.searchParams.get('level')
    const { data, error } = await supabase
      .schema('agent')
      .from('agent_run_logs')
      .select('id, agent_run_id, agent_run_step_id, level, event_type, message, details, created_at')
      .eq('agent_run_id', runId)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)

    const logs = level ? (data ?? []).filter((entry) => entry.level === level) : (data ?? [])
    return NextResponse.json({ runId, logs })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load logs.' }, { status: 500 })
  }
}
