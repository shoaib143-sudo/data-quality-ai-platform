import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function issueSeverity(priority: unknown) {
  const value = text(priority).toUpperCase()
  return value === 'CRITICAL' || value === 'HIGH' ? 'HIGH' : value === 'LOW' ? 'LOW' : 'MEDIUM'
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const workflowInstanceId = text(body.workflowInstanceId)

    if (!workflowInstanceId) {
      return NextResponse.json({ error: 'workflowInstanceId is required.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: instance, error: instanceError } = await admin
      .schema('governance')
      .from('workflow_instances')
      .select('id,project_id,workflow_definition_id,entity_type,entity_id,status,context')
      .eq('id', workflowInstanceId)
      .maybeSingle()

    if (instanceError) throw new Error(`Unable to load workflow instance: ${instanceError.message}`)
    if (!instance) return NextResponse.json({ error: 'Workflow instance not found.' }, { status: 404 })
    if (instance.entity_type !== 'PROFILE_RUN') {
      return NextResponse.json({ error: 'Workflow instance is not a profiling remediation approval.' }, { status: 409 })
    }
    if (instance.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Profiling remediation requires an approved workflow.' }, { status: 409 })
    }

    await authorizeProject(user.id, instance.project_id, 'issues.manage')

    const context = object(instance.context)
    if (context.source !== 'PROFILING_INVESTIGATION') {
      return NextResponse.json({ error: 'Workflow does not contain profiling investigation evidence.' }, { status: 409 })
    }

    const profileRunId = text(context.profile_run_id) || instance.entity_id
    const datasetId = text(context.dataset_id) || null
    const datasetVersionId = text(context.dataset_version_id) || null
    const datasetName = text(context.dataset_name) || 'dataset'
    const recommendations = Array.isArray(context.recommendations) ? context.recommendations : []

    if (!recommendations.length) {
      return NextResponse.json({ error: 'Approved workflow contains no actionable recommendations.' }, { status: 409 })
    }

    const created: Array<Record<string, unknown>> = []
    const reused: Array<Record<string, unknown>> = []

    for (const item of recommendations) {
      const recommendation = object(item)
      const action = text(recommendation.action) || 'governed_remediation_review'
      const rationale = text(recommendation.rationale) || 'Approved profiling remediation recommendation.'
      const title = `Profiling remediation: ${action}`

      const { data: existing, error: existingError } = await admin
        .schema('governance')
        .from('issues')
        .select('id,title,status,severity')
        .eq('project_id', instance.project_id)
        .eq('profile_run_id', profileRunId)
        .eq('title', title)
        .in('status', ['OPEN', 'IN_PROGRESS'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingError) throw new Error(`Unable to check remediation issue: ${existingError.message}`)
      if (existing) {
        reused.push(existing)
        continue
      }

      const description = [
        `Approved remediation recommendation for ${datasetName}.`,
        rationale,
        `Source workflow: ${workflowInstanceId}`,
        `Source profiling run: ${profileRunId}`,
      ].join('\n\n')

      const { data: issue, error: issueError } = await admin
        .schema('governance')
        .from('issues')
        .insert({
          project_id: instance.project_id,
          dataset_id: datasetId,
          dataset_version_id: datasetVersionId,
          profile_run_id: profileRunId,
          title,
          description,
          severity: issueSeverity(recommendation.priority),
          status: 'OPEN',
          created_by: user.id,
        })
        .select('id,title,status,severity')
        .single()

      if (issueError || !issue) {
        throw new Error(`Unable to create remediation issue: ${issueError?.message ?? 'unknown error'}`)
      }

      created.push(issue)
      await writeGovernanceAudit({
        projectId: instance.project_id,
        actorUserId: user.id,
        eventType: 'PROFILING_REMEDIATION_ISSUE_CREATED',
        entityType: 'ISSUE',
        entityId: issue.id,
        metadata: {
          workflow_instance_id: workflowInstanceId,
          profile_run_id: profileRunId,
          dataset_id: datasetId,
          dataset_version_id: datasetVersionId,
          recommendation_action: action,
        },
      })
    }

    const issueIds = [...created, ...reused]
      .map((issue) => text(issue.id))
      .filter(Boolean)

    const { data: outcome, error: outcomeError } = await admin
      .schema('governance')
      .from('profiling_remediation_outcomes')
      .upsert({
        project_id: instance.project_id,
        workflow_instance_id: workflowInstanceId,
        source_profile_run_id: profileRunId,
        status: 'ACTION_TRACKED',
        execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
        production_mutation_performed: false,
        remediation_issue_ids: issueIds,
        created_by: user.id,
        updated_at: new Date().toISOString(),
        outcome: {
          recommendation_count: recommendations.length,
          created_issue_count: created.length,
          reused_issue_count: reused.length,
        },
      }, { onConflict: 'workflow_instance_id' })
      .select('id,status,remediation_issue_ids')
      .single()

    if (outcomeError || !outcome) {
      throw new Error(`Unable to persist remediation outcome: ${outcomeError?.message ?? 'unknown error'}`)
    }

    await writeGovernanceAudit({
      projectId: instance.project_id,
      actorUserId: user.id,
      eventType: 'PROFILING_REMEDIATION_EXECUTED',
      entityType: 'PROFILE_RUN',
      entityId: profileRunId,
      metadata: {
        workflow_instance_id: workflowInstanceId,
        remediation_outcome_id: outcome.id,
        created_issue_ids: created.map((issue) => issue.id),
        reused_issue_ids: reused.map((issue) => issue.id),
        execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
        production_mutation_performed: false,
      },
    })

    return NextResponse.json({
      workflowInstanceId,
      profileRunId,
      remediationOutcomeId: outcome.id,
      executionMode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
      productionMutationPerformed: false,
      created,
      reused,
    }, { status: created.length ? 201 : 200 })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to execute profiling remediation.',
    }, { status: 500 })
  }
}
