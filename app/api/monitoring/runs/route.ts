import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { filterAuthorizedExecutionRuns } from '@/lib/governance/resource-authorization'
import { MONITORING_RUN_WINDOW } from '@/lib/monitoring/run-window'

export async function GET() {
  try {
    const user = await requireApiUser()
    const admin = createAdminClient()
    const { data: runs, error: runsError } = await admin.schema('agent').from('agent_runs')
      .select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message')
      .order('created_at', { ascending: false })
      .limit(MONITORING_RUN_WINDOW)
    if (runsError) throw new Error(`Unable to load agent runs: ${runsError.message}`)

    const visibleRuns = await filterAuthorizedExecutionRuns(user.id, runs ?? [])
    const runIds = visibleRuns.map(run => run.id)
    const datasetIds = [...new Set(visibleRuns.flatMap(run => run.dataset_id ? [run.dataset_id] : []))]
    const projectIds = [...new Set(visibleRuns.map(run => run.project_id))]

    const [stepsResult, datasetsResult, projectsResult] = await Promise.all([
      runIds.length
        ? admin.schema('agent').from('agent_run_steps')
            .select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message')
            .in('agent_run_id', runIds)
            .order('step_order')
        : Promise.resolve({ data: [], error: null }),
      datasetIds.length
        ? admin.schema('catalog').from('datasets').select('id, project_id, name, business_domain').in('id', datasetIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length
        ? admin.schema('app').from('projects').select('id, name, description').in('id', projectIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (stepsResult.error) throw new Error(`Unable to load agent run steps: ${stepsResult.error.message}`)
    if (datasetsResult.error) throw new Error(`Unable to load monitoring datasets: ${datasetsResult.error.message}`)
    if (projectsResult.error) throw new Error(`Unable to load monitoring projects: ${projectsResult.error.message}`)

    return NextResponse.json({
      runs: visibleRuns,
      steps: stepsResult.data ?? [],
      datasets: datasetsResult.data ?? [],
      projects: projectsResult.data ?? [],
    })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load monitoring data.' }, { status: 500 })
  }
}
