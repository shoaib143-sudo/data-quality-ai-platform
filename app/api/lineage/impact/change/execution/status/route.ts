import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const { searchParams } = new URL(request.url)
    const analysisId = text(searchParams.get('analysisId'))
    if (!analysisId) return NextResponse.json({ error: 'analysisId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: analysis, error: analysisError } = await admin
      .schema('governance')
      .from('lineage_impact_analyses')
      .select('id,project_id')
      .eq('id', analysisId)
      .maybeSingle()
    if (analysisError) throw new Error(`Unable to load lineage impact analysis: ${analysisError.message}`)
    if (!analysis) return NextResponse.json({ error: 'Lineage impact analysis not found.' }, { status: 404 })

    await authorizeProject(user.id, analysis.project_id, 'lineage.read')

    const { data: executionRequest, error: executionError } = await admin
      .schema('governance')
      .from('lineage_change_execution_requests')
      .select('id,authorization_id,workflow_instance_id,execution_target,execution_reference,status,executor_id,claimed_at,completed_at,execution_result,authorized_at,created_at,updated_at')
      .eq('project_id', analysis.project_id)
      .eq('analysis_id', analysis.id)
      .order('authorized_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (executionError) throw new Error(`Unable to load lineage execution handoff: ${executionError.message}`)

    return NextResponse.json({
      executionRequest: executionRequest ? {
        id: executionRequest.id,
        authorizationId: executionRequest.authorization_id,
        workflowInstanceId: executionRequest.workflow_instance_id,
        executionTarget: executionRequest.execution_target,
        executionReference: executionRequest.execution_reference,
        status: executionRequest.status,
        executorId: executionRequest.executor_id,
        claimedAt: executionRequest.claimed_at,
        completedAt: executionRequest.completed_at,
        executionResult: executionRequest.execution_result,
        authorizedAt: executionRequest.authorized_at,
        createdAt: executionRequest.created_at,
        updatedAt: executionRequest.updated_at,
        productionMutationPerformedByLineage: false,
      } : null,
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load lineage execution handoff.' }, { status: 500 })
  }
}
