import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { scheduleRemediationVerificationFromIssue } from '@/lib/profiling/remediation-reprofile'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
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
    const { data: outcome, error: outcomeError } = await admin
      .schema('governance')
      .from('profiling_remediation_outcomes')
      .select('project_id,workflow_instance_id,source_profile_run_id,verification_profile_run_id,verification_agent_run_id,verification_job_id,remediation_issue_ids,status,outcome')
      .eq('workflow_instance_id', workflowInstanceId)
      .maybeSingle()

    if (outcomeError) throw new Error(`Unable to load remediation outcome: ${outcomeError.message}`)
    if (!outcome) return NextResponse.json({ error: 'Profiling remediation outcome not found.' }, { status: 404 })

    await authorizeProject(user.id, outcome.project_id, 'issues.manage')

    const issueIds = Array.isArray(outcome.remediation_issue_ids)
      ? outcome.remediation_issue_ids.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    if (!issueIds.length) {
      return NextResponse.json({ error: 'No tracked remediation issues exist for this workflow.' }, { status: 409 })
    }

    const { data: trackedIssues, error: trackedIssuesError } = await admin
      .schema('governance')
      .from('issues')
      .select('id,status')
      .in('id', issueIds)
    if (trackedIssuesError) throw new Error(`Unable to resolve tracked remediation issues: ${trackedIssuesError.message}`)

    const unresolvedIssueIds = (trackedIssues ?? [])
      .filter((issue) => !['RESOLVED', 'CLOSED'].includes(text(issue.status).toUpperCase()))
      .map((issue) => issue.id)
    const missingIssueIds = issueIds.filter((issueId) => !(trackedIssues ?? []).some((issue) => issue.id === issueId))
    if (unresolvedIssueIds.length || missingIssueIds.length) {
      return NextResponse.json({
        error: 'All tracked remediation issues must be resolved before verification can be queued.',
        status: 'WAITING_FOR_REMEDIATION',
        workflowInstanceId,
        unresolvedIssueIds: [...unresolvedIssueIds, ...missingIssueIds],
      }, { status: 409 })
    }

    if (['VERIFIED', 'VERIFICATION_FAILED'].includes(outcome.status)) {
      return NextResponse.json({
        status: 'ALREADY_QUEUED',
        workflowInstanceId,
        profilingRunId: outcome.verification_profile_run_id,
        agentRunId: outcome.verification_agent_run_id,
        durableJobId: outcome.verification_job_id,
        terminalOutcome: outcome.status,
      })
    }

    if (outcome.verification_job_id) {
      const { data: linkedJob, error: linkedJobError } = await admin
        .schema('orchestration')
        .from('job_queue')
        .select('id,status,attempts,max_attempts')
        .eq('id', outcome.verification_job_id)
        .eq('project_id', outcome.project_id)
        .maybeSingle()
      if (linkedJobError) throw new Error(`Unable to resolve linked verification job: ${linkedJobError.message}`)
      if (!linkedJob) throw new Error('Linked verification job no longer exists.')

      const priorOutcome = object(outcome.outcome)
      const retryable = priorOutcome.verification_retryable === true
      const canRequeueLinkedJob = linkedJob.status === 'DEAD' || (linkedJob.status === 'SUCCEEDED' && retryable)

      if (!canRequeueLinkedJob) {
        return NextResponse.json({
          status: 'ALREADY_QUEUED',
          workflowInstanceId,
          profilingRunId: outcome.verification_profile_run_id,
          agentRunId: outcome.verification_agent_run_id,
          durableJobId: linkedJob.id,
          durableJobStatus: linkedJob.status,
        })
      }

      const now = new Date().toISOString()
      const { error: requeueError } = await admin
        .schema('orchestration')
        .from('job_queue')
        .update({
          status: 'QUEUED',
          attempts: 0,
          available_at: now,
          lease_owner: null,
          lease_expires_at: null,
          last_error: null,
          completed_at: null,
          updated_at: now,
        })
        .eq('id', linkedJob.id)
        .in('status', ['DEAD', 'SUCCEEDED'])
      if (requeueError) throw new Error(`Unable to requeue verification job: ${requeueError.message}`)

      const { error: outcomeUpdateError } = await admin
        .schema('governance')
        .from('profiling_remediation_outcomes')
        .update({
          status: 'VERIFICATION_QUEUED',
          verification_requested_at: now,
          verification_requested_by: user.id,
          updated_at: now,
          verified_at: null,
          outcome: {
            ...priorOutcome,
            verification_retryable: false,
            verification_retry_requested_at: now,
            verification_queue_phase: 'MANUAL_RETRY_QUEUED',
          },
        })
        .eq('workflow_instance_id', workflowInstanceId)
      if (outcomeUpdateError) throw new Error(`Unable to persist verification retry state: ${outcomeUpdateError.message}`)

      await writeGovernanceAudit({
        projectId: outcome.project_id,
        actorUserId: user.id,
        eventType: 'PROFILING_REMEDIATION_REPROFILE_RETRY_QUEUED',
        entityType: 'PROFILE_RUN',
        entityId: outcome.verification_profile_run_id ?? outcome.source_profile_run_id,
        correlationId: workflowInstanceId,
        metadata: {
          workflow_instance_id: workflowInstanceId,
          verification_profile_run_id: outcome.verification_profile_run_id,
          verification_agent_run_id: outcome.verification_agent_run_id,
          verification_job_id: linkedJob.id,
          prior_job_status: linkedJob.status,
          prior_attempts: linkedJob.attempts,
          max_attempts: linkedJob.max_attempts,
        },
      })

      return NextResponse.json({
        status: 'QUEUED',
        workflowInstanceId,
        profilingRunId: outcome.verification_profile_run_id,
        agentRunId: outcome.verification_agent_run_id,
        durableJobId: linkedJob.id,
        retry: true,
      }, { status: 202 })
    }

    const scheduling = await scheduleRemediationVerificationFromIssue({
      issueId: issueIds[0],
      projectId: outcome.project_id,
      sourceProfileRunId: outcome.source_profile_run_id,
      userId: user.id,
    })

    if (scheduling.status === 'NOT_REMEDIATION') {
      return NextResponse.json({ error: 'Tracked remediation registry could not be resolved.', ...scheduling }, { status: 409 })
    }
    if (scheduling.status === 'WAITING_FOR_REMEDIATION') {
      return NextResponse.json({ error: 'All tracked remediation issues must be resolved before verification can be queued.', ...scheduling }, { status: 409 })
    }

    return NextResponse.json(scheduling, { status: scheduling.status === 'QUEUED' ? 202 : 200 })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to retry automatic profiling verification.',
    }, { status: 500 })
  }
}
