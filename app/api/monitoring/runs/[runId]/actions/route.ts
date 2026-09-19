import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeAgentAction } from '@/lib/governance/agent-authorization'
import { resolveJobMonitorRunActions } from '@/lib/monitoring/run-actions'

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireApiUser()
    const { runId } = await context.params
    if (!runId) return NextResponse.json({ error: 'runId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: run, error } = await admin.schema('agent').from('agent_runs')
      .select('id,project_id,dataset_id,status')
      .eq('id', runId)
      .maybeSingle()
    if (error) throw new Error(`Unable to resolve run actions: ${error.message}`)
    if (!run) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })

    try {
      await authorizeAgentAction(
        user.id,
        'execution.view',
        run.dataset_id
          ? { type: 'DATASET', projectId: run.project_id, datasetId: run.dataset_id }
          : { type: 'PROJECT', projectId: run.project_id },
      )
    } catch {
      return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })
    }

    const actions = await resolveJobMonitorRunActions(user.id, run)
    return NextResponse.json({ runId: run.id, status: run.status, actions }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to resolve run actions.' }, { status: 500 })
  }
}
