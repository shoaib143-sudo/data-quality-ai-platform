import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { scheduleRemediationVerificationFromIssue } from '@/lib/profiling/remediation-reprofile'

export async function PATCH(request: Request, { params }: { params: Promise<{ issueId: string }> }) {
  try {
    const user = await requireUser()
    const { issueId } = await params
    const admin = createAdminClient()

    const { data: issue, error: issueError } = await admin
      .schema('governance')
      .from('issues')
      .select('*')
      .eq('id', issueId)
      .maybeSingle()
    if (issueError) throw new Error(`Unable to load governance issue: ${issueError.message}`)
    if (!issue) return NextResponse.json({ error: 'Issue not found.' }, { status: 404 })

    await authorizeProject(user.id, issue.project_id, 'issues.manage')

    const body = await request.json()
    const status = typeof body.status === 'string' ? body.status.toUpperCase() : issue.status
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      status,
    }
    if (body.ownerUserId !== undefined) updates.owner_user_id = body.ownerUserId || null
    if (body.dueAt !== undefined) updates.due_at = body.dueAt || null
    if (typeof body.title === 'string') updates.title = body.title.trim()
    if (typeof body.description === 'string') updates.description = body.description.trim() || null
    if (typeof body.severity === 'string') updates.severity = body.severity.toUpperCase()
    if (typeof body.resolutionSummary === 'string') updates.resolution_summary = body.resolutionSummary.trim() || null
    if (body.resolutionEvidence && typeof body.resolutionEvidence === 'object') updates.resolution_evidence = body.resolutionEvidence
    if (['RESOLVED', 'CLOSED'].includes(status)) updates.resolved_at = new Date().toISOString()

    const { data, error } = await admin
      .schema('governance')
      .from('issues')
      .update(updates)
      .eq('id', issueId)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await writeGovernanceAudit({
      projectId: issue.project_id,
      actorUserId: user.id,
      eventType: `ISSUE_${status}`,
      entityType: 'ISSUE',
      entityId: issueId,
      metadata: { status },
    })

    let verificationScheduling: Record<string, unknown> | null = null
    if (['RESOLVED', 'CLOSED'].includes(status) && data.profile_run_id) {
      try {
        verificationScheduling = await scheduleRemediationVerificationFromIssue({
          issueId,
          projectId: issue.project_id,
          sourceProfileRunId: data.profile_run_id,
          userId: user.id,
        })
      } catch (verificationError) {
        verificationScheduling = {
          status: 'QUEUE_FAILED',
          error: verificationError instanceof Error ? verificationError.message : 'Automatic remediation verification scheduling failed.',
        }
      }
    }

    return NextResponse.json({ issue: data, verificationScheduling })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to update issue.',
    }, { status: 500 })
  }
}
