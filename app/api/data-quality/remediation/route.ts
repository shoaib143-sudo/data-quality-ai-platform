import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function uuidList(value: unknown) { return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [] }

function severity(priority: unknown) {
  const value = text(priority).toUpperCase()
  if (value === 'CRITICAL') return 'CRITICAL'
  if (value === 'HIGH') return 'HIGH'
  if (value === 'LOW') return 'LOW'
  return 'MEDIUM'
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const workflowInstanceId = text(body.workflowInstanceId)
    if (!workflowInstanceId) return NextResponse.json({ error: 'workflowInstanceId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: instance, error: instanceError } = await admin
      .schema('governance')
      .from('workflow_instances')
      .select('id,project_id,entity_type,entity_id,status,context')
      .eq('id', workflowInstanceId)
      .maybeSingle()
    if (instanceError) throw new Error(`Unable to load data quality workflow: ${instanceError.message}`)
    if (!instance) return NextResponse.json({ error: 'Workflow instance not found.' }, { status: 404 })
    if (instance.entity_type !== 'DATA_QUALITY_RUN') return NextResponse.json({ error: 'Workflow is not a data quality remediation approval.' }, { status: 409 })
    if (instance.status !== 'APPROVED') return NextResponse.json({ error: 'Data quality remediation requires an approved workflow.' }, { status: 409 })

    await authorizeProject(user.id, instance.project_id, 'issues.manage')

    const { data: investigation, error: investigationError } = await admin
      .schema('governance')
      .from('data_quality_investigations')
      .select('id,agent_run_id,dataset_id,dataset_version_id,profile_run_id,recommendations,summary,severity,status')
      .eq('workflow_instance_id', workflowInstanceId)
      .maybeSingle()
    if (investigationError) throw new Error(`Unable to load data quality investigation: ${investigationError.message}`)
    if (!investigation) return NextResponse.json({ error: 'Data quality investigation not found for workflow.' }, { status: 409 })

    const { data: existingOutcome, error: existingOutcomeError } = await admin
      .schema('governance')
      .from('data_quality_remediation_outcomes')
      .select('id,status,execution_mode,production_mutation_performed,remediation_issue_ids,verification_agent_run_id')
      .eq('workflow_instance_id', workflowInstanceId)
      .maybeSingle()
    if (existingOutcomeError) throw new Error(`Unable to resolve existing data quality remediation outcome: ${existingOutcomeError.message}`)
    if (existingOutcome) {
      const ids = uuidList(existingOutcome.remediation_issue_ids)
      const { data: issues, error: issuesError } = ids.length
        ? await admin.schema('governance').from('issues').select('id,title,status,severity,quality_rule_run_id').in('id', ids)
        : { data: [], error: null }
      if (issuesError) throw new Error(`Unable to resolve existing data quality remediation issues: ${issuesError.message}`)
      return NextResponse.json({
        workflowInstanceId,
        investigationId: investigation.id,
        remediationOutcomeId: existingOutcome.id,
        status: existingOutcome.status,
        executionMode: existingOutcome.execution_mode,
        productionMutationPerformed: existingOutcome.production_mutation_performed === true,
        verificationAgentRunId: existingOutcome.verification_agent_run_id,
        created: [],
        reused: issues ?? [],
        reusedOutcome: true,
      })
    }

    const context = object(instance.context)
    const recommendations = Array.isArray(investigation.recommendations) ? investigation.recommendations.map(object) : []
    const created: Array<Record<string, unknown>> = []
    const reused: Array<Record<string, unknown>> = []

    for (const recommendation of recommendations) {
      const action = text(recommendation.action) || 'investigate_failed_quality_control'
      const rationale = text(recommendation.rationale) || investigation.summary
      const runIds = uuidList(recommendation.quality_rule_run_ids)
      const primaryRunId = runIds[0] || null
      const title = `Data quality remediation: ${action}`

      let existingQuery = admin.schema('governance').from('issues').select('id,title,status,severity,quality_rule_run_id').eq('project_id', instance.project_id).eq('title', title)
      existingQuery = primaryRunId ? existingQuery.eq('quality_rule_run_id', primaryRunId) : existingQuery.eq('dataset_id', investigation.dataset_id)
      const { data: existing, error: existingError } = await existingQuery.order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existingError) throw new Error(`Unable to resolve existing data quality remediation issue: ${existingError.message}`)
      if (existing) {
        reused.push(existing)
        continue
      }

      const { data: issue, error: issueError } = await admin
        .schema('governance')
        .from('issues')
        .insert({
          project_id: instance.project_id,
          dataset_id: investigation.dataset_id,
          dataset_version_id: investigation.dataset_version_id,
          profile_run_id: investigation.profile_run_id,
          quality_rule_run_id: primaryRunId,
          title,
          description: [
            rationale,
            `Source data quality run: ${investigation.agent_run_id}`,
            `Source workflow: ${workflowInstanceId}`,
            runIds.length ? `Affected quality rule runs: ${runIds.join(', ')}` : '',
          ].filter(Boolean).join('\n\n'),
          severity: severity(recommendation.priority),
          status: 'OPEN',
          created_by: user.id,
        })
        .select('id,title,status,severity,quality_rule_run_id')
        .single()
      if (issueError || !issue) throw new Error(`Unable to create data quality remediation issue: ${issueError?.message ?? 'unknown error'}`)
      created.push(issue)

      await writeGovernanceAudit({
        projectId: instance.project_id,
        actorUserId: user.id,
        eventType: 'DATA_QUALITY_REMEDIATION_ISSUE_CREATED',
        entityType: 'ISSUE',
        entityId: issue.id,
        correlationId: workflowInstanceId,
        metadata: { investigation_id: investigation.id, data_quality_agent_run_id: investigation.agent_run_id, recommendation_action: action, quality_rule_run_ids: runIds },
      })
    }

    const issueIds = [...created, ...reused].map((item) => text(item.id)).filter(Boolean)
    const { data: outcome, error: outcomeError } = await admin
      .schema('governance')
      .from('data_quality_remediation_outcomes')
      .insert({
        project_id: instance.project_id,
        workflow_instance_id: workflowInstanceId,
        investigation_id: investigation.id,
        source_agent_run_id: investigation.agent_run_id,
        status: 'ACTION_TRACKED',
        execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
        production_mutation_performed: false,
        remediation_issue_ids: issueIds,
        created_by: user.id,
        outcome: {
          recommendation_count: recommendations.length,
          created_issue_count: created.length,
          reused_issue_count: reused.length,
          source_context: context.source ?? 'DATA_QUALITY_INVESTIGATION',
        },
        updated_at: new Date().toISOString(),
      })
      .select('id,status')
      .single()
    if (outcomeError || !outcome) throw new Error(`Unable to persist data quality remediation outcome: ${outcomeError?.message ?? 'unknown error'}`)

    const learningRows = recommendations.map((recommendation) => ({
      project_id: instance.project_id,
      workflow_instance_id: workflowInstanceId,
      remediation_outcome_id: outcome.id,
      source_agent_run_id: investigation.agent_run_id,
      recommendation_action: text(recommendation.action) || 'investigate_failed_quality_control',
      priority: text(recommendation.priority) || null,
      rationale: text(recommendation.rationale) || null,
      quality_rule_run_ids: uuidList(recommendation.quality_rule_run_ids),
      status: 'PENDING',
      effective: null,
      evidence: { remediation_issue_ids: issueIds, execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY' },
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }))
    if (learningRows.length) {
      const { error: learningError } = await admin.schema('governance').from('data_quality_recommendation_learning').insert(learningRows)
      if (learningError && learningError.code !== '23505') throw new Error(`Unable to seed data quality recommendation learning: ${learningError.message}`)
    }

    await admin.schema('governance').from('data_quality_investigations').update({ status: 'REMEDIATION_TRACKED', updated_at: new Date().toISOString() }).eq('id', investigation.id)

    await writeGovernanceAudit({
      projectId: instance.project_id,
      actorUserId: user.id,
      eventType: 'DATA_QUALITY_REMEDIATION_EXECUTED',
      entityType: 'DATA_QUALITY_RUN',
      entityId: investigation.agent_run_id,
      correlationId: workflowInstanceId,
      metadata: {
        investigation_id: investigation.id,
        remediation_outcome_id: outcome.id,
        created_issue_ids: created.map((item) => item.id),
        reused_issue_ids: reused.map((item) => item.id),
        execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
        production_mutation_performed: false,
      },
    })

    return NextResponse.json({
      workflowInstanceId,
      investigationId: investigation.id,
      remediationOutcomeId: outcome.id,
      status: outcome.status,
      executionMode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
      productionMutationPerformed: false,
      created,
      reused,
      reusedOutcome: false,
    }, { status: created.length ? 201 : 200 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to execute data quality remediation.' }, { status: 500 })
  }
}
