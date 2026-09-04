import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

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

    const { data: definitions, error: definitionError } = await admin
      .schema('governance')
      .from('workflow_definitions')
      .select('id,version')
      .eq('project_id', analysis.project_id)
      .eq('workflow_key', 'LINEAGE_CHANGE_APPROVAL')
      .eq('entity_type', 'LINEAGE_IMPACT_ANALYSIS')

    if (definitionError) throw new Error(`Unable to resolve lineage approval definitions: ${definitionError.message}`)
    const definitionIds = (definitions ?? []).map((definition) => definition.id)
    if (!definitionIds.length) return NextResponse.json({ approval: null })

    const { data: instance, error: instanceError } = await admin
      .schema('governance')
      .from('workflow_instances')
      .select('id,workflow_definition_id,status,current_step,context,started_at,completed_at')
      .eq('project_id', analysis.project_id)
      .eq('entity_type', 'LINEAGE_IMPACT_ANALYSIS')
      .eq('entity_id', analysis.id)
      .in('workflow_definition_id', definitionIds)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (instanceError) throw new Error(`Unable to load lineage approval status: ${instanceError.message}`)
    if (!instance) return NextResponse.json({ approval: null })

    const version = (definitions ?? []).find((definition) => definition.id === instance.workflow_definition_id)?.version ?? null
    return NextResponse.json({
      approval: {
        instanceId: instance.id,
        status: instance.status,
        currentStep: instance.current_step,
        workflowVersion: version,
        startedAt: instance.started_at,
        completedAt: instance.completed_at,
        productionMutationPerformed: false,
      },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load lineage approval status.' }, { status: 500 })
  }
}
