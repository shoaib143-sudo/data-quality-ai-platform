import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import ProfilingExplorer from '@/app/profiling/profiling-explorer'
import ProfilingGovernancePanel from '@/app/profiling/profiling-governance-panel'

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

function hasUnreadableControlText(value: unknown): boolean {
  if (typeof value === 'string') {
    if (!value) return false
    const controls = value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g)?.length ?? 0
    return controls >= 3 && controls / Math.max(value.length, 1) >= 0.01
  }
  if (Array.isArray(value)) return value.some(hasUnreadableControlText)
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasUnreadableControlText)
  return false
}

function sanitizeExplorerMetric<T extends {
  text_value: string | null
  json_value: unknown
}>(metric: T): T {
  const textUnreadable = hasUnreadableControlText(metric.text_value)
  const jsonUnreadable = hasUnreadableControlText(metric.json_value)
  if (!textUnreadable && !jsonUnreadable) return metric
  return {
    ...metric,
    text_value: textUnreadable ? '[Unreadable binary/glyph evidence hidden]' : metric.text_value,
    json_value: jsonUnreadable ? { evidence_state: 'UNREADABLE_BINARY_OR_GLYPH_TEXT', display: 'Persisted binary/glyph evidence hidden from explorer.' } : metric.json_value,
  }
}

export default async function ProfilingExplorerPage({ searchParams }: { searchParams: ExplorerSearchParams }) {
  const user = await requireUser()
  const supabase = await createClient()
  const requested = await searchParams
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
    return <main className="min-h-screen p-8"><div className="mx-auto max-w-5xl rounded-xl border p-8"><h1 className="text-2xl font-semibold">Profiling Explorer</h1><p className="mt-2 text-sm text-muted-foreground">No profiling runs are available.</p></div></main>
  }

  const [landing, versionContext] = await Promise.all([
    resolveLandingAccess(user.id),
    supabase.schema('catalog').from('dataset_versions').select('dataset_id').eq('id', latestRun.dataset_version_id).maybeSingle(),
  ])
  if (versionContext.error || !versionContext.data) throw new Error(`Unable to resolve profiling project context: ${versionContext.error?.message ?? 'dataset version not found'}`)
  const datasetContext = await supabase.schema('catalog').from('datasets').select('project_id').eq('id', versionContext.data.dataset_id).maybeSingle()
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
  ] = await Promise.all([
    supabase.schema('profiling').from('profile_findings').select('id,profile_column_id,finding_type,severity,title,description,confidence').eq('profile_run_id', latestRun.id).order('created_at', { ascending: false }).limit(500),
    supabase.schema('profiling').from('profile_columns').select('id,column_name,source_type,inferred_type,semantic_type,nullable,confidence,is_candidate_key,key_confidence,total_count,non_null_count,null_count,blank_count,zero_count,distinct_count,distinct_percentage').eq('profile_run_id', latestRun.id).order('ordinal_position'),
    supabase.schema('profiling').from('profile_metrics').select('profile_column_id,metric_key,numeric_value,text_value,boolean_value,json_value').eq('profile_run_id', latestRun.id).order('metric_key').limit(2000),
    supabase.schema('profiling').from('profile_distributions').select('profile_column_id,distribution_type,distribution').eq('profile_run_id', latestRun.id).order('distribution_type').limit(1000),
    supabase.schema('governance').from('workflow_instances').select('id,status,current_step').eq('entity_type', 'PROFILE_RUN').eq('entity_id', latestRun.id).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (findingsError) throw new Error(`Unable to load profiling findings: ${findingsError.message}`)
  if (columnsError) throw new Error(`Unable to load profiling columns: ${columnsError.message}`)
  if (metricsError) throw new Error(`Unable to load profiling metrics: ${metricsError.message}`)
  if (distributionsError) throw new Error(`Unable to load profiling distributions: ${distributionsError.message}`)
  if (workflowResult.error) throw new Error(`Unable to load profiling governance workflow: ${workflowResult.error.message}`)

  const safeMetrics = (metrics ?? []).map(sanitizeExplorerMetric)
  const workflow = workflowResult.data
  const outcomeResult = workflow
    ? await supabase.schema('governance').from('profiling_remediation_outcomes')
        .select('status,execution_mode,production_mutation_performed,remediation_issue_ids,verification_profile_run_id,verification_job_id,quality_score_delta,high_severity_findings_delta,outcome')
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
    qualityScoreDelta: remediationOutcome.quality_score_delta === null ? null : Number(remediationOutcome.quality_score_delta),
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
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Profiling Explorer</h1>
          <p className="mt-2 text-sm text-muted-foreground">Run {latestRun.id} · {latestRun.status}</p>
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
