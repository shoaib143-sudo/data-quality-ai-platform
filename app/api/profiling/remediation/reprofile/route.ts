import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleRemediationVerificationFromIssue } from '@/lib/profiling/remediation-reprofile'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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
      .select('project_id,workflow_instance_id,source_profile_run_id,remediation_issue_ids,status')
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
