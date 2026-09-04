import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function issueSeverity(value: unknown) {
  const priority = text(value).toUpperCase()
  if (priority === 'CRITICAL') return 'CRITICAL'
  if (priority === 'HIGH') return 'HIGH'
  if (priority === 'LOW') return 'LOW'
  return 'MEDIUM'
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const workflowInstanceId = text(body.workflowInstanceId)
    if (!workflowInstanceId) return NextResponse.json({ error: 'workflowInstanceId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: instance, error: instanceError } = await admin.schema('governance').from('workflow_instances')
      .select('id,project_id,entity_type,entity_id,status,context')
      .eq('id', workflowInstanceId).maybeSingle()
    if (instanceError) throw new Error(`Unable to load observability workflow: ${instanceError.message}`)
    if (!instance) return NextResponse.json({ error: 'Workflow instance not found.' }, { status: 404 })
    if (instance.entity_type !== 'OBSERVABILITY_INCIDENT') return NextResponse.json({ error: 'Workflow is not an observability incident response approval.' }, { status: 409 })
    if (instance.status !== 'APPROVED') return NextResponse.json({ error: 'Observability incident response requires an approved workflow.' }, { status: 409 })

    await authorizeProject(user.id, instance.project_id, 'issues.manage')

    const { data: incident, error: incidentError } = await admin.schema('governance').from('observability_incidents')
      .select('id,project_id,dataset_id,status,severity,title,summary,recommendations,workflow_instance_id,evidence')
      .eq('id', instance.entity_id).maybeSingle()
    if (incidentError) throw new Error(`Unable to load observability incident: ${incidentError.message}`)
    if (!incident) return NextResponse.json({ error: 'Observability incident not found.' }, { status: 404 })
    if (incident.workflow_instance_id && incident.workflow_instance_id !== workflowInstanceId) return NextResponse.json({ error: 'Incident is linked to a different approval workflow.' }, { status: 409 })

    const recommendations = Array.isArray(incident.recommendations) ? incident.recommendations.map(object) : []
    if (!recommendations.length) return NextResponse.json({ error: 'Incident contains no response recommendations.' }, { status: 409 })

    const created: Array<Record<string, unknown>> = []
    const reused: Array<Record<string, unknown>> = []
    for (const recommendation of recommendations) {
      const action = text(recommendation.action) || 'investigate_observability_incident'
      const rationale = text(recommendation.rationale) || incident.summary
      const title = `Observability response: ${action}`
      const { data: existing, error: existingError } = await admin.schema('governance').from('issues')
        .select('id,title,status,severity')
        .eq('project_id', incident.project_id)
        .eq('dataset_id', incident.dataset_id)
        .eq('title', title)
        .in('status', ['OPEN','TRIAGED','IN_PROGRESS','BLOCKED'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existingError) throw new Error(`Unable to check observability response issue: ${existingError.message}`)
      if (existing) { reused.push(existing); continue }

      const { data: issue, error: issueError } = await admin.schema('governance').from('issues').insert({
        project_id: incident.project_id,
        dataset_id: incident.dataset_id,
        title,
        description: [
          rationale,
          `Source incident: ${incident.id}`,
          `Source workflow: ${workflowInstanceId}`,
          'Execution mode: tracked governance response only. No production source mutation was performed.',
        ].join('\n\n'),
        severity: issueSeverity(recommendation.priority ?? incident.severity),
        status: 'OPEN',
        created_by: user.id,
      }).select('id,title,status,severity').single()
      if (issueError || !issue) throw new Error(`Unable to create observability response issue: ${issueError?.message ?? 'unknown error'}`)
      created.push(issue)
      await writeGovernanceAudit({
        projectId: incident.project_id,
        actorUserId: user.id,
        eventType: 'OBSERVABILITY_RESPONSE_ISSUE_CREATED',
        entityType: 'ISSUE',
        entityId: issue.id,
        correlationId: workflowInstanceId,
        metadata: { incident_id: incident.id, recommendation_action: action, execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY', production_mutation_performed: false },
      })
    }

    const now = new Date().toISOString()
    const { error: updateError } = await admin.schema('governance').from('observability_incidents').update({
      status: 'MITIGATING',
      updated_at: now,
      evidence: {
        ...object(incident.evidence),
        remediation_issue_ids: [...created, ...reused].map((item) => item.id),
        execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
        production_mutation_performed: false,
      },
    }).eq('id', incident.id)
    if (updateError) throw new Error(`Unable to update observability incident response state: ${updateError.message}`)

    await writeGovernanceAudit({
      projectId: incident.project_id,
      actorUserId: user.id,
      eventType: 'OBSERVABILITY_INCIDENT_RESPONSE_TRACKED',
      entityType: 'OBSERVABILITY_INCIDENT',
      entityId: incident.id,
      correlationId: workflowInstanceId,
      metadata: {
        created_issue_ids: created.map((item) => item.id),
        reused_issue_ids: reused.map((item) => item.id),
        execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
        production_mutation_performed: false,
      },
    })

    return NextResponse.json({
      incidentId: incident.id,
      workflowInstanceId,
      status: 'MITIGATING',
      executionMode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
      productionMutationPerformed: false,
      created,
      reused,
    }, { status: created.length ? 201 : 200 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to execute observability incident response.' }, { status: 500 })
  }
}
