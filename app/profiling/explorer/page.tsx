import Link from 'next/link'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { sanitizePersistedMetricForPresentation } from '@/lib/profiling/canonical-document-preview'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import ProfilingExplorer from '@/app/profiling/profiling-explorer'
import ProfilingGovernancePanel from '@/app/profiling/profiling-governance-panel'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { canonicalRoutes } from '@/lib/platform/canonical-routes'

type ExplorerSearchParams = Promise<{
  runId?: string
  columnId?: string
  findingId?: string
}>

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export default async function ProfilingExplorerPage({ searchParams }: { searchParams: ExplorerSearchParams }) {
  const user = await requireUser()
  const supabase = await createClient()
  const [requested, landing] = await Promise.all([searchParams, resolveLandingAccess(user.id)])
  const requestedRunId = requested.runId?.trim() || null

  const requestedRun = requestedRunId
    ? await supabase
        .schema('profiling')
        .from('profile_runs')
        .select('id,status,summary,dataset_version_id')
        .eq('id', requestedRunId)
        .maybeSingle()
    : { data: null, error: null }

  if (requestedRun.error) throw new Error(`Unable to load requested profiling run: ${requestedRun.error.message}`)

  const latestRunResult = requestedRun.data
    ? requestedRun
    : await supabase
        .schema('profiling')
        .from('profile_runs')
        .select('id,status,summary,dataset_version_id')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

  if (latestRunResult.error) throw new Error(`Unable to load latest profiling run: ${latestRunResult.error.message}`)
  const latestRun = latestRunResult.data

  if (!latestRun) {
    return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0b1422] p-5 text-slate-100"><div className="mx-auto max-w-7xl"><GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Profiling Explorer" contextLabel="No profiling run selected" homeHref="/home" /><div className="mt-5 rounded-2xl border border-white/10 bg-[#102036] p-8"><h1 className="text-2xl font-semibold">Profiling Explorer</h1><p className="mt-2 text-sm text-slate-400">No profiling runs are available.</p></div></div></main>
  }

  const versionContext = await supabase.schema('catalog').from('dataset_versions').select('dataset_id').eq('id', latestRun.dataset_version_id).maybeSingle()
  if (versionContext.error || !versionContext.data) throw new Error(`Unable to resolve profiling project context: ${versionContext.error?.message ?? 'dataset version not found'}`)
  const datasetContext = await supabase.schema('catalog').from('datasets').select('id,project_id,name').eq('id', versionContext.data.dataset_id).maybeSingle()
  if (datasetContext.error || !datasetContext.data) throw new Error(`Unable to resolve profiling project context: ${datasetContext.error?.message ?? 'dataset not found'}`)
  const projectId = String(datasetContext.data.project_id)
  const [canManageWorkflow, canManageRemediation] = await Promise.all([
    hasProjectCapability(user.id, projectId, 'workflow.manage'),
    hasProjectCapability(user.id, projectId, 'issues.manage'),
  ])
  const canOpenWorkflows = canAccessWorkspace(landing.persona, 'workflows', landing.organizationRole)

  const [
    { data: findings, error: findingsError },
    { data: columns, error: columnsError },
    { data: metrics, error: metricsError },
    { data: distributions, error: distributionsError },
    workflowResult,
    verificationOutcomeResult,
  ] = await Promise.all([
    supabase.schema('profiling').from('profile_findings').select('id,profile_column_id,finding_type,severity,title,description,confidence').eq('profile_run_id', latestRun.id).order('created_at', { ascending: false }).limit(500),
    supabase.schema('profiling').from('profile_columns').select('id,column_name,source_type,inferred_type,semantic_type,nullable,confidence,is_candidate_key,key_confidence,total_count,non_null_count,null_count,blank_count,zero_count,distinct_count,distinct_percentage').eq('profile_run_id', latestRun.id).order('ordinal_position'),
    supabase.schema('profiling').from('profile_metrics').select('profile_column_id,metric_key,numeric_value,text_value,boolean_value,json_value').eq('profile_run_id', latestRun.id).order('metric_key').limit(2000),
    supabase.schema('profiling').from('profile_distributions').select('profile_column_id,distribution_type,distribution').eq('profile_run_id', latestRun.id).order('distribution_type').limit(1000),
    supabase.schema('governance').from('workflow_instances').select('id,status,current_step').eq('entity_type', 'PROFILE_RUN').eq('entity_id', latestRun.id).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.schema('governance').from('profiling_remediation_outcomes')
      .select('workflow_instance_id,status,execution_mode,production_mutation_performed,remediation_issue_ids,verification_profile_run_id,verification_job_id,source_quality_score,verification_quality_score,quality_score_delta,source_high_severity_findings,verification_high_severity_findings,high_severity_findings_delta,outcome')
      .eq('project_id', projectId)
      .eq('verification_profile_run_id', latestRun.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (findingsError) throw new Error(`Unable to load profiling findings: ${findingsError.message}`)
  if (columnsError) throw new Error(`Unable to load profiling columns: ${columnsError.message}`)
  if (metricsError) throw new Error(`Unable to load profiling metrics: ${metricsError.message}`)
  if (distributionsError) throw new Error(`Unable to load profiling distributions: ${distributionsError.message}`)
  if (workflowResult.error) throw new Error(`Unable to load profiling governance workflow: ${workflowResult.error.message}`)
  if (verificationOutcomeResult.error) throw new Error(`Unable to load verification remediation context: ${verificationOutcomeResult.error.message}`)

  const safeMetrics = (metrics ?? []).map(sanitizePersistedMetricForPresentation)
  let workflow = workflowResult.data
  if (!workflow && verificationOutcomeResult.data?.workflow_instance_id) {
    const originWorkflowResult = await supabase.schema('governance').from('workflow_instances')
      .select('id,status,current_step')
      .eq('id', verificationOutcomeResult.data.workflow_instance_id)
      .eq('project_id', projectId)
      .maybeSingle()
    if (originWorkflowResult.error) throw new Error(`Unable to load originating governance workflow: ${originWorkflowResult.error.message}`)
    workflow = originWorkflowResult.data
  }

  const outcomeResult = verificationOutcomeResult.data
    ? verificationOutcomeResult
    : workflow
      ? await supabase.schema('governance').from('profiling_remediation_outcomes')
          .select('workflow_instance_id,status,execution_mode,production_mutation_performed,remediation_issue_ids,verification_profile_run_id,verification_job_id,source_quality_score,verification_quality_score,quality_score_delta,source_high_severity_findings,verification_high_severity_findings,high_severity_findings_delta,outcome')
          .eq('workflow_instance_id', workflow.id)
          .maybeSingle()
      : { data: null, error: null }

  if (outcomeResult.error) throw new Error(`Unable to load profiling remediation outcome: ${outcomeResult.error.message}`)
  const remediationOutcome = outcomeResult.data
  const remediationIssueIds: string[] = Array.isArray(remediationOutcome?.remediation_issue_ids)
    ? remediationOutcome.remediation_issue_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    : []

  const issueResult = remediationIssueIds.length
    ? await supabase.schema('governance').from('issues')
        .select('id,title,status,severity,resolution_summary')
        .in('id', remediationIssueIds)
        .limit(500)
    : { data: [], error: null }

  if (issueResult.error) throw new Error(`Unable to load tracked profiling remediation issues: ${issueResult.error.message}`)

  const summary = object(latestRun.summary)
  const investigationRecord = object(summary.investigation)
  const recommendations = Array.isArray(investigationRecord.recommendations)
    ? investigationRecord.recommendations.map((item) => {
        const recommendation = object(item)
        return {
          action: text(recommendation.action) ?? 'governed_remediation_review',
          priority: text(recommendation.priority),
          rationale: text(recommendation.rationale),
          approvalRequired: recommendation.approval_required === true,
        }
      })
    : []

  const outcomeEvidence = object(remediationOutcome?.outcome)
  const governanceInvestigation = {
    approvalRequired: investigationRecord.approval_required === true,
    risk: text(investigationRecord.risk),
    confidence: numeric(investigationRecord.confidence),
    businessIssue: text(investigationRecord.business_issue),
    businessImpact: text(investigationRecord.business_impact),
    recommendations,
  }

  const governanceWorkflow = workflow ? {
    id: workflow.id,
    status: workflow.status,
    currentStep: Number(workflow.current_step ?? 0),
  } : null

  const governanceOutcome = remediationOutcome ? {
    status: remediationOutcome.status,
    executionMode: remediationOutcome.execution_mode,
    productionMutationPerformed: remediationOutcome.production_mutation_performed === true,
    verificationProfileRunId: remediationOutcome.verification_profile_run_id,
    verificationJobId: remediationOutcome.verification_job_id,
    verificationRetryable: outcomeEvidence.verification_retryable === true,
    sourceQualityScore: remediationOutcome.source_quality_score === null ? null : Number(remediationOutcome.source_quality_score),
    verificationQualityScore: remediationOutcome.verification_quality_score === null ? null : Number(remediationOutcome.verification_quality_score),
    qualityScoreDelta: remediationOutcome.quality_score_delta === null ? null : Number(remediationOutcome.quality_score_delta),
    sourceHighSeverityFindings: remediationOutcome.source_high_severity_findings === null ? null : Number(remediationOutcome.source_high_severity_findings),
    verificationHighSeverityFindings: remediationOutcome.verification_high_severity_findings === null ? null : Number(remediationOutcome.verification_high_severity_findings),
    highSeverityFindingsDelta: remediationOutcome.high_severity_findings_delta === null ? null : Number(remediationOutcome.high_severity_findings_delta),
  } : null

  const governanceIssues = (issueResult.data ?? []).map((issue) => ({
    id: issue.id,
    title: issue.title,
    status: issue.status,
    severity: issue.severity,
    resolutionSummary: issue.resolution_summary,
  }))

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0b1422] p-5 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Profiling Explorer" contextLabel={datasetContext.data.name ?? 'Profiling evidence'} homeHref="/home" />
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-[#102036] p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <Link href="/profiling" className="text-cyan-300 hover:text-cyan-200">Profiling</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400">{datasetContext.data.name ?? 'Dataset evidence'}</span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold">Profiling Explorer</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Run {latestRun.id.slice(0,8)}…</span>
              <span className="text-slate-600">·</span>
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 font-bold text-emerald-300">{latestRun.status}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={canonicalRoutes.governedDataset(String(datasetContext.data.id))} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-white/[0.04]">Dataset 360</Link>
            <Link href={canonicalRoutes.governanceRun(projectId)} className="rounded-xl border border-violet-300/20 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-white/[0.04]">Governance Run</Link>
          </div>
        </div>
        <ProfilingGovernancePanel
          profileRunId={latestRun.id}
          profileRunStatus={latestRun.status}
          investigation={governanceInvestigation}
          workflow={governanceWorkflow}
          outcome={governanceOutcome}
          issues={governanceIssues}
          canManageWorkflow={canManageWorkflow}
          canManageRemediation={canManageRemediation}
          canOpenWorkflows={canOpenWorkflows}
        />
        <ProfilingExplorer
          findings={(findings ?? []) as any}
          columns={(columns ?? []) as any}
          metrics={safeMetrics as any}
          distributions={(distributions ?? []) as any}
          initialColumnId={requested.columnId ?? null}
          initialFindingId={requested.findingId ?? null}
        />
      </div>
    </main>
  )
}