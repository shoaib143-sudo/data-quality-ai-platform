import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function uuidList(value: unknown) { return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [] }
function severityRank(value: unknown) {
  const ranks: Record<string, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
  return ranks[text(value).toUpperCase()] ?? 0
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const workflowInstanceId = text(body.workflowInstanceId)
    const verificationAgentRunId = text(body.verificationAgentRunId)
    if (!workflowInstanceId || !verificationAgentRunId) {
      return NextResponse.json({ error: 'workflowInstanceId and verificationAgentRunId are required.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: outcome, error: outcomeError } = await admin
      .schema('governance')
      .from('data_quality_remediation_outcomes')
      .select('id,project_id,workflow_instance_id,investigation_id,source_agent_run_id,remediation_issue_ids,status,outcome,checks')
      .eq('workflow_instance_id', workflowInstanceId)
      .maybeSingle()
    if (outcomeError) throw new Error(`Unable to load data quality remediation outcome: ${outcomeError.message}`)
    if (!outcome) return NextResponse.json({ error: 'Data quality remediation outcome not found.' }, { status: 404 })

    await authorizeProject(user.id, outcome.project_id, 'quality.read')

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
      .eq('id', verificationAgentRunId)
      .maybeSingle()
    if (verificationRunError || !verificationRun) throw new Error(`Unable to load verification data quality run: ${verificationRunError?.message ?? 'not found'}`)
    if (verificationRun.status !== 'SUCCEEDED') return NextResponse.json({ error: 'Verification data quality run must be successful.' }, { status: 409 })
    if (verificationRun.project_id !== outcome.project_id || verificationRun.dataset_id !== investigation.dataset_id) {
      return NextResponse.json({ error: 'Verification run must belong to the same governed dataset and project.' }, { status: 409 })
    }
    if (verificationAgentRunId === outcome.source_agent_run_id) {
      return NextResponse.json({ error: 'Verification must use a new data quality execution.' }, { status: 409 })
    }

    const [{ data: sourceRuns, error: sourceRunsError }, { data: verificationRuns, error: verificationRunsError }] = await Promise.all([
      admin.schema('profiling').from('quality_rule_runs').select('id,rule_definition_id,status').eq('agent_run_id', outcome.source_agent_run_id),
      admin.schema('profiling').from('quality_rule_runs').select('id,rule_definition_id,status').eq('agent_run_id', verificationAgentRunId),
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
      verification_agent_run_id: verificationAgentRunId,
      status,
      checks,
      outcome: {
        verification_passed: verificationPassed,
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

    await admin.schema('governance').from('data_quality_investigations').update({
      status: verificationPassed ? 'VERIFIED' : 'VERIFICATION_FAILED',
      updated_at: now,
    }).eq('id', investigation.id)

    const { error: learningError } = await admin.schema('governance').from('data_quality_recommendation_learning').update({
      verification_agent_run_id: verificationAgentRunId,
      status: verificationPassed ? 'VERIFIED' : 'INEFFECTIVE',
      effective: verificationPassed,
      evidence: {
        checks,
        source_failed_rule_count: sourceFailed.length,
        verification_failed_rule_count: verificationFailed.length,
      },
      updated_at: now,
    }).eq('workflow_instance_id', workflowInstanceId)
    if (learningError) throw new Error(`Unable to update data quality recommendation learning: ${learningError.message}`)

    await writeGovernanceAudit({
      projectId: outcome.project_id,
      actorUserId: user.id,
      eventType: verificationPassed ? 'DATA_QUALITY_REMEDIATION_VERIFIED' : 'DATA_QUALITY_REMEDIATION_VERIFICATION_FAILED',
      entityType: 'DATA_QUALITY_RUN',
      entityId: verificationAgentRunId,
      correlationId: workflowInstanceId,
      metadata: { workflow_instance_id: workflowInstanceId, source_agent_run_id: outcome.source_agent_run_id, verification_agent_run_id: verificationAgentRunId, checks },
    })

    return NextResponse.json({
      workflowInstanceId,
      sourceAgentRunId: outcome.source_agent_run_id,
      verificationAgentRunId,
      verificationPassed,
      status,
      checks,
    }, { status: verificationPassed ? 200 : 409 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify data quality remediation.' }, { status: 500 })
  }
}
