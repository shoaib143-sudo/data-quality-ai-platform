import Link from 'next/link'
import { Activity, ArrowRight, BarChart3, CheckCircle2, Clock3, Database, Layers3, ShieldCheck, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { RegisterDatasetForm, type OrganizationOption, type ProjectOption } from './register-dataset-form'
import { JdbcSourceForm } from './jdbc-source-form'
import { SourceActions } from './source-actions'
import { DatasetActions } from './dataset-actions'
import { dataGovernanceSuperAdminOrganizationIds } from '@/lib/auth/data-governance-super-admin'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'

type DatasetRow = { id: string; project_id: string; data_source_id: string | null; name: string; description: string | null; source_identifier: string | null; business_domain: string | null; status: string; created_at: string }
type VersionRow = { id: string; dataset_id: string; version_number: number; source_uri: string | null; status: string; created_at: string }
type SourceRow = { id: string; project_id: string; name: string; source_type: string; status: string }
type SourceReadinessRow = { source_id: string; operational_state: string; has_observation_evidence: boolean; current_assets: number; latest_run_status: string | null; evidence_reason: string }
type ExecutionSourceRow = { dataset_version_id: string; source_type: string; source_uri: string | null; active: boolean }
type ProfileRunRow = { id: string; dataset_version_id: string; status: string; row_count: number | null; column_count: number | null; started_at: string | null; completed_at: string | null }
type MembershipRow = { organization_id: string; role: string }
type AgentDefinitionRow = { id: string; agent_key: string; version: string; enabled: boolean }

function statusLabel(status: string | null | undefined) {
  if (!status) return 'N/A'
  return status.replaceAll('_', ' ')
}

function isLifecycleActive(status: string | null | undefined) {
  return String(status).toUpperCase() === 'ACTIVE'
}

function sourceLifecycleLabel(status: string) {
  return statusLabel(status).toUpperCase()
}

function readinessTone(state: string) {
  if (state === 'OBSERVED_READY') return 'bg-emerald-100 text-emerald-700'
  if (state === 'DISCOVERY_IN_PROGRESS') return 'bg-blue-100 text-blue-700'
  if (state === 'LAST_DISCOVERY_FAILED' || state === 'EVIDENCE_INCONSISTENT') return 'bg-red-100 text-red-700'
  if (state === 'OBSERVED_EMPTY') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-600'
}

function sourceTypeLabel(type: string) {
  const value = String(type).toUpperCase()
  if (value === 'JDBC') return 'JDBC'
  if (value === 'CSV') return 'CSV'
  if (value === 'FILE') return 'FILE'
  return value
}

export default async function DatasetsPage() {
  const user = await requireUser()
  const supabase = await createClient()
  const [governanceSuperAdminOrganizationIds, landing] = await Promise.all([
    dataGovernanceSuperAdminOrganizationIds(user.id),
    resolveLandingAccess(user.id),
  ])

  const [projectsResult, sourcesResult, readinessResult, datasetsResult, versionsResult, membershipsResult, executionSourcesResult, profileRunsResult, agentDefinitionResult] = await Promise.all([
    supabase.schema('app').from('projects').select('id, name').order('name'),
    supabase.schema('catalog').from('data_sources').select('id, project_id, name, source_type, status').order('name'),
    supabase.schema('catalog').from('source_operational_readiness').select('source_id, operational_state, has_observation_evidence, current_assets, latest_run_status, evidence_reason'),
    supabase.schema('catalog').from('datasets').select('id, project_id, data_source_id, name, description, source_identifier, business_domain, status, created_at').order('created_at', { ascending: false }),
    supabase.schema('catalog').from('dataset_versions').select('id, dataset_id, version_number, source_uri, status, created_at').order('version_number', { ascending: false }),
    supabase.schema('app').from('organization_members').select('organization_id, role').eq('user_id', user.id),
    supabase.schema('profiling').from('dataset_execution_sources').select('dataset_version_id, source_type, source_uri, active').eq('active', true),
    supabase.schema('profiling').from('profile_runs').select('id, dataset_version_id, status, row_count, column_count, started_at, completed_at').order('started_at', { ascending: false }),
    supabase.schema('agent').from('agent_definitions').select('id, agent_key, version, enabled').eq('agent_key', 'profiling_agent').eq('version', '2.0').eq('enabled', true).maybeSingle(),
  ])

  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  if (sourcesResult.error) throw new Error(`Unable to load data sources: ${sourcesResult.error.message}`)
  if (readinessResult.error) throw new Error(`Unable to load source operational readiness: ${readinessResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load dataset versions: ${versionsResult.error.message}`)
  if (membershipsResult.error) throw new Error(`Unable to load organizations: ${membershipsResult.error.message}`)
  if (executionSourcesResult.error) throw new Error(`Unable to load profiling sources: ${executionSourcesResult.error.message}`)
  if (profileRunsResult.error) throw new Error(`Unable to load profiling runs: ${profileRunsResult.error.message}`)

  const projects = (projectsResult.data ?? []) as ProjectOption[]
  const sources = (sourcesResult.data ?? []) as SourceRow[]
  const readiness = (readinessResult.data ?? []) as SourceReadinessRow[]
  const datasets = (datasetsResult.data ?? []) as DatasetRow[]
  const versions = (versionsResult.data ?? []) as VersionRow[]
  const executionSources = (executionSourcesResult.data ?? []) as ExecutionSourceRow[]
  const profileRuns = (profileRunsResult.data ?? []) as ProfileRunRow[]
  const memberships = (membershipsResult.data ?? []) as MembershipRow[]
  const agentDefinition = agentDefinitionResult.data as AgentDefinitionRow | null
  const adminOrganizationIds = memberships.filter(m => ['OWNER', 'ADMIN'].includes(String(m.role))).map(m => m.organization_id)
  const projectCreationOrganizationIds = [...new Set([...adminOrganizationIds, ...governanceSuperAdminOrganizationIds])]
  const organizationsResult = projectCreationOrganizationIds.length > 0
    ? await supabase.schema('app').from('organizations').select('id, name').in('id', projectCreationOrganizationIds).order('name')
    : { data: [], error: null }
  if (organizationsResult.error) throw new Error(`Unable to load organizations: ${organizationsResult.error.message}`)
  const organizations = (organizationsResult.data ?? []) as OrganizationOption[]
  const canDiscovery = canAccessWorkspace(landing.persona, 'discovery', landing.organizationRole)

  const sourceById = new Map(sources.map(source => [source.id, source]))
  const readinessBySource = new Map(readiness.map(row => [row.source_id, row]))
  const projectById = new Map(projects.map(project => [project.id, project]))
  const versionsByDataset = new Map<string, VersionRow[]>()
  for (const version of versions) versionsByDataset.set(version.dataset_id, [...(versionsByDataset.get(version.dataset_id) ?? []), version])
  const executionSourceByVersion = new Map(executionSources.map(source => [source.dataset_version_id, source]))
  const latestRunByVersion = new Map<string, ProfileRunRow>()
  for (const run of profileRuns) if (!latestRunByVersion.has(run.dataset_version_id)) latestRunByVersion.set(run.dataset_version_id, run)
  const sourcesByProject = new Map<string, SourceRow[]>()
  for (const source of sources) sourcesByProject.set(source.project_id, [...(sourcesByProject.get(source.project_id) ?? []), source])

  const activeLifecycleSources = sources.filter(source => isLifecycleActive(source.status)).length
  const configuredLifecycleSources = sources.filter(source => String(source.status).toUpperCase() === 'CONFIGURED').length
  const observedReadySources = readiness.filter(row => row.operational_state === 'OBSERVED_READY').length
  const unobservedSources = readiness.filter(row => row.operational_state === 'UNOBSERVED').length
  const readyDatasets = datasets.filter(dataset => {
    const versionsForDataset = versionsByDataset.get(dataset.id) ?? []
    const latest = versionsForDataset.reduce<VersionRow | undefined>((current, version) => !current || version.version_number > current.version_number ? version : current, undefined)
    const source = dataset.data_source_id ? sourceById.get(dataset.data_source_id) : undefined
    const executionSource = latest ? executionSourceByVersion.get(latest.id) : undefined
    return Boolean(latest?.status === 'AVAILABLE' && executionSource?.active && source && isLifecycleActive(source.status))
  }).length

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#050b17] text-slate-100">
      <div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Sources & Datasets" contextLabel="Onboarding and profiling readiness" homeHref="/home" />
        <nav aria-label="Dataset workspaces" className="mb-4 mt-4 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-white/[0.08] bg-[#09192d] px-5 py-3">
          <Link href="/profiling" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-300/25 hover:text-white">Profiling Workspace</Link>
          <Link href="/journeys" className="rounded-xl border border-violet-300/15 bg-violet-300/[0.05] px-3 py-2 text-sm font-semibold text-violet-200 transition hover:border-violet-300/30">Governance Runs</Link>
        </nav>

        <section className="relative overflow-hidden rounded-[28px] border border-cyan-300/12 bg-[#09192d] p-7 shadow-[0_24px_70px_rgba(0,0,0,.26)] sm:p-8">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/[0.08] blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-violet-500/[0.06] blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-black text-cyan-200"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Simple onboarding, evidence-backed operation</div>
            <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px] xl:items-center">
              <div className="max-w-4xl">
                <h1 className="text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">Connect your data. Observe it. <span className="text-cyan-300">Profile it.</span></h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">Connection lifecycle records configuration state. Operational readiness comes from governed discovery evidence. Profiling readiness is proven separately by an executable dataset version.</p>
              </div>
              <div className="rounded-3xl border border-emerald-300/15 bg-emerald-300/[0.055] p-5">
                <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true"/>
                <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300/70">Observed ready now</p>
                <p className="mt-1 text-4xl font-black text-white">{observedReadySources}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Source{observedReadySources === 1 ? '' : 's'} backed by current governed discovery evidence.</p>
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.07] bg-[#061321] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-blue-300/15 bg-blue-300/[0.06] text-blue-300"><Database className="h-5 w-5" aria-hidden="true"/></span><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-600">1 · Configure</p><p className="text-sm font-bold text-slate-100">{sources.length} source{sources.length===1?'':'s'} registered</p></div></div><p className="mt-3 text-xs leading-5 text-slate-500">Save connection authority without pretending that configuration proves operational access.</p></div>
              <div className="rounded-2xl border border-white/[0.07] bg-[#061321] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-300"><Activity className="h-5 w-5" aria-hidden="true"/></span><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-600">2 · Observe</p><p className="text-sm font-bold text-slate-100">{observedReadySources} observed ready</p></div></div><p className="mt-3 text-xs leading-5 text-slate-500">Discovery must produce current evidence and physical catalog assets before readiness is claimed.</p></div>
              <div className="rounded-2xl border border-white/[0.07] bg-[#061321] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/15 bg-violet-300/[0.06] text-violet-300"><BarChart3 className="h-5 w-5" aria-hidden="true"/></span><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-600">3 · Profile</p><p className="text-sm font-bold text-slate-100">{readyDatasets}/{datasets.length} executable</p></div></div><p className="mt-3 text-xs leading-5 text-slate-500">An available version plus an active execution binding proves profiling execution readiness.</p></div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">Lifecycle active: {activeLifecycleSources}</span>
              <span className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">Lifecycle configured: {configuredLifecycleSources}</span>
              <span className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">Unobserved: {unobservedSources}</span>
              <span className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">ACTIVE is not treated as proof of discovery observation.</span>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-blue-300/15 bg-[#09192d] p-1 shadow-[0_10px_28px_rgba(0,0,0,.18)]"><div className="rounded-xl bg-[#07182a] p-5"><div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-sm"><Database className="h-5 w-5" /></span><div><h2 className="font-semibold">1. Connect a source</h2><p className="text-xs text-slate-500">Save or validate a reusable connection. Discovery evidence is established separately.</p></div></div><JdbcSourceForm projects={projects} organizations={organizations} canOpenDiscovery={canDiscovery} /></div></div>
          <div id="register-dataset" className="scroll-mt-24 rounded-2xl border border-violet-300/15 bg-[#09192d] p-1 shadow-[0_10px_28px_rgba(0,0,0,.18)]"><div className="rounded-xl bg-[#07182a] p-5"><div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-purple-600 text-white shadow-sm"><Layers3 className="h-5 w-5" /></span><div><h2 className="font-semibold">2. Register a dataset</h2><p className="text-xs text-slate-500">Bind a dataset to a configured source. Execution readiness is validated separately.</p></div></div><RegisterDatasetForm projects={projects} organizations={organizations} sources={sources.map(s => ({ id: s.id, projectId: s.project_id, name: s.name, sourceType: s.source_type, status: s.status }))} /></div></div>
        </section>

        <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-white via-blue-50/40 to-purple-50/40 px-6 py-5 sm:px-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600" /><h2 className="text-xl font-bold">Connections</h2></div><p className="mt-1 text-sm text-slate-500">Lifecycle is configuration authority. Operational state below comes only from governed discovery evidence and never rewrites lifecycle.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{sources.length} total</span></div>
          </div>
          {sources.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No connections are registered yet.</div> : <div className="divide-y divide-slate-100">{Array.from(sourcesByProject.entries()).map(([projectId, projectSources]) => <div key={projectId} className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><span className="h-2 w-2 rounded-full bg-blue-500" />{projectById.get(projectId)?.name ?? 'Unknown project'}</div>
            <div className="grid gap-3">{projectSources.map(source => {
              const operational = readinessBySource.get(source.id)
              const operationalState = operational?.operational_state ?? 'UNOBSERVED'
              const observedReady = operationalState === 'OBSERVED_READY'
              return <div key={source.id} className={`group flex flex-col gap-4 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${observedReady ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-200 bg-slate-50/30'}`}>
              <div className="flex min-w-0 items-center gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${observedReady ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}><Database className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-slate-900">{source.name}</h3><span className="rounded-md bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm">{sourceTypeLabel(source.source_type)}</span><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">Lifecycle: {sourceLifecycleLabel(source.status)}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${readinessTone(operationalState)}`}>Operational: {statusLabel(operationalState)}</span></div><p className="mt-1 text-xs text-slate-500">{operational?.evidence_reason ?? 'No governed discovery observation evidence is available yet.'}</p><p className="mt-1 text-[11px] text-slate-400">Current physical assets: {operational?.current_assets ?? 0} · Latest discovery: {statusLabel(operational?.latest_run_status)}</p></div></div>
              <SourceActions projectId={source.project_id} sourceId={source.id} status={source.status} />
            </div> })}</div>
          </div>)}</div>}
        </section>

        <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-white via-purple-50/30 to-blue-50/40 px-6 py-5 sm:px-7"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-purple-600" /><h2 className="text-xl font-bold">Datasets</h2></div><p className="mt-1 text-sm text-slate-500">Profiling executable means an available dataset version has an active execution binding to an active configured source. It does not claim source observation authority.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{datasets.length} total</span></div></div>
          {datasets.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No datasets are registered yet.</div> : <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">{datasets.map(dataset => {
            const datasetVersions = versionsByDataset.get(dataset.id) ?? []
            const latest = datasetVersions.reduce<VersionRow | undefined>((current, version) => !current || version.version_number > current.version_number ? version : current, undefined)
            const source = dataset.data_source_id ? sourceById.get(dataset.data_source_id) : undefined
            const sourceReadiness = source ? readinessBySource.get(source.id) : undefined
            const executionSource = latest ? executionSourceByVersion.get(latest.id) : undefined
            const latestRun = latest ? latestRunByVersion.get(latest.id) : undefined
            const profilingReady = Boolean(latest && latest.status === 'AVAILABLE' && executionSource?.active && source?.status === 'ACTIVE')
            return <article key={dataset.id} className={`overflow-hidden rounded-2xl border ${profilingReady ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white' : 'border-amber-200 bg-gradient-to-br from-amber-50/50 to-white'}`}>
              <div className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${profilingReady ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}><Layers3 className="h-5 w-5" /></span><div className="min-w-0"><h3 className="truncate font-bold text-slate-900">{dataset.name}</h3><p className="mt-0.5 truncate text-xs text-slate-500">{dataset.description || 'No description provided.'}</p></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${profilingReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{profilingReady ? 'PROFILING EXECUTABLE' : 'EXECUTION SETUP REQUIRED'}</span></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white/80 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Connection</div><div className="mt-1 truncate text-sm font-semibold text-slate-700">{source?.name ?? 'Unbound'}</div><div className="mt-1 text-[10px] text-slate-400">Lifecycle {sourceLifecycleLabel(source?.status ?? 'UNBOUND')} · Operational {statusLabel(sourceReadiness?.operational_state ?? 'UNOBSERVED')}</div></div><div className="rounded-xl bg-white/80 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Version</div><div className="mt-1 text-sm font-semibold text-slate-700">{latest ? `v${latest.version_number}` : 'None'} <span className="font-normal text-slate-400">· {statusLabel(latest?.status)}</span></div></div><div className="rounded-xl bg-white/80 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Object</div><div className="mt-1 truncate text-sm font-semibold text-slate-700">{dataset.source_identifier || latest?.source_uri || 'N/A'}</div></div><div className="rounded-xl bg-white/80 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Latest run</div><div className="mt-1 text-sm font-semibold text-slate-700">{latestRun ? statusLabel(latestRun.status) : 'Not run'}{latestRun?.row_count !== null && latestRun?.row_count !== undefined ? <span className="font-normal text-slate-400"> · {latestRun.row_count.toLocaleString()} rows</span> : null}</div></div></div>
                {dataset.business_domain ? <div className="mt-3 text-xs text-slate-500">Domain <span className="font-medium text-slate-700">{dataset.business_domain}</span></div> : null}
              </div>
              <div className="flex min-h-14 items-center justify-between gap-3 border-t border-slate-100 bg-white/70 px-5 py-3"><div className="flex items-center gap-2 text-xs text-slate-500">{profilingReady ? <><CheckCircle2 className="h-4 w-4 text-emerald-500" />Execution prerequisites satisfied</> : <><Clock3 className="h-4 w-4 text-amber-500" />Finish execution setup</>}</div>{latest ? <DatasetActions projectId={dataset.project_id} datasetId={dataset.id} datasetVersionId={latest.id} agentDefinitionId={agentDefinition?.id ?? null} ready={profilingReady} /> : null}</div>
            </article>
          })}</div>}
        </section>

        <section className="mt-7 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white shadow-lg shadow-blue-200/40 sm:p-7"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2 text-sm font-semibold text-blue-100"><Sparkles className="h-4 w-4" /> Ready for data insights</div><h2 className="mt-1 text-xl font-bold">Your shortest path to quality intelligence</h2><p className="mt-1 max-w-2xl text-sm text-blue-100">Configure a source, establish discovery evidence, bind a dataset, then let the profiling agent discover schema, metrics, findings, and quality signals.</p></div><Link href="/profiling" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50">Open profiling workspace <ArrowRight className="h-4 w-4" /></Link></div></section>
      </div>
    </main>
  )
}