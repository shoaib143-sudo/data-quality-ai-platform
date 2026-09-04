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

function number(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const workflowInstanceId = text(body.workflowInstanceId)
    let verificationProfileRunId = text(body.verificationProfileRunId)

    if (!workflowInstanceId) {
      return NextResponse.json({ error: 'workflowInstanceId is required.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: instance, error: instanceError } = await admin
      .schema('governance')
      .from('workflow_instances')
      .select('id,project_id,entity_type,entity_id,status,context')
      .eq('id', workflowInstanceId)
      .maybeSingle()

    if (instanceError) throw new Error(`Unable to load workflow instance: ${instanceError.message}`)
    if (!instance) return NextResponse.json({ error: 'Workflow instance not found.' }, { status: 404 })
    if (instance.entity_type !== 'PROFILE_RUN' || instance.status !== 'APPROVED') {
      return NextResponse.json({ error: 'An approved profiling remediation workflow is required.' }, { status: 409 })
    }

    await authorizeProject(user.id, instance.project_id, 'quality.read')

    const context = object(instance.context)
    if (context.source !== 'PROFILING_INVESTIGATION') {
      return NextResponse.json({ error: 'Workflow does not contain profiling investigation evidence.' }, { status: 409 })
    }

    const sourceProfileRunId = text(context.profile_run_id) || instance.entity_id
    const sourceDatasetId = text(context.dataset_id)
    if (!sourceDatasetId) {
      return NextResponse.json({ error: 'Workflow is missing the source dataset identifier.' }, { status: 409 })
    }

    const { data: sourceRun, error: sourceRunError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .select('id,completed_at')
      .eq('id', sourceProfileRunId)
      .maybeSingle()

    if (sourceRunError) throw new Error(`Unable to load source profiling run: ${sourceRunError.message}`)
    if (!sourceRun?.completed_at) {
      return NextResponse.json({ error: 'Source profiling run is not complete.' }, { status: 409 })
    }

    if (!verificationProfileRunId) {
      const { data: versions, error: versionsError } = await admin
        .schema('catalog')
        .from('dataset_versions')
        .select('id')
        .eq('dataset_id', sourceDatasetId)

      if (versionsError) throw new Error(`Unable to resolve dataset versions: ${versionsError.message}`)
      const versionIds = (versions ?? []).map((version) => version.id)
      if (!versionIds.length) {
        return NextResponse.json({ error: 'No dataset versions are available for verification.' }, { status: 409 })
      }

      const { data: latestRun, error: latestRunError } = await admin
        .schema('profiling')
        .from('profile_runs')
        .select('id,dataset_version_id,status,completed_at')
        .in('dataset_version_id', versionIds)
        .eq('status', 'COMPLETED')
        .neq('id', sourceProfileRunId)
        .gt('completed_at', sourceRun.completed_at)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestRunError) throw new Error(`Unable to locate verification profiling run: ${latestRunError.message}`)
      if (!latestRun) {
        return NextResponse.json({
          error: 'No completed post-remediation profiling run is available yet.',
          code: 'VERIFICATION_PROFILE_PENDING',
          sourceProfileRunId,
        }, { status: 409 })
      }
      verificationProfileRunId = latestRun.id
    }

    const { data: verificationRun, error: verificationRunError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .select('id,dataset_version_id,status,completed_at')
      .eq('id', verificationProfileRunId)
      .maybeSingle()

    if (verificationRunError) throw new Error(`Unable to load verification profiling run: ${verificationRunError.message}`)
    if (!verificationRun) return NextResponse.json({ error: 'Verification profiling run not found.' }, { status: 404 })
    if (verificationRun.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Verification profiling run must be completed.' }, { status: 409 })
    }
    if (!verificationRun.completed_at || verificationRun.completed_at <= sourceRun.completed_at) {
      return NextResponse.json({ error: 'Verification profiling run must complete after the source profiling run.' }, { status: 409 })
    }

    const { data: verificationVersion, error: verificationVersionError } = await admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id,dataset_id')
      .eq('id', verificationRun.dataset_version_id)
      .maybeSingle()

    if (verificationVersionError) throw new Error(`Unable to resolve verification dataset version: ${verificationVersionError.message}`)
    if (!verificationVersion || verificationVersion.dataset_id !== sourceDatasetId) {
      return NextResponse.json({
        error: 'Verification profiling run must belong to the same dataset as the approved remediation.',
      }, { status: 409 })
    }

    const [sourceScoreResult, verificationScoreResult, sourceFindingsResult, verificationFindingsResult, issuesResult] = await Promise.all([
      admin.schema('profiling').from('data_quality_scores').select('overall_score').eq('profile_run_id', sourceProfileRunId).maybeSingle(),
      admin.schema('profiling').from('data_quality_scores').select('overall_score').eq('profile_run_id', verificationProfileRunId).maybeSingle(),
      admin.schema('profiling').from('profile_findings').select('id,severity').eq('profile_run_id', sourceProfileRunId),
      admin.schema('profiling').from('profile_findings').select('id,severity').eq('profile_run_id', verificationProfileRunId),
      admin.schema('governance').from('issues').select('id,status,title').eq('project_id', instance.project_id).eq('profile_run_id', sourceProfileRunId).like('title', 'Profiling remediation:%'),
    ])

    for (const result of [sourceScoreResult, verificationScoreResult, sourceFindingsResult, verificationFindingsResult, issuesResult]) {
      if (result.error) throw new Error(result.error.message)
    }

    const sourceScore = number(sourceScoreResult.data?.overall_score)
    const verificationScore = number(verificationScoreResult.data?.overall_score)
    if (verificationScore === null) {
      return NextResponse.json({ error: 'Verification profiling run has no overall quality score.' }, { status: 409 })
    }

    const severe = (rows: Array<{ severity?: unknown }> | null) => (rows ?? [])
      .filter((row) => ['HIGH', 'CRITICAL'].includes(text(row.severity).toUpperCase()))
      .length

    const sourceHighSeverityFindings = severe(sourceFindingsResult.data)
    const verificationHighSeverityFindings = severe(verificationFindingsResult.data)
    const issues = issuesResult.data ?? []
    const unresolvedIssues = issues.filter((issue) => !['RESOLVED', 'CLOSED'].includes(text(issue.status).toUpperCase()))

    const qualityNotWorse = sourceScore === null || verificationScore >= sourceScore
    const severeFindingsNotWorse = verificationHighSeverityFindings <= sourceHighSeverityFindings
    const allTrackedIssuesResolved = issues.length > 0 && unresolvedIssues.length === 0
    const verificationPassed = qualityNotWorse && severeFindingsNotWorse && allTrackedIssuesResolved
    const qualityDelta = sourceScore === null ? null : verificationScore - sourceScore
    const severeFindingsDelta = verificationHighSeverityFindings - sourceHighSeverityFindings

    const checks = {
      quality_not_worse: { passed: qualityNotWorse, before: sourceScore, after: verificationScore, delta: qualityDelta },
      high_severity_findings_not_worse: { passed: severeFindingsNotWorse, before: sourceHighSeverityFindings, after: verificationHighSeverityFindings, delta: severeFindingsDelta },
      tracked_remediation_issues_resolved: { passed: allTrackedIssuesResolved, total: issues.length, unresolved: unresolvedIssues.length },
    }

    const result = {
      workflowInstanceId,
      sourceProfileRunId,
      verificationProfileRunId,
      verificationPassed,
      checks,
    }

    const { data: outcome, error: outcomeError } = await admin
      .schema('governance')
      .from('profiling_remediation_outcomes')
      .upsert({
        project_id: instance.project_id,
        workflow_instance_id: workflowInstanceId,
        source_profile_run_id: sourceProfileRunId,
        verification_profile_run_id: verificationProfileRunId,
        status: verificationPassed ? 'VERIFIED' : 'VERIFICATION_FAILED',
        source_quality_score: sourceScore,
        verification_quality_score: verificationScore,
        quality_score_delta: qualityDelta,
        source_high_severity_findings: sourceHighSeverityFindings,
        verification_high_severity_findings: verificationHighSeverityFindings,
        high_severity_findings_delta: severeFindingsDelta,
        remediation_issue_ids: issues.map((issue) => issue.id),
        checks,
        outcome: {
          verification_passed: verificationPassed,
          recommendation_effective: verificationPassed && (qualityDelta === null || qualityDelta >= 0) && severeFindingsDelta <= 0,
        },
        created_by: user.id,
        updated_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
      }, { onConflict: 'workflow_instance_id' })
      .select('id,status,quality_score_delta,high_severity_findings_delta')
      .single()

    if (outcomeError || !outcome) {
      throw new Error(`Unable to persist verification outcome: ${outcomeError?.message ?? 'unknown error'}`)
    }

    await writeGovernanceAudit({
      projectId: instance.project_id,
      actorUserId: user.id,
      eventType: verificationPassed ? 'PROFILING_REMEDIATION_VERIFIED' : 'PROFILING_REMEDIATION_VERIFICATION_FAILED',
      entityType: 'PROFILE_RUN',
      entityId: verificationProfileRunId,
      metadata: { ...result, remediation_outcome_id: outcome.id },
    })

    return NextResponse.json({ ...result, remediationOutcome: outcome }, { status: verificationPassed ? 200 : 409 })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to verify profiling remediation.',
    }, { status: 500 })
  }
}
