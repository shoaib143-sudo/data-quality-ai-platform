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

export async function verifyRemediationOutcome(input: {
  workflowInstanceId: string
  verificationProfileRunId: string
  actorUserId: string
  verificationSource: 'AUTOMATIC_WORKER' | 'API_LINKED' | 'API_EXPLICIT' | 'API_FALLBACK'
}) {
  const admin = createAdminClient()

  const { data: instance, error: instanceError } = await admin
    .schema('governance')
    .from('workflow_instances')
    .select('id,project_id,entity_type,entity_id,status,context')
    .eq('id', input.workflowInstanceId)
    .maybeSingle()
  if (instanceError) throw new Error(`Unable to load workflow instance: ${instanceError.message}`)
  if (!instance) throw new Error('Workflow instance not found.')
  if (instance.entity_type !== 'PROFILE_RUN' || instance.status !== 'APPROVED') {
    throw new Error('An approved profiling remediation workflow is required.')
  }

  const context = object(instance.context)
  if (context.source !== 'PROFILING_INVESTIGATION') {
    throw new Error('Workflow does not contain profiling investigation evidence.')
  }

  const sourceProfileRunId = text(context.profile_run_id) || instance.entity_id
  const sourceDatasetId = text(context.dataset_id)
  if (!sourceDatasetId) throw new Error('Workflow is missing the source dataset identifier.')

  const [{ data: sourceRun, error: sourceRunError }, { data: verificationRun, error: verificationRunError }] = await Promise.all([
    admin.schema('profiling').from('profile_runs').select('id,completed_at').eq('id', sourceProfileRunId).maybeSingle(),
    admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,completed_at,agent_run_id').eq('id', input.verificationProfileRunId).maybeSingle(),
  ])

  if (sourceRunError || !sourceRun?.completed_at) throw new Error(`Source profiling run is not complete: ${sourceRunError?.message ?? sourceProfileRunId}`)
  if (verificationRunError || !verificationRun) throw new Error(`Verification profiling run not found: ${verificationRunError?.message ?? input.verificationProfileRunId}`)
  if (verificationRun.status !== 'COMPLETED') throw new Error(`Verification profiling run is ${verificationRun.status}.`)
  if (!verificationRun.completed_at || verificationRun.completed_at <= sourceRun.completed_at) {
    throw new Error('Verification profiling run must complete after the source profiling run.')
  }

  const { data: verificationVersion, error: verificationVersionError } = await admin
    .schema('catalog')
    .from('dataset_versions')
    .select('id,dataset_id')
    .eq('id', verificationRun.dataset_version_id)
    .maybeSingle()
  if (verificationVersionError) throw new Error(`Unable to resolve verification dataset version: ${verificationVersionError.message}`)
  if (!verificationVersion || verificationVersion.dataset_id !== sourceDatasetId) {
    throw new Error('Verification profiling run must belong to the same dataset as the approved remediation.')
  }

  const [sourceScoreResult, verificationScoreResult, sourceFindingsResult, verificationFindingsResult, issuesResult, linkedOutcomeResult] = await Promise.all([
    admin.schema('profiling').from('data_quality_scores').select('overall_score').eq('profile_run_id', sourceProfileRunId).maybeSingle(),
    admin.schema('profiling').from('data_quality_scores').select('overall_score').eq('profile_run_id', input.verificationProfileRunId).maybeSingle(),
    admin.schema('profiling').from('profile_findings').select('id,severity').eq('profile_run_id', sourceProfileRunId),
    admin.schema('profiling').from('profile_findings').select('id,severity').eq('profile_run_id', input.verificationProfileRunId),
    admin.schema('governance').from('issues').select('id,status,title').eq('project_id', instance.project_id).eq('profile_run_id', sourceProfileRunId).like('title', 'Profiling remediation:%'),
    admin.schema('governance').from('profiling_remediation_outcomes').select('id,outcome,verification_agent_run_id,verification_job_id').eq('workflow_instance_id', input.workflowInstanceId).maybeSingle(),
  ])

  for (const queryResult of [sourceScoreResult, verificationScoreResult, sourceFindingsResult, verificationFindingsResult, issuesResult, linkedOutcomeResult]) {
    if (queryResult.error) throw new Error(queryResult.error.message)
  }

  const sourceScore = number(sourceScoreResult.data?.overall_score)
  const verificationScore = number(verificationScoreResult.data?.overall_score)
  if (verificationScore === null) throw new Error('Verification profiling run has no overall quality score.')

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
  const recommendationEffective = verificationPassed && (qualityDelta === null || qualityDelta >= 0) && severeFindingsDelta <= 0

  const checks = {
    quality_not_worse: { passed: qualityNotWorse, before: sourceScore, after: verificationScore, delta: qualityDelta },
    high_severity_findings_not_worse: { passed: severeFindingsNotWorse, before: sourceHighSeverityFindings, after: verificationHighSeverityFindings, delta: severeFindingsDelta },
    tracked_remediation_issues_resolved: { passed: allTrackedIssuesResolved, total: issues.length, unresolved: unresolvedIssues.length },
  }

  const priorOutcome = object(linkedOutcomeResult.data?.outcome)
  const { data: outcome, error: outcomeError } = await admin
    .schema('governance')
    .from('profiling_remediation_outcomes')
    .upsert({
      project_id: instance.project_id,
      workflow_instance_id: input.workflowInstanceId,
      source_profile_run_id: sourceProfileRunId,
      verification_profile_run_id: input.verificationProfileRunId,
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
        ...priorOutcome,
        verification_passed: verificationPassed,
        recommendation_effective: recommendationEffective,
        verification_source: input.verificationSource,
      },
      created_by: input.actorUserId,
      updated_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
    }, { onConflict: 'workflow_instance_id' })
    .select('id,status,quality_score_delta,high_severity_findings_delta,verification_profile_run_id,verification_agent_run_id,verification_job_id')
    .single()
  if (outcomeError || !outcome) throw new Error(`Unable to persist verification outcome: ${outcomeError?.message ?? 'unknown error'}`)

  const observedAt = new Date().toISOString()
  const { data: recommendationLearning, error: learningError } = await admin
    .schema('governance')
    .from('profiling_recommendation_learning')
    .update({
      remediation_outcome_id: outcome.id,
      status: recommendationEffective ? 'EFFECTIVE' : 'INEFFECTIVE',
      effective: recommendationEffective,
      quality_score_delta: qualityDelta,
      high_severity_findings_delta: severeFindingsDelta,
      updated_at: observedAt,
      observed_at: observedAt,
    })
    .eq('workflow_instance_id', input.workflowInstanceId)
    .select('id,recommendation_action,status,effective,quality_score_delta,high_severity_findings_delta')
  if (learningError) throw new Error(`Unable to persist recommendation effectiveness: ${learningError.message}`)

  const result = {
    workflowInstanceId: input.workflowInstanceId,
    sourceProfileRunId,
    verificationProfileRunId: input.verificationProfileRunId,
    verificationPassed,
    recommendationEffective,
    checks,
    remediationOutcome: outcome,
    recommendationLearning: recommendationLearning ?? [],
  }

  await writeGovernanceAudit({
    projectId: instance.project_id,
    actorUserId: input.actorUserId,
    actorType: input.verificationSource === 'AUTOMATIC_WORKER' ? 'SYSTEM' : 'USER',
    eventType: verificationPassed ? 'PROFILING_REMEDIATION_VERIFIED' : 'PROFILING_REMEDIATION_VERIFICATION_FAILED',
    entityType: 'PROFILE_RUN',
    entityId: input.verificationProfileRunId,
    correlationId: input.workflowInstanceId,
    metadata: {
      ...result,
      remediation_outcome_id: outcome.id,
      recommendation_learning_ids: (recommendationLearning ?? []).map((row) => row.id),
      verification_agent_run_id: outcome.verification_agent_run_id,
      verification_job_id: outcome.verification_job_id,
      verification_source: input.verificationSource,
    },
  })

  return result
}
