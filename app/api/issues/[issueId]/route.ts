import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { scheduleRemediationVerificationFromIssue } from '@/lib/profiling/remediation-reprofile'
import { scheduleFreshDataQualityVerificationFromIssue } from '@/lib/data-quality/remediation-reprofile'
import { verifyObservabilityIncidentResponseFromIssue } from '@/lib/observability/incident-response-verification'

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
    const wasResolved = ['RESOLVED', 'CLOSED'].includes(issue.status)
    const resolvingNow = !wasResolved && ['RESOLVED', 'CLOSED'].includes(status)

    let isProfilingRemediation = false
    let isDataQualityRemediation = false
    let isObservabilityResponse = false
    if (resolvingNow) {
      if (issue.profile_run_id) {
        const { data: profilingOutcome, error: profilingOutcomeError } = await admin
          .schema('governance')
          .from('profiling_remediation_outcomes')
          .select('id')
          .eq('project_id', issue.project_id)
          .eq('source_profile_run_id', issue.profile_run_id)
          .contains('remediation_issue_ids', [issueId])
          .limit(1)
          .maybeSingle()
        if (profilingOutcomeError) throw new Error(`Unable to validate profiling remediation issue: ${profilingOutcomeError.message}`)
        isProfilingRemediation = Boolean(profilingOutcome)
      }

      const { data: dqOutcome, error: dqOutcomeError } = await admin
        .schema('governance')
        .from('data_quality_remediation_outcomes')
        .select('id')
        .eq('project_id', issue.project_id)
        .contains('remediation_issue_ids', [issueId])
        .limit(1)
        .maybeSingle()
      if (dqOutcomeError) throw new Error(`Unable to validate data quality remediation issue: ${dqOutcomeError.message}`)
      isDataQualityRemediation = Boolean(dqOutcome)

      const { data: observabilityIncident, error: observabilityIncidentError } = await admin
        .schema('governance')
        .from('observability_incidents')
        .select('id')
        .eq('project_id', issue.project_id)
        .contains('evidence', { remediation_issue_ids: [issueId] })
        .limit(1)
        .maybeSingle()
      if (observabilityIncidentError) throw new Error(`Unable to validate observability response issue: ${observabilityIncidentError.message}`)
      isObservabilityResponse = Boolean(observabilityIncident)
    }

    const governedRemediation = isProfilingRemediation || isDataQualityRemediation || isObservabilityResponse
    const resolutionSummary = typeof body.resolutionSummary === 'string' ? body.resolutionSummary.trim() : ''
    if (governedRemediation && !resolutionSummary) {
      return NextResponse.json({
        error: 'Resolution evidence is required before a governed remediation issue can be resolved.',
        code: 'REMEDIATION_RESOLUTION_EVIDENCE_REQUIRED',
      }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      status,
    }
    if (body.ownerUserId !== undefined) updates.owner_user_id = body.ownerUserId || null
    if (body.dueAt !== undefined) updates.due_at = body.dueAt || null
    if (typeof body.title === 'string') updates.title = body.title.trim()
    if (typeof body.description === 'string') updates.description = body.description.trim() || null
    if (typeof body.severity === 'string') updates.severity = body.severity.toUpperCase()
    if (typeof body.resolutionSummary === 'string') updates.resolution_summary = resolutionSummary || null
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
      metadata: {
        status,
        profiling_remediation: isProfilingRemediation,
        data_quality_remediation: isDataQualityRemediation,
        observability_response: isObservabilityResponse,
        resolution_summary_present: Boolean(data.resolution_summary),
      },
    })

    let verificationScheduling: Record<string, unknown> | null = null
    if (['RESOLVED', 'CLOSED'].includes(status)) {
      try {
        const dataQualityScheduling = await scheduleFreshDataQualityVerificationFromIssue({
          issueId,
          projectId: issue.project_id,
          userId: user.id,
        })

        if (dataQualityScheduling.status !== 'NOT_DATA_QUALITY_REMEDIATION') {
          verificationScheduling = { ...dataQualityScheduling, mode: 'DATA_QUALITY_FRESH_PROFILE' }
        } else if (data.profile_run_id) {
          verificationScheduling = {
            ...(await scheduleRemediationVerificationFromIssue({
              issueId,
              projectId: issue.project_id,
              sourceProfileRunId: data.profile_run_id,
              userId: user.id,
            })),
            mode: 'PROFILING',
          }
        } else {
          const observabilityVerification = await verifyObservabilityIncidentResponseFromIssue({
            issueId,
            projectId: issue.project_id,
            actorUserId: user.id,
          })
          if (observabilityVerification.status !== 'NOT_OBSERVABILITY_RESPONSE') {
            verificationScheduling = { ...observabilityVerification, mode: 'OBSERVABILITY_RESPONSE' }
          }
        }
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
