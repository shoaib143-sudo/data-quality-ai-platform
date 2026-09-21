import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, Compass, Database, Gauge, Radar, ShieldCheck, Wrench } from 'lucide-react'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { WorkspaceEmptyState } from '@/components/app-shell/workspace-empty'
import { JourneyViewTelemetry, TrackedJourneyLink } from '@/components/app-shell/journey-telemetry'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { personas } from '@/lib/governance/personas'
import { canonicalRoutes } from '@/lib/platform/canonical-routes'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }
type Source = { id: string; project_id: string; status: string }
type Readiness = { source_id: string; operational_state: string }
type Dataset = { id: string; project_id: string }
type Version = { id: string; dataset_id: string }
type Run = { id: string; dataset_version_id: string; status: string }
type Finding = { id: string; profile_run_id: string; severity: string }
type Issue = { id: string; project_id: string; status: string; severity: string }
type Rule = { id: string; dataset_id: string; enabled: boolean }
type RuleRun = { id: string; rule_definition_id: string; status: string; passed: boolean | null }

type Step = {
  key: string
  label: string
  detail: string
  complete: boolean
  href: string
  action: string
  icon: typeof Database
}

function normalized(value: unknown) { return String(value ?? '').toUpperCase() }
function unresolved(status: string) { return !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(normalized(status)) }

export default async function JourneysPage() {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const persona = personas[landing.persona]
  const roleWorkflow = persona.nav.filter(item => !item.href.startsWith('/home/'))
  const supabase = await createClient()

  const [projectsResult, sourcesResult, readinessResult, datasetsResult, versionsResult, runsResult, findingsResult, issuesResult, rulesResult, ruleRunsResult] = await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('catalog').from('data_sources').select('id,project_id,status'),
    supabase.schema('catalog').from('source_operational_readiness').select('source_id,operational_state'),
    supabase.schema('catalog').from('datasets').select('id,project_id'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id'),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status').order('started_at', { ascending: false }).limit(500),
    supabase.schema('profiling').from('profile_findings').select('id,profile_run_id,severity').order('created_at', { ascending: false }).limit(1000),
    supabase.schema('governance').from('issues').select('id,project_id,status,severity').order('updated_at', { ascending: false }).limit(1000),
    supabase.schema('profiling').from('quality_rule_definitions').select('id,dataset_id,enabled').eq('enabled', true).limit(1000),
    supabase.schema('profiling').from('quality_rule_runs').select('id,rule_definition_id,status,passed').order('started_at', { ascending: false }).limit(2000),
  ])

  const named = [
    ['projects', projectsResult], ['sources', sourcesResult], ['source readiness', readinessResult],
    ['datasets', datasetsResult], ['dataset versions', versionsResult], ['profiling runs', runsResult],
    ['findings', findingsResult], ['issues', issuesResult], ['quality rules', rulesResult], ['quality rule runs', ruleRunsResult],
  ] as const
  for (const [name, result] of named) if (result.error) throw new Error(`Unable to load guided journey ${name}: ${result.error.message}`)

  const projects = (projectsResult.data ?? []) as Project[]
  const sources = (sourcesResult.data ?? []) as Source[]
  const readiness = (readinessResult.data ?? []) as Readiness[]
  const datasets = (datasetsResult.data ?? []) as Dataset[]
  const versions = (versionsResult.data ?? []) as Version[]
  const runs = (runsResult.data ?? []) as Run[]
  const findings = (findingsResult.data ?? []) as Finding[]
  const issues = (issuesResult.data ?? []) as Issue[]
  const rules = (rulesResult.data ?? []) as Rule[]
  const ruleRuns = (ruleRunsResult.data ?? []) as RuleRun[]

  const readinessBySource = new Map(readiness.map(row => [row.source_id, row.operational_state]))
  const datasetByVersion = new Map(versions.map(version => [version.id, version.dataset_id]))
  const projectByDataset = new Map(datasets.map(dataset => [dataset.id, dataset.project_id]))
  const runProject = new Map<string, string>()
  for (const run of runs) {
    const datasetId = datasetByVersion.get(run.dataset_version_id)
    const projectId = datasetId ? projectByDataset.get(datasetId) : undefined
    if (projectId) runProject.set(run.id, projectId)
  }
  const ruleProject = new Map<string, string>()
  for (const rule of rules) {
    const projectId = projectByDataset.get(rule.dataset_id)
    if (projectId) ruleProject.set(rule.id, projectId)
  }
  const latestRuleRunByRule = new Map<string, RuleRun>()
  for (const run of ruleRuns) if (!latestRuleRunByRule.has(run.rule_definition_id)) latestRuleRunByRule.set(run.rule_definition_id, run)

  const canDatasets = canAccessWorkspace(landing.persona, 'datasets', landing.organizationRole)
  const canDiscovery = canAccessWorkspace(landing.persona, 'discovery', landing.organizationRole)
  const canProfiling = canAccessWorkspace(landing.persona, 'profiling', landing.organizationRole)
  const canIssues = canAccessWorkspace(landing.persona, 'issues', landing.organizationRole)
  const canQuality = canAccessWorkspace(landing.persona, 'data-quality', landing.organizationRole)
  const canScorecards = canAccessWorkspace(landing.persona, 'scorecards', landing.organizationRole)

  function safeHref(preferred: string, fallback = '/catalog') {
    if (preferred.startsWith('/datasets') && canDatasets) return preferred
    if (preferred.startsWith('/catalog/discovery') && canDiscovery) return preferred
    if (preferred.startsWith('/profiling') && canProfiling) return preferred
    if (preferred.startsWith('/issues') && canIssues) return preferred
    if (preferred.startsWith('/data-quality') && canQuality) return preferred
    if (preferred.startsWith('/scorecards') && canScorecards) return preferred
    return fallback
  }

  const journeys = projects.map(project => {
    const projectSources = sources.filter(source => source.project_id === project.id)
    const projectDatasets = datasets.filter(dataset => dataset.project_id === project.id)
    const projectRuns = runs.filter(run => runProject.get(run.id) === project.id)
    const completedRuns = projectRuns.filter(run => normalized(run.status) === 'COMPLETED')
    const latestCompletedRun = completedRuns[0] ?? null
    const projectFindings = latestCompletedRun ? findings.filter(finding => finding.profile_run_id === latestCompletedRun.id) : []
    const highFindings = projectFindings.filter(finding => ['HIGH', 'CRITICAL'].includes(normalized(finding.severity)))
    const openIssues = issues.filter(issue => issue.project_id === project.id && unresolved(issue.status))
    const projectRules = rules.filter(rule => ruleProject.get(rule.id) === project.id)
    const latestRuleRuns = projectRules.map(rule => latestRuleRunByRule.get(rule.id)).filter(Boolean) as RuleRun[]
    const observedSources = projectSources.filter(source => readinessBySource.get(source.id) === 'OBSERVED_READY')
    const qualityVerified = projectRules.length > 0 && latestRuleRuns.length === projectRules.length && latestRuleRuns.every(run => run.passed === true || normalized(run.status) === 'PASSED')
    const remediationComplete = Boolean(latestCompletedRun) && highFindings.length === 0

    const steps: Step[] = [
      {
        key: 'connect', label: 'Connect', icon: Database,
        detail: projectSources.length ? `${projectSources.length} source${projectSources.length === 1 ? '' : 's'} registered` : 'No governed source is registered yet',
        complete: projectSources.length > 0,
        href: safeHref('/datasets'), action: canDatasets ? (projectSources.length ? 'Review sources' : 'Connect source') : 'Review governed data',
      },
      {
        key: 'discover', label: 'Discover', icon: Radar,
        detail: observedSources.length ? `${observedSources.length} source${observedSources.length === 1 ? '' : 's'} observed ready` : 'No governed discovery evidence is currently available',
        complete: observedSources.length > 0 && projectDatasets.length > 0,
        href: safeHref('/catalog/discovery'), action: canDiscovery ? 'Open discovery' : 'Review catalog evidence',
      },
      {
        key: 'profile', label: 'Profile', icon: Gauge,
        detail: completedRuns.length ? `${completedRuns.length} completed profile${completedRuns.length === 1 ? '' : 's'}` : 'No completed profiling evidence is currently available',
        complete: completedRuns.length > 0,
        href: safeHref('/profiling'), action: canProfiling ? 'Open profiling' : 'Review available evidence',
      },
      {
        key: 'remediate', label: 'Remediate', icon: Wrench,
        detail: highFindings.length ? `${highFindings.length} high-priority finding${highFindings.length === 1 ? '' : 's'}; ${openIssues.length} open issue${openIssues.length === 1 ? '' : 's'}` : 'No high-priority profiling findings currently visible',
        complete: completedRuns.length > 0 && remediationComplete,
        href: safeHref('/issues'), action: canIssues ? (highFindings.length ? 'Review remediation' : 'Review findings') : 'Review governed evidence',
      },
      {
        key: 'verify', label: 'Verify controls', icon: ShieldCheck,
        detail: projectRules.length ? `${latestRuleRuns.filter(run => run.passed === true || normalized(run.status) === 'PASSED').length}/${projectRules.length} enabled controls currently passing with latest evidence` : 'No enabled governed quality controls are currently defined',
        complete: qualityVerified,
        href: safeHref('/data-quality/rules'), action: canQuality ? (qualityVerified ? 'Review controls' : 'Verify controls') : 'Review governance evidence',
      },
    ]

    const nextStep = steps.find(step => !step.complete) ?? null
    const completed = steps.filter(step => step.complete).length
    const telemetryStage = (nextStep?.key ?? 'complete').toUpperCase() as 'CONNECT' | 'DISCOVER' | 'PROFILE' | 'REMEDIATE' | 'VERIFY' | 'COMPLETE'
    return { project, steps, nextStep, completed, telemetryStage }
  })

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel={persona.title} contextLabel="Guided governance journeys" homeHref="/home" />

        <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-blue-700"><Compass className="h-4 w-4" /> Guided journey</div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{persona.title} workflow and governed evidence.</h1>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-600">Your role workflow comes from the canonical DataNexus persona contract. Platform evidence is shown separately so technical lifecycle progress is never presented as if it were your personal responsibility.</p>
        </header>

        <section className="mt-6 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-7" aria-labelledby="role-workflow-title">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Your role workflow</p>
          <h2 id="role-workflow-title" className="mt-2 text-2xl font-black">{persona.primaryQuestion}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Focus: {persona.focus}. These are the workspaces DataNexus expects this persona to use in normal governance work.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roleWorkflow.map((item, index) => (
              <Link key={`${item.label}-${item.href}`} href={item.href} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Role task {index + 1}</p>
                <div className="mt-2 flex items-center justify-between gap-3"><span className="font-black">{item.label}</span><ArrowRight className="h-4 w-4 text-blue-600" aria-hidden="true" /></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-6 space-y-5" aria-labelledby="evidence-lifecycle-title">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Platform evidence lifecycle</p>
            <h2 id="evidence-lifecycle-title" className="mt-1 text-2xl font-black">Connected data to verified governance evidence</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">These stages describe persisted platform evidence without claiming certification or completion that has not been proven. They do not imply that your persona is responsible for executing every technical stage.</p>
          </div>
          {journeys.length ? journeys.map(({ project, steps, nextStep, completed, telemetryStage }) => (
            <article key={project.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <JourneyViewTelemetry projectId={project.id} stage={telemetryStage} completedStages={completed} />
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Project evidence</p>
                  <h3 className="mt-1 text-2xl font-black">{project.name}</h3>
                  <p className="mt-2 text-sm text-slate-500">{completed} of {steps.length} evidence stages currently satisfied.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={canonicalRoutes.governanceRun(project.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                    Open Governance Run <ArrowRight className="h-4 w-4" />
                  </Link>
                  {nextStep ? (
                    <TrackedJourneyLink projectId={project.id} stage={telemetryStage} completedStages={completed} href={nextStep.href} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                      {nextStep.action} <ArrowRight className="h-4 w-4" />
                    </TrackedJourneyLink>
                  ) : (
                    <Link href={safeHref('/scorecards', '/reports')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                      Review governance evidence <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-5">
                {steps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <Link key={step.key} href={step.href} className={`rounded-2xl border p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${step.complete ? 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50' : nextStep?.key === step.key ? 'border-blue-300 bg-blue-50 shadow-sm hover:bg-blue-100/70' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`grid h-9 w-9 place-items-center rounded-xl ${step.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-600'}`}><Icon className="h-4 w-4" /></span>
                        {step.complete ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
                      </div>
                      <p className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Evidence stage {index + 1}</p>
                      <p className="mt-1 font-black">{step.label}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{step.detail}</p>
                    </Link>
                  )
                })}
              </div>
            </article>
          )) : (
            <WorkspaceEmptyState
              title="No accessible project journey yet"
              detail="A governed project must exist before DataNexus can derive source, discovery, profiling, remediation, and control evidence. Your role workflow above remains available."
              actionHref={canDiscovery ? '/catalog/discovery' : (roleWorkflow[0]?.href ?? '/home')}
              actionLabel={canDiscovery ? 'Open governed discovery' : (roleWorkflow[0]?.label ?? 'Return home')}
              secondaryHref="/inbox"
              secondaryLabel="Open governance inbox"
              icon={Compass}
            />
          )}
        </section>
      </div>
    </main>
  )
}