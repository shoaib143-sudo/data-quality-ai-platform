import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const analysisId = text(body.analysisId)
    if (!analysisId) return NextResponse.json({ error: 'analysisId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: analysis, error: analysisError } = await admin.schema('governance').from('lineage_impact_analyses')
      .select('id,project_id,root_asset_type,root_asset_id,root_asset_name,trigger_type,direction,affected_count,critical_affected_count,risk_score,confidence,summary,evidence')
      .eq('id', analysisId)
      .maybeSingle()
    if (analysisError) throw new Error(`Unable to load lineage impact analysis: ${analysisError.message}`)
    if (!analysis) return NextResponse.json({ error: 'Lineage impact analysis not found.' }, { status: 404 })

    await authorizeProject(user.id, analysis.project_id, 'workflow.manage')
    const evidence = object(analysis.evidence)
    const proposedChange = object(evidence.proposed_change)
    if (proposedChange.approval_required !== true || text(proposedChange.decision) !== 'APPROVAL_REQUIRED') {
      return NextResponse.json({ error: 'This proposed change does not require governed approval.' }, { status: 409 })
    }

    const workflowKey = 'LINEAGE_CHANGE_APPROVAL'
    const entityType = 'LINEAGE_IMPACT_ANALYSIS'
    let { data: definition, error: definitionError } = await admin.schema('governance').from('workflow_definitions')
      .select('id,workflow_key,entity_type,version,enabled')
      .eq('project_id', analysis.project_id)
      .eq('workflow_key', workflowKey)
      .eq('entity_type', entityType)
      .eq('enabled', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (definitionError) throw new Error(`Unable to resolve lineage change approval workflow: ${definitionError.message}`)

    let autoProvisioned = false
    if (!definition) {
      const { data: created, error: createError } = await admin.schema('governance').from('workflow_definitions').insert({
        project_id: analysis.project_id,
        workflow_key: workflowKey,
        name: 'Lineage change impact approval',
        entity_type: entityType,
        version: 1,
        steps: [{
          index: 0,
          name: 'Governed change approval',
          capability: 'policy.approve',
          description: 'Review the proposed change, downstream blast radius, critical/certified dependencies and evidence confidence before deployment.',
        }],
        enabled: true,
        created_by: user.id,
      }).select('id,workflow_key,entity_type,version,enabled').single()

      if (createError || !created) {
        const { data: raced, error: racedError } = await admin.schema('governance').from('workflow_definitions')
          .select('id,workflow_key,entity_type,version,enabled')
          .eq('project_id', analysis.project_id)
          .eq('workflow_key', workflowKey)
          .eq('entity_type', entityType)
          .eq('enabled', true)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (racedError || !raced) throw new Error(`Unable to provision lineage change approval workflow: ${createError?.message ?? racedError?.message ?? 'unknown error'}`)
        definition = raced
      } else {
        definition = created
        autoProvisioned = true
        await writeGovernanceAudit({
          projectId: analysis.project_id,
          actorUserId: user.id,
          eventType: 'WORKFLOW_DEFINITION_CREATED',
          entityType: 'WORKFLOW_DEFINITION',
          entityId: created.id,
          metadata: { workflow_key: workflowKey, entity_type: entityType, version: created.version, source: 'LINEAGE_CHANGE_APPROVAL_AUTO_PROVISION' },
        })
      }
    }

    const { data: existing, error: existingError } = await admin.schema('governance').from('workflow_instances')
      .select('id,status,current_step')
      .eq('workflow_definition_id', definition.id)
      .eq('entity_type', entityType)
      .eq('entity_id', analysis.id)
      .in('status', ['RUNNING', 'APPROVED'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingError) throw new Error(`Unable to check existing lineage change approval: ${existingError.message}`)
    if (existing) return NextResponse.json({ instanceId: existing.id, status: existing.status, currentStep: existing.current_step, reused: true, autoProvisioned })

    const context = {
      source: 'LINEAGE_PROPOSED_CHANGE_ASSESSMENT',
      analysis_id: analysis.id,
      dataset_id: analysis.root_asset_id,
      dataset_name: analysis.root_asset_name,
      change_type: proposedChange.change_type ?? null,
      change_summary: proposedChange.change_summary ?? null,
      affected_columns: Array.isArray(proposedChange.affected_columns) ? proposedChange.affected_columns : [],
      risk_score: analysis.risk_score,
      confidence: analysis.confidence,
      affected_count: analysis.affected_count,
      critical_affected_count: analysis.critical_affected_count,
      certified_affected_count: proposedChange.certified_affected_count ?? 0,
      business_impact: proposedChange.business_impact ?? null,
      business_context: Array.isArray(proposedChange.business_context) ? proposedChange.business_context : [],
      production_mutation_performed: false,
    }

    const { data: instanceId, error: startError } = await admin.schema('governance').rpc('start_workflow', {
      p_definition_id: definition.id,
      p_entity_type: entityType,
      p_entity_id: analysis.id,
      p_started_by: user.id,
      p_context: context,
    })
    if (startError || !instanceId) throw new Error(`Unable to start lineage change approval workflow: ${startError?.message ?? 'unknown error'}`)

    await writeGovernanceAudit({
      projectId: analysis.project_id,
      actorUserId: user.id,
      eventType: 'LINEAGE_CHANGE_APPROVAL_STARTED',
      entityType: entityType,
      entityId: analysis.id,
      correlationId: instanceId,
      metadata: { workflow_instance_id: instanceId, workflow_definition_id: definition.id, change_type: proposedChange.change_type ?? null, risk_score: analysis.risk_score, confidence: analysis.confidence, production_mutation_performed: false, auto_provisioned_definition: autoProvisioned },
    })

    return NextResponse.json({ instanceId, status: 'RUNNING', reused: false, autoProvisioned }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start lineage change approval.' }, { status: 500 })
  }
}
