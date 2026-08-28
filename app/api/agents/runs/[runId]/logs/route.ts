import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const user = await requireUser()
    const { runId } = await context.params
    if (!runId) return NextResponse.json({ error: 'runId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: run, error: runError } = await admin
      .schema('agent')
      .from('agent_runs')
      .select('id, project_id')
      .eq('id', runId)
      .single()
    if (runError || !run) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })

    const { data: project, error: projectError } = await admin
      .schema('app')
      .from('projects')
      .select('id, organization_id')
      .eq('id', run.project_id)
      .single()
    if (projectError || !project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })

    const { data: membership, error: membershipError } = await admin
      .schema('app')
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', project.organization_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (membershipError) throw new Error(`Unable to verify project access: ${membershipError.message}`)
    if (!membership) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    const url = new URL(request.url)
    const level = url.searchParams.get('level')
    const { data, error } = await admin
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