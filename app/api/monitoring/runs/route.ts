import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { filterAuthorizedExecutionRuns } from '@/lib/governance/resource-authorization'

export async function GET() {
  try {
    const user = await requireApiUser()
    const admin = createAdminClient()
    const { data: runs, error: runsError } = await admin.schema('agent').from('agent_runs')
      .select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message')
      .order('created_at', { ascending: false })
      .limit(50)
    if (runsError) throw new Error(`Unable to load agent runs: ${runsError.message}`)

    const visibleRuns = await filterAuthorizedExecutionRuns(user.id, runs ?? [])
    const runIds = visibleRuns.map(run => run.id)
    const { data: steps, error: stepsError } = runIds.length
      ? await admin.schema('agent').from('agent_run_steps')
          .select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message')
          .in('agent_run_id', runIds)
          .order('step_order')
      : { data: [], error: null }
    if (stepsError) throw new Error(`Unable to load agent run steps: ${stepsError.message}`)

    return NextResponse.json({ runs: visibleRuns, steps: steps ?? [] })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load monitoring data.' }, { status: 500 })
  }
}
