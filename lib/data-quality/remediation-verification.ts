import { createAdminClient } from '@/lib/supabase/admin'
import { queueDataQualityAutomation } from '@/lib/data-quality/queue'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function uuidList(value: unknown) { return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [] }
function severityRank(value: unknown) {
  const ranks: Record<string, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
  return ranks[text(value).toUpperCase()] ?? 0
}

export async function verifyDataQualityRemediation(input: {
  workflowInstanceId: string
  verificationAgentRunId: string
  actorUserId?: string | null
  verificationSource?: string
}) {
  const admin = createAdminClient()
  const actorUserId = input.actorUserId?.trim() || null
  const verificationSource = input.verificationSource?.trim() || 'MANUAL_API'

  const { data: outcome, error: outcomeError } = await admin
    .schema('governance')
    .from('data_quality_remediation_outcomes')
    .select('id,project_id,workflow_instance_id,investigation_id,source_agent_run_id,remediation_issue_ids,status,outcome,checks')
    .eq('workflow_instance_id', input.workflowInstanceId)
    .maybeSingle()
  if (outcomeError || !outcome) throw new Error(`Unable to load data quality remediation outcome: ${outcomeError?.message ?? 'not found'}`)

  const { data: investigation, error: investigationError } = await admin
    .schema('governance')
    .from('data_quality_investigations')
    .select('id,dataset_id,dataset_version_id,profile_run_id,severity')
    .eq('id', outcome.investigation_id)
    .maybeSingle()
  if (investigationError || !investigation) throw new Error(`Unable to load source data quality investigation: ${investigationError?.message ?? 'not found'}`)

  const { data: verificationRun, error: verificationRunError } = await admin
    .schema('agent')
    .from('agent_runs')
    .select('id,project_id,dataset_id,dataset_version_id,status,input,output')
    .eq('id', input.verificationAgentRunId)
    .maybeSingle()
  if (verificationRunError || !verificationRun) throw new Error(`Unable to load verification data quality run: ${verificationRunError?.message ?? 'not found'}`)
  if (verificationRun.status !== 'SUCCEEDED') throw new Error(`Verification data quality run must be successful, received ${verificationRun.status}.`)
  if (verificationRun.project_id !== outcome.project_id || verificationRun.dataset_id !== investigation.dataset_id) throw new Error('Verification run must belong to the same governed dataset and project.')
  if (input.verificationAgentRunId === outcome.source_agent_run_id) throw new Error('Verification must use a new data quality execution.')

  const [{ data: sourceRuns, error: sourceRunsError }, { data: verificationRuns, error: verificationRunsError }] = await Promise.all([
    admin.schema('profiling').from('quality_rule_runs').select('id,rule_definition_id,status').eq('agent_run_id', outcome.source_agent_run_id),
    admin.schema('profiling').from('quality_rule_runs').select('id,rule_definition_id,status').eq('agent_run_id', input.verificationAgentRunId),
  ])
  if (sourceRunsError) throw new Error(`Unable to load source quality outcomes: ${sourceRunsError.message}`)
  if (verificationRunsError) throw new Error(`Unable to load verification quality outcomes: ${verificationRunsError.message}`)

  const ruleIds = [...new Set([...(sourceRuns ?? []), ...(verificationRuns ?? [])].map((row) => row.rule_definition_id))]
  const { data: rules, error: rulesError } = ruleIds.length
    ? await admin.schema('profiling').from('quality_rule_definitions').select('id,severity,name').in('id', ruleIds)
    : { data: [], error: null }
  if (rulesError) throw new Error(`Unable to load data quality rule severity: ${rulesError.message}`)
  const ruleById = new Map((rules ?? []).map((row) => [row.id, row]))

  const sourceFailed = (sourceRuns ?? []).filter((row) => row.status === 'FAILED')
  const verificationFailed = (verificationRuns ?? []).filter((row) => row.status === 'FAILED')
  const sourceSevere = sourceFailed.filter((row) => severityRank(ruleById.get(row.rule_definition_id)?.severity) >= severityRank('HIGH'))
  const verificationSevere = verificationFailed.filter((row) => severityRank(ruleById.get(row.rule_definition_id)?.severity) >= severityRank('HIGH'))

  const issueIds = uuidList(outcome.remediation_issue_ids)
  const { data: issues, error: issuesError } = issueIds.length
    ? await admin.schema('governance').from('issues').select('id,status,resolution_summary,resolution_evidence').in('id', issueIds)
    : { data: [], error: null }
  if (issuesError) throw new Error(`Unable to load data quality remediation issues: ${issuesError.message}`)

  const issuesResolved = issueIds.length > 0 && (issues ?? []).length === issueIds.length && (issues ?? []).every((issue) => ['RESOLVED', 'CLOSED'].includes(issue.status))
  const failureCountNotWorse = verificationFailed.length <= sourceFailed.length
  const severeFailuresNotWorse = verificationSevere.length <= sourceSevere.length
  const materialImprovement = sourceFailed.length === 0 ? verificationFailed.length === 0 : verificationFailed.length < sourceFailed.length || verificationFailed.length === 0
  const verificationPassed = issuesResolved && failureCountNotWorse && severeFailuresNotWorse && materialImprovement

  const checks = {
    tracked_remediation_issues_resolved: { passed: issuesResolved, expected: issueIds.length, resolved: (issues ?? []).filter((issue) => ['RESOLVED', 'CLOSED'].includes(issue.status)).length },
    failed_controls_not_worse: { passed: failureCountNotWorse, source_failed: sourceFailed.length, verification_failed: verificationFailed.length },
    severe_controls_not_worse: { passed: severeFailuresNotWorse, source_high_or_critical: sourceSevere.length, verification_high_or_critical: verificationSevere.length },
    material_improvement: { passed: materialImprovement, source_failed: sourceFailed.length, verification_failed: verificationFailed.length },
  }
  const status = verificationPassed ? 'VERIFIED' : 'VERIFICATION_FAILED'
  const now = new Date().toISOString()

  const { error: updateError } = await admin.schema('governance').from('data_quality_remediation_outcomes').update({
    verification_agent_run_id: input.verificationAgentRunId,
    status,
    checks,
    outcome: {
      verification_passed: verificationPassed,
      verification_source: verificationSource,
      source_failed_rule_count: sourceFailed.length,
      verification_failed_rule_count: verificationFailed.length,
      source_severe_failure_count: sourceSevere.length,
      verification_severe_failure_count: verificationSevere.length,
      issue_ids: issueIds,
    },
    updated_at: now,
    verified_at: now,
  }).eq('id', outcome.id)
  if (updateError) throw new Error(`Unable to persist data quality verification outcome: ${updateError.message}`)

  await admin.schema('governance').from('data_quality_investigations').update({ status: verificationPassed ? 'VERIFIED' : 'VERIFICATION_FAILED', updated_at: now }).eq('id', investigation.id)

  const { error: learningError } = await admin.schema('governance').from('data_quality_recommendation_learning').update({
    verification_agent_run_id: input.verificationAgentRunId,
    status: verificationPassed ? 'VERIFIED' : 'INEFFECTIVE',
    effective: verificationPassed,
    evidence: {
      checks,
      verification_source: verificationSource,
      source_failed_rule_count: sourceFailed.length,
      verification_failed_rule_count: verificationFailed.length,
    },
    updated_at: now,
  }).eq('workflow_instance_id', input.workflowInstanceId)
  if (learningError) throw new Error(`Unable to update data quality recommendation learning: ${learningError.message}`)

  await writeGovernanceAudit({
    projectId: outcome.project_id,
    actorUserId,
    actorType: actorUserId ? 'USER' : 'SYSTEM',
    eventType: verificationPassed ? 'DATA_QUALITY_REMEDIATION_VERIFIED' : 'DATA_QUALITY_REMEDIATION_VERIFICATION_FAILED',
    entityType: 'DATA_QUALITY_RUN',
    entityId: input.verificationAgentRunId,
    correlationId: input.workflowInstanceId,
    metadata: { workflow_instance_id: input.workflowInstanceId, source_agent_run_id: outcome.source_agent_run_id, verification_agent_run_id: input.verificationAgentRunId, verification_source: verificationSource, checks },
  })

  return {
    workflowInstanceId: input.workflowInstanceId,
    sourceAgentRunId: outcome.source_agent_run_id,
    verificationAgentRunId: input.verificationAgentRunId,
    verificationPassed,
    status,
    checks,
  }
}

export async function scheduleDataQualityVerificationFromIssue(input: {
  issueId: string
  projectId: string
  userId: string
}) {
  const admin = createAdminClient()

  const { data: outcome, error: outcomeError } = await admin
    .schema('governance')
    .from('data_quality_remediation_outcomes')
    .select('id,project_id,workflow_instance_id,investigation_id,source_agent_run_id,remediation_issue_ids,status,verification_agent_run_id,verification_job_id,verification_generation')
    .eq('project_id', input.projectId)
    .contains('remediation_issue_ids', [input.issueId])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (outcomeError) throw new Error(`Unable to resolve data quality remediation outcome: ${outcomeError.message}`)
  if (!outcome) return { status: 'NOT_DATA_QUALITY_REMEDIATION' }

  const issueIds = uuidList(outcome.remediation_issue_ids)
  const { data: issues, error: issuesError } = issueIds.length
    ? await admin.schema('governance').from('issues').select('id,status').in('id', issueIds)
    : { data: [], error: null }
  if (issuesError) throw new Error(`Unable to resolve data quality remediation issues: ${issuesError.message}`)

  const unresolvedIssueIds = issueIds.filter((id) => !(issues ?? []).some((issue) => issue.id === id && ['RESOLVED', 'CLOSED'].includes(issue.status)))
  if (unresolvedIssueIds.length) {
    await admin.schema('governance').from('data_quality_remediation_outcomes').update({ status: 'WAITING_FOR_REMEDIATION', updated_at: new Date().toISOString() }).eq('id', outcome.id)
    return { status: 'WAITING_FOR_REMEDIATION', unresolvedIssueIds }
  }

  if (outcome.verification_agent_run_id && outcome.verification_job_id) {
    const { data: existingJob, error: existingJobError } = await admin.schema('orchestration').from('job_queue').select('id,status,agent_run_id').eq('id', outcome.verification_job_id).maybeSingle()
    if (existingJobError) throw new Error(`Unable to resolve data quality verification job: ${existingJobError.message}`)
    if (existingJob && ['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(existingJob.status)) {
      return { status: 'ALREADY_QUEUED', durableJobId: existingJob.id, agentRunId: existingJob.agent_run_id, jobStatus: existingJob.status }
    }
  }

  const { data: investigation, error: investigationError } = await admin
    .schema('governance')
    .from('data_quality_investigations')
    .select('id,dataset_id,dataset_version_id,profile_run_id')
    .eq('id', outcome.investigation_id)
    .maybeSingle()
  if (investigationError || !investigation) throw new Error(`Unable to load data quality investigation for verification: ${investigationError?.message ?? 'not found'}`)
  if (!investigation.profile_run_id) throw new Error('Data quality verification requires the source profiling run.')

  const generation = Number(outcome.verification_generation ?? 0) + 1
  const queued = await queueDataQualityAutomation({
    projectId: input.projectId,
    datasetId: investigation.dataset_id,
    datasetVersionId: investigation.dataset_version_id,
    profileRunId: investigation.profile_run_id,
    userId: input.userId,
    parentRunId: outcome.source_agent_run_id,
    requestedByUser: false,
    trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION',
    workflowInstanceId: outcome.workflow_instance_id,
    verificationGeneration: generation,
    idempotencyKey: `data-quality:remediation-verification:${outcome.workflow_instance_id}:${generation}`,
  })

  const now = new Date().toISOString()
  const { error: updateError } = await admin.schema('governance').from('data_quality_remediation_outcomes').update({
    status: 'VERIFICATION_QUEUED',
    verification_agent_run_id: queued.agentRunId,
    verification_job_id: queued.durableJobId,
    verification_requested_at: now,
    verification_generation: generation,
    updated_at: now,
  }).eq('id', outcome.id)
  if (updateError) throw new Error(`Unable to link data quality verification job: ${updateError.message}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.userId,
    eventType: 'DATA_QUALITY_REMEDIATION_VERIFICATION_QUEUED',
    entityType: 'DATA_QUALITY_RUN',
    entityId: queued.agentRunId,
    correlationId: outcome.workflow_instance_id,
    metadata: { source_agent_run_id: outcome.source_agent_run_id, verification_agent_run_id: queued.agentRunId, verification_job_id: queued.durableJobId, verification_generation: generation },
  })

  return { status: queued.reused ? 'ALREADY_QUEUED' : 'QUEUED', agentRunId: queued.agentRunId, durableJobId: queued.durableJobId, verificationGeneration: generation }
}
