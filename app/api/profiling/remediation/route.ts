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

function uuidList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => text(item)).filter(Boolean)
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

    const { data: existingOutcome, error: existingOutcomeError } = await admin
      .schema('governance')
      .from('profiling_remediation_outcomes')
      .select('id,status,execution_mode,production_mutation_performed,remediation_issue_ids,verification_profile_run_id,verification_agent_run_id,verification_job_id')
      .eq('workflow_instance_id', workflowInstanceId)
      .maybeSingle()
    if (existingOutcomeError) throw new Error(`Unable to resolve existing remediation outcome: ${existingOutcomeError.message}`)

    if (existingOutcome) {
      const issueIds = uuidList(existingOutcome.remediation_issue_ids)
      const { data: existingIssues, error: existingIssuesError } = issueIds.length
        ? await admin.schema('governance').from('issues').select('id,title,status,severity').in('id', issueIds)
        : { data: [], error: null }
      if (existingIssuesError) throw new Error(`Unable to resolve existing remediation issues: ${existingIssuesError.message}`)

      const { data: existingLearning, error: existingLearningError } = await admin
        .schema('governance')
        .from('profiling_recommendation_learning')
        .select('recommendation_action,status,effective')
        .eq('workflow_instance_id', workflowInstanceId)
      if (existingLearningError) throw new Error(`Unable to resolve existing recommendation learning evidence: ${existingLearningError.message}`)

      return NextResponse.json({
        workflowInstanceId,
        profileRunId,
        remediationOutcomeId: existingOutcome.id,
        remediationStatus: existingOutcome.status,
        executionMode: existingOutcome.execution_mode ?? 'TRACKED_GOVERNANCE_ISSUES_ONLY',
        productionMutationPerformed: existingOutcome.production_mutation_performed === true,
        learningActions: (existingLearning ?? []).map((row) => row.recommendation_action),
        verificationProfileRunId: existingOutcome.verification_profile_run_id,
        verificationAgentRunId: existingOutcome.verification_agent_run_id,
        verificationJobId: existingOutcome.verification_job_id,
        created: [],
        reused: existingIssues ?? [],
        reusedOutcome: true,
      })
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
      .insert({
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
      })
      .select('id,status,remediation_issue_ids')
      .single()

    if (outcomeError || !outcome) {
      if (outcomeError?.code === '23505') {
        const { data: racedOutcome, error: racedOutcomeError } = await admin
          .schema('governance')
          .from('profiling_remediation_outcomes')
          .select('id,status,remediation_issue_ids')
          .eq('workflow_instance_id', workflowInstanceId)
          .single()
        if (racedOutcomeError || !racedOutcome) throw new Error(`Unable to resolve concurrent remediation outcome: ${racedOutcomeError?.message ?? 'unknown error'}`)
        return NextResponse.json({
          workflowInstanceId,
          profileRunId,
          remediationOutcomeId: racedOutcome.id,
          remediationStatus: racedOutcome.status,
          executionMode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
          productionMutationPerformed: false,
          created: [],
          reused: [...created, ...reused],
          reusedOutcome: true,
        })
      }
      throw new Error(`Unable to persist remediation outcome: ${outcomeError?.message ?? 'unknown error'}`)
    }

    const distinctRecommendations = new Map<string, Record<string, unknown>>()
    for (const item of recommendations) {
      const recommendation = object(item)
      const action = text(recommendation.action) || 'governed_remediation_review'
      if (!distinctRecommendations.has(action)) distinctRecommendations.set(action, recommendation)
    }

    const learningRows = [...distinctRecommendations.entries()].map(([action, recommendation]) => ({
      project_id: instance.project_id,
      workflow_instance_id: workflowInstanceId,
      remediation_outcome_id: outcome.id,
      source_profile_run_id: profileRunId,
      recommendation_action: action,
      priority: text(recommendation.priority) || null,
      rationale: text(recommendation.rationale) || null,
      finding_ids: uuidList(recommendation.finding_ids),
      status: 'PENDING',
      effective: null,
      evidence: {
        dataset_id: datasetId,
        dataset_version_id: datasetVersionId,
        execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
        remediation_issue_ids: issueIds,
      },
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }))

    if (learningRows.length) {
      const { error: learningError } = await admin
        .schema('governance')
        .from('profiling_recommendation_learning')
        .insert(learningRows)

      if (learningError && learningError.code !== '23505') {
        throw new Error(`Unable to seed recommendation learning evidence: ${learningError.message}`)
      }
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
        learning_actions: learningRows.map((row) => row.recommendation_action),
        execution_mode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
        production_mutation_performed: false,
      },
    })

    return NextResponse.json({
      workflowInstanceId,
      profileRunId,
      remediationOutcomeId: outcome.id,
      remediationStatus: outcome.status,
      executionMode: 'TRACKED_GOVERNANCE_ISSUES_ONLY',
      productionMutationPerformed: false,
      learningActions: learningRows.map((row) => row.recommendation_action),
      created,
      reused,
      reusedOutcome: false,
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
