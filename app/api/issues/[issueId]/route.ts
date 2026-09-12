import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { assertIssueOwnerBelongsToProjectOrganization, IssueReferenceIntegrityError } from '@/lib/governance/issue-reference-integrity'
import {
  deriveIssueResolutionMutation,
  effectiveResolutionSummary,
  requiresGovernedResolutionEvidence,
  shouldCompensateVerificationSchedulingFailure,
} from '@/lib/governance/incident-resolution-integrity'
import { scheduleRemediationVerificationFromIssue } from '@/lib/profiling/remediation-reprofile'
import { scheduleFreshDataQualityVerificationFromIssue } from '@/lib/data-quality/remediation-reprofile'
import { verifyObservabilityIncidentResponseFromIssue } from '@/lib/observability/incident-response-verification'

const ISSUE_STATUSES = new Set(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED'])
const ISSUE_SEVERITIES = new Set(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

export async function PATCH(request: Request, { params }: { params: Promise<{ issueId: string }> }) {
  try {
    const user = await requireApiUser()
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
    if (!ISSUE_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid issue status.', code: 'ISSUE_STATUS_INVALID' }, { status: 400 })
    }
    if (typeof body.severity === 'string' && !ISSUE_SEVERITIES.has(body.severity.toUpperCase())) {
      return NextResponse.json({ error: 'Invalid issue severity.', code: 'ISSUE_SEVERITY_INVALID' }, { status: 400 })
    }
    if (body.ownerUserId !== undefined) {
      await assertIssueOwnerBelongsToProjectOrganization(issue.project_id, body.ownerUserId)
    }

    const mutationAt = new Date().toISOString()
    const resolutionMutation = deriveIssueResolutionMutation({
      previousStatus: issue.status,
      nextStatus: status,
      previousResolvedAt: issue.resolved_at ?? null,
      now: mutationAt,
    })

    let isProfilingRemediation = false
    let isDataQualityRemediation = false
    let isObservabilityResponse = false

    // Validate the governed-remediation relationship for every resulting terminal
    // state, not only the first transition to RESOLVED/CLOSED. This prevents a
    // later PATCH from deleting mandatory resolution evidence.
    if (resolutionMutation.willBeResolved) {
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
    const resolutionSummaryProvided = Object.prototype.hasOwnProperty.call(body, 'resolutionSummary')
    const resolutionSummary = effectiveResolutionSummary(issue.resolution_summary, body.resolutionSummary, resolutionSummaryProvided)
    if (requiresGovernedResolutionEvidence({
      governedRemediation,
      nextStatus: status,
      effectiveSummary: resolutionSummary,
    })) {
      return NextResponse.json({
        error: 'Resolution evidence is required while a governed remediation issue is resolved.',
        code: 'REMEDIATION_RESOLUTION_EVIDENCE_REQUIRED',
      }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updated_at: mutationAt,
      status,
      resolved_at: resolutionMutation.resolvedAt,
    }
    if (body.ownerUserId !== undefined) updates.owner_user_id = body.ownerUserId || null
    if (body.dueAt !== undefined) updates.due_at = body.dueAt || null
    if (typeof body.title === 'string') updates.title = body.title.trim()
    if (typeof body.description === 'string') updates.description = body.description.trim() || null
    if (typeof body.severity === 'string') updates.severity = body.severity.toUpperCase()
    if (resolutionSummaryProvided && typeof body.resolutionSummary === 'string') updates.resolution_summary = resolutionSummary || null
    if (body.resolutionEvidence && typeof body.resolutionEvidence === 'object') updates.resolution_evidence = body.resolutionEvidence

    const { data, error } = await admin.schema('governance').from('issues').update(updates).eq('id', issueId).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await writeGovernanceAudit({
      projectId: issue.project_id,
      actorUserId: user.id,
      eventType: `ISSUE_${status}`,
      entityType: 'ISSUE',
      entityId: issueId,
      metadata: {
        status,
        reopened: resolutionMutation.reopeningNow,
        profiling_remediation: isProfilingRemediation,
        data_quality_remediation: isDataQualityRemediation,
        observability_response: isObservabilityResponse,
        resolution_summary_present: Boolean(data.resolution_summary),
      },
    })

    let verificationScheduling: Record<string, unknown> | null = null
    if (resolutionMutation.willBeResolved) {
      try {
        const dataQualityScheduling = await scheduleFreshDataQualityVerificationFromIssue({ issueId, projectId: issue.project_id, userId: user.id })
        if (dataQualityScheduling.status !== 'NOT_DATA_QUALITY_REMEDIATION') {
          verificationScheduling = { ...dataQualityScheduling, mode: 'DATA_QUALITY_FRESH_PROFILE' }
        } else if (data.profile_run_id) {
          verificationScheduling = {
            ...(await scheduleRemediationVerificationFromIssue({ issueId, projectId: issue.project_id, sourceProfileRunId: data.profile_run_id, userId: user.id })),
            mode: 'PROFILING',
          }
        } else {
          const observabilityVerification = await verifyObservabilityIncidentResponseFromIssue({ issueId, projectId: issue.project_id, actorUserId: user.id })
          if (observabilityVerification.status !== 'NOT_OBSERVABILITY_RESPONSE') verificationScheduling = { ...observabilityVerification, mode: 'OBSERVABILITY_RESPONSE' }
        }
      } catch (verificationError) {
        const verificationErrorMessage = verificationError instanceof Error
          ? verificationError.message
          : 'Automatic remediation verification scheduling failed.'
        verificationScheduling = {
          status: 'QUEUE_FAILED',
          error: verificationErrorMessage,
        }

        if (shouldCompensateVerificationSchedulingFailure({
          governedRemediation,
          resolvingNow: resolutionMutation.resolvingNow,
        })) {
          // Scheduling requires the issue to be terminal first. If scheduling then
          // fails, compensate only the status/timestamp and preserve the submitted
          // remediation evidence. Optimistic updated_at matching prevents us from
          // overwriting a concurrent mutation.
          const rollbackAt = new Date().toISOString()
          const { data: rollback, error: rollbackError } = await admin.schema('governance').from('issues')
            .update({
              status: issue.status,
              resolved_at: issue.resolved_at ?? null,
              updated_at: rollbackAt,
            })
            .eq('id', issueId)
            .eq('status', status)
            .eq('updated_at', data.updated_at)
            .select('*')
            .maybeSingle()

          const rollbackApplied = !rollbackError && Boolean(rollback)
          await writeGovernanceAudit({
            projectId: issue.project_id,
            actorUserId: user.id,
            eventType: 'ISSUE_RESOLUTION_VERIFICATION_SCHEDULING_FAILED',
            entityType: 'ISSUE',
            entityId: issueId,
            metadata: {
              attempted_status: status,
              restored_status: rollbackApplied ? issue.status : null,
              rollback_applied: rollbackApplied,
              concurrent_state_detected: !rollbackApplied && !rollbackError,
              rollback_error: rollbackError?.message ?? null,
              verification_error: verificationErrorMessage,
              resolution_evidence_preserved: true,
            },
          })

          if (!rollbackApplied) {
            return NextResponse.json({
              error: 'Governed verification scheduling failed and the issue changed concurrently; no rollback was forced.',
              code: 'REMEDIATION_VERIFICATION_SCHEDULING_CONCURRENT_STATE',
              verificationScheduling,
              resolutionRolledBack: false,
            }, { status: 409 })
          }

          return NextResponse.json({
            error: 'Resolution was not committed because governed verification could not be scheduled.',
            code: 'REMEDIATION_VERIFICATION_SCHEDULING_FAILED',
            issue: rollback,
            verificationScheduling,
            resolutionRolledBack: true,
          }, { status: 503 })
        }
      }
    }

    return NextResponse.json({ issue: data, verificationScheduling })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof IssueReferenceIntegrityError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update issue.' }, { status: 500 })
  }
}
