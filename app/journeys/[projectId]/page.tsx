import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  Compass,
  Database,
  Gauge,
  GitBranch,
  Lightbulb,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { canonicalRoutes } from '@/lib/platform/canonical-routes'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type StageState = 'COMPLETE' | 'IN_PROGRESS' | 'BLOCKED' | 'NOT_STARTED' | 'OPTIONAL'

type Stage = {
  key: string
  label: string
  detail: string
  state: StageState
  href: string
  action: string
  icon: typeof Database
}

function normalized(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

function unresolved(value: unknown) {
  return !['RESOLVED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(normalized(value))
}

function formatScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A'
}

function stageClasses(state: StageState) {
  if (state === 'COMPLETE') return 'border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-200'
  if (state === 'IN_PROGRESS') return 'border-blue-300/20 bg-blue-400/[0.06] text-blue-200'
  if (state === 'BLOCKED') return 'border-rose-300/20 bg-rose-400/[0.06] text-rose-200'
  if (state === 'OPTIONAL') return 'border-violet-300/20 bg-violet-400/[0.06] text-violet-200'
  return 'border-white/10 bg-white/[0.025] text-slate-300'
}

function stateIcon(state: StageState) {
  if (state === 'COMPLETE') return <CheckCircle2 className="h-5 w-5 text-emerald-300" />
  if (state === 'IN_PROGRESS') return <Clock3 className="h-5 w-5 text-blue-300" />
  if (state === 'BLOCKED') return <AlertTriangle className="h-5 w-5 text-rose-300" />
  return <Circle className="h-5 w-5 text-slate-500" />
}

export default async function GovernanceRunPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const { projectId } = await params
  const supabase = await createClient()

  const projectResult = await supabase.schema('app').from('projects')
    .select('id,name,organization_id')
    .eq('id', projectId)
    .eq('organization_id', landing.organizationId)
    .maybeSingle()
  if (projectResult.error) throw new Error(`Unable to load Governance Run project: ${projectResult.error.message}`)
  if (!projectResult.data) notFound()
  const project = projectResult.data
  const canWorkflows = canAccessWorkspace(landing.persona, 'workflows', landing.organizationRole)
  const canMonitoring = canAccessWorkspace(landing.persona, 'monitoring', landing.organizationRole)
  const canApprovals = canAccessWorkspace(landing.persona, 'approvals', landing.organizationRole)
  const canReports = canAccessWorkspace(landing.persona, 'reports', landing.organizationRole)
  const canAiCapabilities = canAccessWorkspace(landing.persona, 'ai-capabilities', landing.organizationRole)

  const [sourcesResult, datasetsResult, issuesResult, workflowsResult, outcomesResult, learningResult] = await Promise.all([
    supabase.schema('catalog').from('data_sources').select('id,name,status').eq('project_id', projectId).order('name'),
    supabase.schema('catalog').from('datasets').select('id,name,status,data_source_id').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.schema('governance').from('issues').select('id,title,severity,status,dataset_id,profile_run_id,finding_id,updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(200),
    supabase.schema('governance').from('workflow_instances').select('id,status,current_step,entity_type,entity_id,started_at').eq('project_id', projectId).order('started_at', { ascending: false }).limit(100),
    supabase.schema('governance').from('profiling_remediation_outcomes').select('id,workflow_instance_id,status,source_profile_run_id,verification_profile_run_id,remediation_issue_ids,quality_score_delta,high_severity_findings_delta,updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(100),
    supabase.schema('governance').from('profiling_recommendation_learning').select('id,workflow_instance_id,recommendation_action,status,effective,quality_score_delta,high_severity_findings_delta,observed_at').eq('project_id', projectId).order('observed_at', { ascending: false, nullsFirst: false }).limit(100),
  ])
  for (const [name, result] of [
    ['sources', sourcesResult],
    ['datasets', datasetsResult],
    ['issues', issuesResult],
    ['workflows', workflowsResult],
    ['remediation outcomes', outcomesResult],
    ['learning evidence', learningResult],
  ] as const) {
    if (result.error) throw new Error(`Unable to load Governance Run ${name}: ${result.error.message}`)
  }

  const sources = sourcesResult.data ?? []
  const datasets = datasetsResult.data ?? []
  const sourceIds = sources.map(source => String(source.id))
  const datasetIds = datasets.map(dataset => String(dataset.id))

  const [readinessResult, versionsResult] = await Promise.all([
    sourceIds.length
      ? supabase.schema('catalog').from('source_operational_readiness').select('source_id,operational_state,latest_run_status,evidence_reason').in('source_id', sourceIds)
      : Promise.resolve({ data: [], error: null }),
    datasetIds.length
      ? supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status,created_at').in('dataset_id', datasetIds).order('version_number', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])
  if (readinessResult.error) throw new Error(`Unable to load Governance Run source readiness: ${readinessResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load Governance Run dataset versions: ${versionsResult.error.message}`)

  const versions = versionsResult.data ?? []
  const versionIds = versions.map(version => String(version.id))
  const runsResult = versionIds.length
    ? await supabase.schema('profiling').from('profile_runs')
        .select('id,dataset_version_id,status,row_count,column_count,summary,started_at,completed_at,error_code')
        .in('dataset_version_id', versionIds)
        .order('started_at', { ascending: false })
        .limit(250)
    : { data: [], error: null }
  if (runsResult.error) throw new Error(`Unable to load Governance Run profiling evidence: ${runsResult.error.message}`)

  const runs = runsResult.data ?? []
  const completedRuns = runs.filter(run => normalized(run.status) === 'COMPLETED')
  const latestRun = runs[0] ?? null
  const latestCompletedRun = completedRuns[0] ?? null
  const runIds = runs.map(run => String(run.id))

  const [scoresResult, findingsResult] = await Promise.all([
    runIds.length
      ? supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score,completeness_score,validity_score,uniqueness_score,accuracy_score,created_at').in('profile_run_id', runIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? supabase.schema('profiling').from('profile_findings').select('id,profile_run_id,severity,title,description,confidence,created_at').in('profile_run_id', runIds).order('created_at', { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (scoresResult.error) throw new Error(`Unable to load Governance Run scores: ${scoresResult.error.message}`)
  if (findingsResult.error) throw new Error(`Unable to load Governance Run findings: ${findingsResult.error.message}`)

  const readiness = readinessResult.data ?? []
  const scores = scoresResult.data ?? []
  const findings = findingsResult.data ?? []
  const issues = issuesResult.data ?? []
  const workflows = workflowsResult.data ?? []
  const outcomes = outcomesResult.data ?? []
  const learning = learningResult.data ?? []

  const latestScore = latestCompletedRun ? scores.find(score => score.profile_run_id === latestCompletedRun.id) ?? null : null
  const latestFindings = latestCompletedRun ? findings.filter(finding => finding.profile_run_id === latestCompletedRun.id) : []
  const highFindings = latestFindings.filter(finding => ['CRITICAL', 'HIGH'].includes(normalized(finding.severity)))
  const runLinkedOutcome = latestCompletedRun
    ? outcomes.find(outcome =>
        String(outcome.source_profile_run_id ?? '') === String(latestCompletedRun.id)
        || String(outcome.verification_profile_run_id ?? '') === String(latestCompletedRun.id)
      ) ?? null
    : null
  const latestWorkflow = runLinkedOutcome
    ? workflows.find(workflow => String(workflow.id) === String(runLinkedOutcome.workflow_instance_id)) ?? null
    : latestCompletedRun
      ? workflows.find(workflow => normalized(workflow.entity_type) === 'PROFILE_RUN' && String(workflow.entity_id) === String(latestCompletedRun.id)) ?? null
      : null
  const latestOutcome = runLinkedOutcome ?? (latestWorkflow ? outcomes.find(outcome => outcome.workflow_instance_id === latestWorkflow.id) ?? null : null)
  const outcomeIssueIds = new Set(
    Array.isArray(latestOutcome?.remediation_issue_ids)
      ? latestOutcome.remediation_issue_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [],
  )
  const latestIssues = outcomeIssueIds.size
    ? issues.filter(issue => outcomeIssueIds.has(String(issue.id)))
    : latestCompletedRun
      ? issues.filter(issue => issue.profile_run_id === latestCompletedRun.id)
      : []
  const openIssues = latestIssues.filter(issue => unresolved(issue.status))
  const latestLearning = latestWorkflow ? learning.find(item => item.workflow_instance_id === latestWorkflow.id) ?? null : null

  const observedReady = readiness.filter(row => normalized(row.operational_state) === 'OBSERVED_READY')
  const discoveryComplete = observedReady.length > 0 && datasets.length > 0
  const profileFailed = latestRun && normalized(latestRun.status) === 'FAILED'
  const workflowStatus = normalized(latestWorkflow?.status)
  const outcomeStatus = normalized(latestOutcome?.status)
  const verified = outcomeStatus === 'VERIFIED' || outcomeStatus === 'VERIFIED_RESOLVED'
  const remediationRequired = highFindings.length > 0

  const latestVersion = latestCompletedRun
    ? versions.find(version => String(version.id) === String(latestCompletedRun.dataset_version_id)) ?? null
    : latestRun
      ? versions.find(version => String(version.id) === String(latestRun.dataset_version_id)) ?? null
      : versions[0] ?? null
  const latestDataset = latestVersion
    ? datasets.find(dataset => String(dataset.id) === String(latestVersion.dataset_id)) ?? null
    : datasets[0] ?? null
  const datasetHref = latestDataset ? canonicalRoutes.governedDataset(String(latestDataset.id)) : canonicalRoutes.datasets
  const profileHref = latestCompletedRun ? `/profiling/explorer?runId=${encodeURIComponent(String(latestCompletedRun.id))}` : '/profiling/explorer'
  const workflowHref = canWorkflows
    ? latestWorkflow ? `/workflows?instanceId=${encodeURIComponent(String(latestWorkflow.id))}` : '/workflows'
    : latestIssues[0] ? incidentHref : profileHref
  const incidentHref = latestIssues[0] ? canonicalRoutes.governedIncident(String(latestIssues[0].id)) : '/issues'

  const stages: Stage[] = [
    {
      key: 'source',
      label: 'Source readiness',
      detail: sources.length
        ? `${sources.length} source${sources.length === 1 ? '' : 's'} registered; ${observedReady.length} observed ready.`
        : 'No governed source is registered.',
      state: sources.length === 0 ? 'NOT_STARTED' : observedReady.length > 0 ? 'COMPLETE' : 'IN_PROGRESS',
      href: canonicalRoutes.datasets,
      action: sources.length ? 'Review sources' : 'Connect source',
      icon: Database,
    },
    {
      key: 'discover',
      label: 'Dataset discovery',
      detail: datasets.length
        ? `${datasets.length} dataset${datasets.length === 1 ? '' : 's'} registered with ${versions.length} version record${versions.length === 1 ? '' : 's'}.`
        : 'No governed dataset has been registered from source evidence.',
      state: discoveryComplete ? 'COMPLETE' : sources.length ? 'IN_PROGRESS' : 'NOT_STARTED',
      href: datasetHref,
      action: datasets.length ? 'Open Dataset 360' : 'Register dataset',
      icon: Compass,
    },
    {
      key: 'profile',
      label: 'Profiling',
      detail: latestCompletedRun
        ? `Latest completed profile observed ${latestCompletedRun.row_count ?? 'N/A'} rows and ${latestCompletedRun.column_count ?? 'N/A'} columns.`
        : profileFailed
          ? `Latest profile failed${latestRun?.error_code ? `: ${latestRun.error_code}` : '.'}`
          : 'No completed profile run is available.',
      state: latestCompletedRun ? 'COMPLETE' : profileFailed ? 'BLOCKED' : discoveryComplete ? 'IN_PROGRESS' : 'NOT_STARTED',
      href: profileHref,
      action: latestCompletedRun ? 'Open profiling evidence' : 'Open profiling',
      icon: Gauge,
    },
    {
      key: 'assess',
      label: 'Quality assessment',
      detail: latestScore ? `Current quality score: ${formatScore(latestScore.overall_score)}.` : 'No persisted quality score is available for the latest completed profile.',
      state: latestScore ? 'COMPLETE' : latestCompletedRun ? 'IN_PROGRESS' : 'NOT_STARTED',
      href: '/data-quality',
      action: 'Review quality',
      icon: ShieldCheck,
    },
    {
      key: 'findings',
      label: 'Findings',
      detail: latestCompletedRun
        ? latestFindings.length
          ? `${latestFindings.length} finding${latestFindings.length === 1 ? '' : 's'}, including ${highFindings.length} high-priority finding${highFindings.length === 1 ? '' : 's'}.`
          : 'Latest completed profile has no persisted findings.'
        : 'Findings require completed profiling evidence.',
      state: latestCompletedRun ? 'COMPLETE' : 'NOT_STARTED',
      href: profileHref,
      action: 'Review findings',
      icon: Lightbulb,
    },
    {
      key: 'govern',
      label: 'Governance decision',
      detail: latestWorkflow
        ? `Workflow ${latestWorkflow.id} is ${workflowStatus || 'UNKNOWN'} at step ${Number(latestWorkflow.current_step ?? 0) + 1}.`
        : remediationRequired
          ? 'High-priority findings exist but no governed workflow is linked yet.'
          : 'No material remediation workflow is required by current high-priority finding evidence.',
      state: latestWorkflow
        ? ['APPROVED', 'COMPLETED', 'EXECUTED'].includes(workflowStatus) ? 'COMPLETE' : 'IN_PROGRESS'
        : remediationRequired ? 'IN_PROGRESS' : latestCompletedRun ? 'COMPLETE' : 'NOT_STARTED',
      href: workflowHref,
      action: latestWorkflow ? 'Open workflow' : 'Review governance',
      icon: GitBranch,
    },
    {
      key: 'remediate',
      label: 'Remediation',
      detail: remediationRequired
        ? latestOutcome
          ? `Remediation outcome is ${outcomeStatus || 'UNKNOWN'}; ${openIssues.length} linked issue${openIssues.length === 1 ? '' : 's'} remain open.`
          : openIssues.length
            ? `${openIssues.length} governed remediation issue${openIssues.length === 1 ? '' : 's'} remain open.`
            : 'High-priority findings require governed remediation tracking.'
        : 'No high-priority finding currently requires remediation.',
      state: !latestCompletedRun
        ? 'NOT_STARTED'
        : !remediationRequired
          ? 'COMPLETE'
          : verified
            ? 'COMPLETE'
            : latestOutcome || openIssues.length ? 'IN_PROGRESS' : 'NOT_STARTED',
      href: latestIssues[0] ? incidentHref : '/issues',
      action: remediationRequired ? 'Open remediation' : 'Review issues',
      icon: Wrench,
    },
    {
      key: 'verify',
      label: 'Verification',
      detail: latestOutcome
        ? latestOutcome.verification_profile_run_id
          ? `Verification profile run ${latestOutcome.verification_profile_run_id} is linked; outcome is ${outcomeStatus || 'UNKNOWN'}.`
          : `Remediation exists but no verification profile run is linked yet; outcome is ${outcomeStatus || 'UNKNOWN'}.`
        : remediationRequired
          ? 'Verification begins after governed remediation evidence is recorded.'
          : 'No remediation verification is required by current high-priority finding evidence.',
      state: !latestCompletedRun
        ? 'NOT_STARTED'
        : !remediationRequired
          ? 'COMPLETE'
          : verified
            ? 'COMPLETE'
            : latestOutcome ? 'IN_PROGRESS' : 'NOT_STARTED',
      href: latestOutcome?.verification_profile_run_id
        ? `/profiling/explorer?runId=${encodeURIComponent(String(latestOutcome.verification_profile_run_id))}`
        : profileHref,
      action: 'Review verification',
      icon: CheckCircle2,
    },
    {
      key: 'outcome',
      label: 'Governance outcome',
      detail: verified
        ? `Verified outcome recorded. Quality delta ${latestOutcome?.quality_score_delta ?? 'N/A'}; high-severity finding delta ${latestOutcome?.high_severity_findings_delta ?? 'N/A'}.`
        : !remediationRequired && latestCompletedRun
          ? 'Current profiling evidence does not require a high-priority remediation outcome.'
          : 'A final governed outcome has not yet been verified.',
      state: verified || (!remediationRequired && Boolean(latestCompletedRun)) ? 'COMPLETE' : latestOutcome ? 'IN_PROGRESS' : 'NOT_STARTED',
      href: latestIssues[0] ? incidentHref : '/reports',
      action: 'Review outcome',
      icon: ShieldCheck,
    },
    {
      key: 'learn',
      label: 'Governed learning',
      detail: latestLearning
        ? `Learning record is ${normalized(latestLearning.status) || 'RECORDED'}${latestLearning.effective === true ? ' and marked effective' : ''}.`
        : 'No governed learning record is linked to the current workflow.',
      state: latestLearning ? latestLearning.effective === true ? 'COMPLETE' : 'IN_PROGRESS' : 'OPTIONAL',
      href: canAiCapabilities ? '/ai-capabilities' : canReports ? '/reports' : '/journeys',
      action: canAiCapabilities ? 'Review learning' : canReports ? 'Review learning evidence' : 'Return to journeys',
      icon: Lightbulb,
    },
  ]

  const completeCount = stages.filter(stage => stage.state === 'COMPLETE').length
  const activeStage = stages.find(stage => ['BLOCKED', 'IN_PROGRESS', 'NOT_STARTED'].includes(stage.state)) ?? null

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#061426] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <GlobalUtilityBar
          persona={landing.persona}
          organizationRole={landing.organizationRole}
          roleLabel="Governance Run"
          contextLabel={project.name}
          homeHref="/journeys"
        />

        <div className="mt-4">
          <Link href="/journeys" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> All governance journeys
          </Link>
        </div>

        <header className="mt-4 rounded-3xl border border-white/10 bg-[#0a1d33] p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1.5 text-xs font-black uppercase tracking-[.14em] text-cyan-300">
                <Compass className="h-4 w-4" /> Current Governance Run
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">{project.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                One user-facing projection over persisted source, dataset, profiling, quality, governance, remediation, verification and learning evidence. No new execution authority is introduced by this view.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-300/10 bg-[#08182b] p-4">
              <p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Lifecycle progress</p>
              <p className="mt-2 text-3xl font-black text-cyan-200">{completeCount}/{stages.length}</p>
              <p className="mt-1 text-xs text-slate-500">evidence stages complete</p>
            </div>
          </div>

          {activeStage ? (
            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-blue-300/10 bg-blue-400/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[.12em] text-blue-300">Recommended next action</p>
                <p className="mt-1 font-bold text-white">{activeStage.label}</p>
                <p className="mt-1 text-sm text-slate-400">{activeStage.detail}</p>
              </div>
              <Link href={activeStage.href} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500">
                {activeStage.action} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4"><p className="text-xs font-bold text-slate-500">Sources ready</p><p className="mt-2 text-2xl font-black text-white">{observedReady.length}/{sources.length}</p></div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4"><p className="text-xs font-bold text-slate-500">Datasets</p><p className="mt-2 text-2xl font-black text-white">{datasets.length}</p></div>
          <Link href={profileHref} className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4 hover:border-cyan-300/20"><p className="text-xs font-bold text-slate-500">Latest quality</p><p className="mt-2 text-2xl font-black text-cyan-200">{formatScore(latestScore?.overall_score)}</p></Link>
          <Link href={latestIssues[0] ? incidentHref : '/issues'} className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4 hover:border-cyan-300/20"><p className="text-xs font-bold text-slate-500">Open remediation issues</p><p className="mt-2 text-2xl font-black text-white">{openIssues.length}</p></Link>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {stages.map((stage, index) => {
            const Icon = stage.icon
            return (
              <Link key={stage.key} href={stage.href} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/30 ${stageClasses(stage.state)}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-black/10"><Icon className="h-4 w-4" /></span>
                  {stateIcon(stage.state)}
                </div>
                <p className="mt-4 text-[10px] font-black uppercase tracking-[.12em] opacity-70">Stage {index + 1} · {stage.state.replaceAll('_', ' ')}</p>
                <h2 className="mt-1 font-black">{stage.label}</h2>
                <p className="mt-2 text-xs leading-5 opacity-75">{stage.detail}</p>
                <p className="mt-3 inline-flex items-center gap-1 text-xs font-black">{stage.action} <ArrowRight className="h-3 w-3" /></p>
              </Link>
            )
          })}
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-[#0a1d33] p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.12em] text-rose-300">Latest profiling evidence</p><h2 className="mt-1 text-xl font-black text-white">Findings</h2></div><Link href={profileHref} className="text-xs font-bold text-cyan-300">Open explorer</Link></div>
            <div className="mt-4 space-y-2">
              {latestFindings.slice(0, 6).map(finding => (
                <Link key={finding.id} href={`${profileHref}&findingId=${encodeURIComponent(String(finding.id))}`} className="block rounded-2xl border border-white/[0.07] bg-[#08182b] p-4 hover:border-cyan-300/20">
                  <div className="flex items-start justify-between gap-3"><p className="text-sm font-bold text-slate-200">{finding.title}</p><span className="rounded-lg bg-rose-400/10 px-2 py-1 text-[10px] font-black text-rose-300">{finding.severity}</span></div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{finding.description}</p>
                </Link>
              ))}
              {latestFindings.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">No persisted findings are available for the latest completed profile.</p> : null}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-[#0a1d33] p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.12em] text-violet-300">Governance execution</p><h2 className="mt-1 text-xl font-black text-white">Workflow and verification</h2></div><Link href={workflowHref} className="text-xs font-bold text-cyan-300">Open workflows</Link></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4"><p className="text-xs font-bold text-slate-500">Workflow</p><p className="mt-2 font-black text-white">{latestWorkflow ? workflowStatus || 'UNKNOWN' : 'Not linked'}</p></div>
              <div className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4"><p className="text-xs font-bold text-slate-500">Remediation outcome</p><p className="mt-2 font-black text-white">{latestOutcome ? outcomeStatus || 'UNKNOWN' : 'Not linked'}</p></div>
              <div className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4"><p className="text-xs font-bold text-slate-500">Verification run</p><p className="mt-2 break-all font-mono text-xs text-slate-300">{latestOutcome?.verification_profile_run_id ?? 'Not linked'}</p></div>
              <div className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4"><p className="text-xs font-bold text-slate-500">Learning</p><p className="mt-2 font-black text-white">{latestLearning ? normalized(latestLearning.status) || 'RECORDED' : 'Not linked'}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canMonitoring ? <Link href="/monitoring" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04]">Job Monitor</Link> : null}
              {canApprovals ? <Link href="/approvals" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04]">Approvals</Link> : null}
              {canReports ? <Link href="/reports" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04]">Reports</Link> : null}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}