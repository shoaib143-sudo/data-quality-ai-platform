import Link from 'next/link'
import { Activity, ArrowLeft, CheckCircle2, Gauge, MousePointerClick, Sparkles, TimerReset } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'

type Project = { id: string; name: string }
type AnalyticsEvent = {
  project_id: string
  event_type: string
  occurred_at: string
  payload: { stage?: string; completedStages?: number; totalStages?: number } | null
}
type Source = { id: string; project_id: string }
type Readiness = { source_id: string; operational_state: string }
type Dataset = { id: string; project_id: string }
type Version = { id: string; dataset_id: string }
type ProfileRun = { id: string; dataset_version_id: string; status: string }
type Issue = { id: string; project_id: string; status: string }
type Rule = { id: string; dataset_id: string; enabled: boolean }
type RuleRun = { id: string; rule_definition_id: string; status: string; passed: boolean | null }

function upper(value: unknown) {
  return String(value ?? '').toUpperCase()
}

function formatDuration(ms: number | null) {
  if (ms === null || ms < 0) return 'Not yet observed'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export default async function ExperienceInsightsPage() {
  await requireUser()
  const supabase = await createClient()

  const { data: projectRows, error: projectError } = await supabase
    .schema('app')
    .from('projects')
    .select('id,name')
    .order('name')
  if (projectError) throw new Error(`Unable to load experience-report projects: ${projectError.message}`)

  const projects = (projectRows ?? []) as Project[]
  const projectIds = projects.map(project => project.id)

  if (!projectIds.length) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <GlobalUtilityBar contextLabel="Experience insights" />
          <section className="rounded-3xl border border-slate-200 bg-white p-9 text-center shadow-sm">
            <Sparkles className="mx-auto h-9 w-9 text-slate-400" />
            <h1 className="mt-4 text-2xl font-black">No accessible projects to report</h1>
            <p className="mt-2 text-sm text-slate-500">Experience reporting appears only for projects available in your governed access scope.</p>
          </section>
        </div>
      </main>
    )
  }

  const admin = createAdminClient()
  // Project ids come only from the caller's RLS-scoped project query above. The service client is used solely because analytics_events is service-only by design.

  const [
    telemetryResult,
    sourcesResult,
    readinessResult,
    datasetsResult,
    versionsResult,
    profileRunsResult,
    issuesResult,
    rulesResult,
    ruleRunsResult,
  ] = await Promise.all([
    admin.schema('orchestration').from('analytics_events')
      .select('project_id,event_type,occurred_at,payload')
      .in('project_id', projectIds)
      .in('event_type', ['UX_JOURNEY_VIEWED', 'UX_JOURNEY_NEXT_ACTION_SELECTED'])
      .order('occurred_at', { ascending: true })
      .limit(5000),
    supabase.schema('catalog').from('data_sources').select('id,project_id').in('project_id', projectIds),
    supabase.schema('catalog').from('source_operational_readiness').select('source_id,operational_state'),
    supabase.schema('catalog').from('datasets').select('id,project_id').in('project_id', projectIds),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id'),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status').order('started_at', { ascending: false }).limit(2000),
    supabase.schema('governance').from('issues').select('id,project_id,status').in('project_id', projectIds).limit(2000),
    supabase.schema('profiling').from('quality_rule_definitions').select('id,dataset_id,enabled').eq('enabled', true).limit(2000),
    supabase.schema('profiling').from('quality_rule_runs').select('id,rule_definition_id,status,passed').order('started_at', { ascending: false }).limit(4000),
  ])

  const named = [
    ['experience telemetry', telemetryResult],
    ['sources', sourcesResult],
    ['source readiness', readinessResult],
    ['datasets', datasetsResult],
    ['dataset versions', versionsResult],
    ['profile runs', profileRunsResult],
    ['issues', issuesResult],
    ['quality rules', rulesResult],
    ['quality rule runs', ruleRunsResult],
  ] as const
  for (const [name, result] of named) {
    if (result.error) throw new Error(`Unable to load ${name}: ${result.error.message}`)
  }

  const telemetry = (telemetryResult.data ?? []) as AnalyticsEvent[]
  const sources = (sourcesResult.data ?? []) as Source[]
  const readiness = (readinessResult.data ?? []) as Readiness[]
  const datasets = (datasetsResult.data ?? []) as Dataset[]
  const versions = (versionsResult.data ?? []) as Version[]
  const profileRuns = (profileRunsResult.data ?? []) as ProfileRun[]
  const issues = (issuesResult.data ?? []) as Issue[]
  const rules = (rulesResult.data ?? []) as Rule[]
  const ruleRuns = (ruleRunsResult.data ?? []) as RuleRun[]

  const readinessBySource = new Map(readiness.map(row => [row.source_id, row.operational_state]))
  const datasetByVersion = new Map(versions.map(row => [row.id, row.dataset_id]))
  const projectByDataset = new Map(datasets.map(row => [row.id, row.project_id]))
  const projectByRun = new Map<string, string>()
  for (const run of profileRuns) {
    const datasetId = datasetByVersion.get(run.dataset_version_id)
    const projectId = datasetId ? projectByDataset.get(datasetId) : undefined
    if (projectId) projectByRun.set(run.id, projectId)
  }
  const projectByRule = new Map<string, string>()
  for (const rule of rules) {
    const projectId = projectByDataset.get(rule.dataset_id)
    if (projectId) projectByRule.set(rule.id, projectId)
  }
  const latestRuleRunByRule = new Map<string, RuleRun>()
  for (const run of ruleRuns) if (!latestRuleRunByRule.has(run.rule_definition_id)) latestRuleRunByRule.set(run.rule_definition_id, run)

  const rows = projects.map(project => {
    const events = telemetry.filter(event => event.project_id === project.id)
    const journeyViews = events.filter(event => event.event_type === 'UX_JOURNEY_VIEWED')
    const nextActions = events.filter(event => event.event_type === 'UX_JOURNEY_NEXT_ACTION_SELECTED')
    const firstInteraction = events.at(0)?.occurred_at ?? null
    const latestInteraction = events.at(-1)?.occurred_at ?? null

    const projectSources = sources.filter(source => source.project_id === project.id)
    const observedReady = projectSources.filter(source => readinessBySource.get(source.id) === 'OBSERVED_READY').length
    const projectDatasets = datasets.filter(dataset => dataset.project_id === project.id)
    const completedProfiles = profileRuns.filter(run => projectByRun.get(run.id) === project.id && upper(run.status) === 'COMPLETED').length
    const openIssues = issues.filter(issue => issue.project_id === project.id && !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(upper(issue.status))).length
    const projectRules = rules.filter(rule => projectByRule.get(rule.id) === project.id)
    const passingRules = projectRules.filter(rule => {
      const latest = latestRuleRunByRule.get(rule.id)
      return Boolean(latest && (latest.passed === true || upper(latest.status) === 'PASSED'))
    }).length

    const evidenceComplete =
      projectSources.length > 0 &&
      observedReady > 0 &&
      projectDatasets.length > 0 &&
      completedProfiles > 0 &&
      projectRules.length > 0 &&
      passingRules === projectRules.length

    const firstCompleteTelemetry = journeyViews.find(event => upper(event.payload?.stage) === 'COMPLETE')?.occurred_at ?? null
    const timeToObservedComplete = evidenceComplete && firstInteraction && firstCompleteTelemetry
      ? new Date(firstCompleteTelemetry).getTime() - new Date(firstInteraction).getTime()
      : null

    return {
      project,
      journeyViews: journeyViews.length,
      nextActions: nextActions.length,
      firstInteraction,
      latestInteraction,
      evidenceComplete,
      observedReady,
      completedProfiles,
      openIssues,
      passingRules,
      ruleCount: projectRules.length,
      timeToObservedComplete,
    }
  })

  const totalViews = rows.reduce((sum, row) => sum + row.journeyViews, 0)
  const totalNextActions = rows.reduce((sum, row) => sum + row.nextActions, 0)
  const evidenceCompleteProjects = rows.filter(row => row.evidenceComplete).length
  const projectsWithTelemetry = rows.filter(row => row.journeyViews + row.nextActions > 0).length

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <GlobalUtilityBar contextLabel="Experience insights" />

        <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <Link href="/reports" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800">
            <ArrowLeft className="h-4 w-4" /> Back to governance reports
          </Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-blue-700">Product experience reporting</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Interaction signals with governance outcome evidence.</h1>
          <p className="mt-4 max-w-4xl leading-7 text-slate-600">
            Interaction telemetry helps explain adoption and friction. Governed source, profiling, remediation, and control evidence remains authoritative for outcome status. These signals are shown together without treating analytics as governance truth.
          </p>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Experience summary">
          {[
            ['Projects with telemetry', projectsWithTelemetry, Activity],
            ['Journey views', totalViews, Gauge],
            ['Next-action selections', totalNextActions, MousePointerClick],
            ['Evidence-complete projects', evidenceCompleteProjects, CheckCircle2],
          ].map(([label, value, Icon]) => {
            const IconComponent = Icon as typeof Activity
            return (
              <article key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <IconComponent className="h-5 w-5 text-blue-600" aria-hidden="true" />
                <p className="mt-4 text-3xl font-black">{String(value)}</p>
                <p className="text-sm font-semibold text-slate-500">{String(label)}</p>
              </article>
            )
          })}
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <h2 className="text-xl font-black">Project experience and outcome matrix</h2>
            <p className="mt-1 text-sm text-slate-500">Telemetry is contextual evidence only. Outcome columns are derived from governed domain state.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-black">Project</th>
                  <th className="px-5 py-3 font-black">Journey activity</th>
                  <th className="px-5 py-3 font-black">Governed evidence</th>
                  <th className="px-5 py-3 font-black">Outcome status</th>
                  <th className="px-5 py-3 font-black">Observed time to complete</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.project.id} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-4">
                      <p className="font-black">{row.project.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.firstInteraction ? `First interaction ${new Date(row.firstInteraction).toLocaleDateString('en-SG')}` : 'No journey telemetry observed'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{row.journeyViews} view{row.journeyViews === 1 ? '' : 's'}</p>
                      <p>{row.nextActions} next-action selection{row.nextActions === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{row.observedReady} observed-ready source{row.observedReady === 1 ? '' : 's'}</p>
                      <p>{row.completedProfiles} completed profile{row.completedProfiles === 1 ? '' : 's'}</p>
                      <p>{row.passingRules}/{row.ruleCount} enabled controls passing</p>
                      <p>{row.openIssues} open issue{row.openIssues === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-5 py-4">
                      {row.evidenceComplete ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="h-4 w-4" /> Evidence complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                          More governed evidence required
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <span className="inline-flex items-center gap-2"><TimerReset className="h-4 w-4" />{formatDuration(row.timeToObservedComplete)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-5 text-xs leading-5 text-slate-500">
          “Evidence complete” is a reporting convenience, not a certification state. It requires at least one registered source, observed-ready source evidence, a dataset, a completed profile, and all currently enabled quality controls to have passing latest evidence. Remediation issues remain visible separately. “Observed time to complete” is shown only when both that governed evidence boundary and a COMPLETE journey interaction have been observed.
        </p>
      </div>
    </main>
  )
}
