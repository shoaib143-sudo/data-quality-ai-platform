import Link from 'next/link'
import { Activity, ArrowRight, BarChart3, CheckCircle2, Clock3, Database, Layers3, ShieldCheck, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { RegisterDatasetForm, type OrganizationOption, type ProjectOption } from './register-dataset-form'
import { JdbcSourceForm } from './jdbc-source-form'
import { SourceActions } from './source-actions'
import { DatasetActions } from './dataset-actions'

type DatasetRow = { id: string; project_id: string; data_source_id: string | null; name: string; description: string | null; source_identifier: string | null; business_domain: string | null; status: string; created_at: string }
type VersionRow = { id: string; dataset_id: string; version_number: number; source_uri: string | null; status: string; created_at: string }
type SourceRow = { id: string; project_id: string; name: string; source_type: string; status: string }
type ExecutionSourceRow = { dataset_version_id: string; source_type: string; source_uri: string | null; active: boolean }
type ProfileRunRow = { id: string; dataset_version_id: string; status: string; row_count: number | null; column_count: number | null; started_at: string | null; completed_at: string | null }
type MembershipRow = { organization_id: string; role: string }
type AgentDefinitionRow = { id: string; agent_key: string; version: string; enabled: boolean }

function statusLabel(status: string | null | undefined) {
  if (!status) return 'N/A'
  return status.replaceAll('_', ' ')
}

function isReady(status: string | null | undefined) {
  return String(status).toUpperCase() === 'ACTIVE'
}

function sourceLifecycleLabel(status: string) {
  return isReady(status) ? 'READY' : 'SETUP REQUIRED'
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

  const [projectsResult, sourcesResult, datasetsResult, versionsResult, membershipsResult, executionSourcesResult, profileRunsResult, agentDefinitionResult] = await Promise.all([
    supabase.schema('app').from('projects').select('id, name').order('name'),
    supabase.schema('catalog').from('data_sources').select('id, project_id, name, source_type, status').order('name'),
    supabase.schema('catalog').from('datasets').select('id, project_id, data_source_id, name, description, source_identifier, business_domain, status, created_at').order('created_at', { ascending: false }),
    supabase.schema('catalog').from('dataset_versions').select('id, dataset_id, version_number, source_uri, status, created_at').order('version_number', { ascending: false }),
    supabase.schema('app').from('organization_members').select('organization_id, role').eq('user_id', user.id),
    supabase.schema('profiling').from('dataset_execution_sources').select('dataset_version_id, source_type, source_uri, active'),
    supabase.schema('profiling').from('profile_runs').select('id, dataset_version_id, status, row_count, column_count, started_at, completed_at').order('started_at', { ascending: false }),
    supabase.schema('agent').from('agent_definitions').select('id, agent_key, version, enabled').eq('agent_key', 'profiling_agent').eq('version', '2.0').eq('enabled', true).maybeSingle(),
  ])

  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  if (sourcesResult.error) throw new Error(`Unable to load data sources: ${sourcesResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load dataset versions: ${versionsResult.error.message}`)
  if (membershipsResult.error) throw new Error(`Unable to load organizations: ${membershipsResult.error.message}`)
  if (executionSourcesResult.error) throw new Error(`Unable to load profiling sources: ${executionSourcesResult.error.message}`)
  if (profileRunsResult.error) throw new Error(`Unable to load profiling runs: ${profileRunsResult.error.message}`)

  const projects = (projectsResult.data ?? []) as ProjectOption[]
  const sources = (sourcesResult.data ?? []) as SourceRow[]
  const datasets = (datasetsResult.data ?? []) as DatasetRow[]
  const versions = (versionsResult.data ?? []) as VersionRow[]
  const executionSources = (executionSourcesResult.data ?? []) as ExecutionSourceRow[]
  const profileRuns = (profileRunsResult.data ?? []) as ProfileRunRow[]
  const memberships = (membershipsResult.data ?? []) as MembershipRow[]
  const agentDefinition = agentDefinitionResult.data as AgentDefinitionRow | null
  const adminOrganizationIds = memberships.filter(m => ['OWNER', 'ADMIN'].includes(String(m.role))).map(m => m.organization_id)
  const organizationsResult = adminOrganizationIds.length > 0
    ? await supabase.schema('app').from('organizations').select('id, name').in('id', adminOrganizationIds).order('name')
    : { data: [], error: null }
  if (organizationsResult.error) throw new Error(`Unable to load organizations: ${organizationsResult.error.message}`)
  const organizations = (organizationsResult.data ?? []) as OrganizationOption[]

  const sourceById = new Map(sources.map(source => [source.id, source]))
  const projectById = new Map(projects.map(project => [project.id, project]))
  const versionsByDataset = new Map<string, VersionRow[]>()
  for (const version of versions) versionsByDataset.set(version.dataset_id, [...(versionsByDataset.get(version.dataset_id) ?? []), version])
  const executionSourceByVersion = new Map(executionSources.map(source => [source.dataset_version_id, source]))
  const latestRunByVersion = new Map<string, ProfileRunRow>()
  for (const run of profileRuns) if (!latestRunByVersion.has(run.dataset_version_id)) latestRunByVersion.set(run.dataset_version_id, run)
  const sourcesByProject = new Map<string, SourceRow[]>()
  for (const source of sources) sourcesByProject.set(source.project_id, [...(sourcesByProject.get(source.project_id) ?? []), source])

  const readySources = sources.filter(source => isReady(source.status)).length
  const setupSources = sources.length - readySources
  const readyDatasets = datasets.filter(dataset => {
    const versionsForDataset = versionsByDataset.get(dataset.id) ?? []
    const latest = versionsForDataset.reduce<VersionRow | undefined>((current, version) => !current || version.version_number > current.version_number ? version : current, undefined)
    const source = dataset.data_source_id ? sourceById.get(dataset.data_source_id) : undefined
    const executionSource = latest ? executionSourceByVersion.get(latest.id) : undefined
    return Boolean(latest?.status === 'AVAILABLE' && executionSource?.active && source && isReady(source.status))
  }).length

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(219,234,254,0.9),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(243,232,255,0.8),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_45%,_#f8fafc_100%)] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/85 px-5 py-3 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-blue-600"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Layers3 className="h-5 w-5" /></span>Data Governance PowerHouse</Link>
            <span className="hidden text-slate-300 sm:inline">/</span>
            <span className="text-sm text-slate-500">Datasets & Connections</span>
          </div>
          <div className="flex gap-2">
            <Link href="/profiling" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50">Profiling Workspace</Link>
            <Link href="/agents" className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700">AI Agents</Link>
          </div>
        </nav>

        <section className="relative overflow-hidden rounded-3xl border border-blue-100 bg-white/90 p-7 shadow-[0_20px_70px_rgba(37,99,235,0.10)] sm:p-9">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-100/70 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-purple-100/70 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"><Sparkles className="h-3.5 w-3.5" /> Simple onboarding, intelligent execution</div>
            <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div className="max-w-3xl"><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Connect your data. Make it ready. <span className="text-blue-600">Profile it.</span></h1><p className="mt-3 text-base leading-7 text-slate-600">A bright, focused workspace for connections and datasets. Keep the lifecycle simple: <strong className="text-slate-800">Setup Required → Ready → Run Profiling</strong>.</p></div>
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><ShieldCheck className="h-5 w-5" /><span><strong>{readySources}</strong> operational connection{readySources === 1 ? '' : 's'}</span></div>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-600 shadow-sm"><Database className="h-5 w-5" /></span><div><div className="text-2xl font-bold">{sources.length}</div><div className="text-xs font-medium text-slate-500">Total connections</div></div></div></div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm"><CheckCircle2 className="h-5 w-5" /></span><div><div className="text-2xl font-bold">{readySources}</div><div className="text-xs font-medium text-slate-500">Ready</div></div></div></div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-amber-600 shadow-sm"><Clock3 className="h-5 w-5" /></span><div><div className="text-2xl font-bold">{setupSources}</div><div className="text-xs font-medium text-slate-500">Setup required</div></div></div></div>
              <div className="rounded-2xl border border-purple-100 bg-purple-50/70 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-purple-600 shadow-sm"><BarChart3 className="h-5 w-5" /></span><div><div className="text-2xl font-bold">{readyDatasets}/{datasets.length}</div><div className="text-xs font-medium text-slate-500">Datasets ready</div></div></div></div>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-blue-100 bg-white p-1 shadow-sm"><div className="rounded-xl bg-gradient-to-br from-blue-50 to-white p-5"><div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-sm"><Database className="h-5 w-5" /></span><div><h2 className="font-semibold">1. Connect a source</h2><p className="text-xs text-slate-500">Save or validate a reusable connection.</p></div></div><JdbcSourceForm projects={projects} organizations={organizations} /></div></div>
          <div className="rounded-2xl border border-purple-100 bg-white p-1 shadow-sm"><div className="rounded-xl bg-gradient-to-br from-purple-50 to-white p-5"><div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-purple-600 text-white shadow-sm"><Layers3 className="h-5 w-5" /></span><div><h2 className="font-semibold">2. Register a dataset</h2><p className="text-xs text-slate-500">Bind a dataset to a validated connection.</p></div></div><RegisterDatasetForm projects={projects} organizations={organizations} sources={sources.map(s => ({ id: s.id, projectId: s.project_id, name: s.name, sourceType: s.source_type, status: s.status }))} /></div></div>
        </section>

        <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-white via-blue-50/40 to-purple-50/40 px-6 py-5 sm:px-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600" /><h2 className="text-xl font-bold">Connections</h2></div><p className="mt-1 text-sm text-slate-500">One simple state model. <strong className="text-slate-700">Ready</strong> means the platform can use the connection.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{sources.length} total</span></div>
          </div>
          {sources.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No connections are registered yet.</div> : <div className="divide-y divide-slate-100">{Array.from(sourcesByProject.entries()).map(([projectId, projectSources]) => <div key={projectId} className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><span className="h-2 w-2 rounded-full bg-blue-500" />{projectById.get(projectId)?.name ?? 'Unknown project'}</div>
            <div className="grid gap-3">{projectSources.map(source => { const ready = isReady(source.status); return <div key={source.id} className={`group flex flex-col gap-4 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${ready ? 'border-emerald-100 bg-emerald-50/30' : 'border-amber-100 bg-amber-50/30'}`}>
              <div className="flex min-w-0 items-center gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${ready ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}><Database className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-slate-900">{source.name}</h3><span className="rounded-md bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm">{sourceTypeLabel(source.source_type)}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{sourceLifecycleLabel(source.status)}</span></div><p className="mt-1 text-xs text-slate-500">{ready ? 'Validated and available for dataset registration and execution.' : 'Saved, but connectivity or required setup is still pending.'}</p></div></div>
              <SourceActions projectId={source.project_id} sourceId={source.id} status={source.status} />
            </div> })}</div>
          </div>)}</div>}
        </section>

        <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-white via-purple-50/30 to-blue-50/40 px-6 py-5 sm:px-7"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-purple-600" /><h2 className="text-xl font-bold">Datasets</h2></div><p className="mt-1 text-sm text-slate-500">Only a dataset with a usable connection and available version becomes <strong className="text-slate-700">Ready</strong>.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{datasets.length} total</span></div></div>
          {datasets.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No datasets are registered yet.</div> : <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">{datasets.map(dataset => {
            const datasetVersions = versionsByDataset.get(dataset.id) ?? []
            const latest = datasetVersions.reduce<VersionRow | undefined>((current, version) => !current || version.version_number > current.version_number ? version : current, undefined)
            const source = dataset.data_source_id ? sourceById.get(dataset.data_source_id) : undefined
            const executionSource = latest ? executionSourceByVersion.get(latest.id) : undefined
            const latestRun = latest ? latestRunByVersion.get(latest.id) : undefined
            const profilingReady = Boolean(latest && latest.status === 'AVAILABLE' && executionSource?.active && source?.status === 'ACTIVE')
            return <article key={dataset.id} className={`overflow-hidden rounded-2xl border ${profilingReady ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white' : 'border-amber-200 bg-gradient-to-br from-amber-50/50 to-white'}`}>
              <div className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${profilingReady ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}><Layers3 className="h-5 w-5" /></span><div className="min-w-0"><h3 className="truncate font-bold text-slate-900">{dataset.name}</h3><p className="mt-0.5 truncate text-xs text-slate-500">{dataset.description || 'No description provided.'}</p></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${profilingReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{profilingReady ? 'READY' : 'SETUP REQUIRED'}</span></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white/80 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Connection</div><div className="mt-1 truncate text-sm font-semibold text-slate-700">{source?.name ?? 'Unbound'}</div></div><div className="rounded-xl bg-white/80 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Version</div><div className="mt-1 text-sm font-semibold text-slate-700">{latest ? `v${latest.version_number}` : 'None'} <span className="font-normal text-slate-400">· {statusLabel(latest?.status)}</span></div></div><div className="rounded-xl bg-white/80 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Object</div><div className="mt-1 truncate text-sm font-semibold text-slate-700">{dataset.source_identifier || latest?.source_uri || 'N/A'}</div></div><div className="rounded-xl bg-white/80 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Latest run</div><div className="mt-1 text-sm font-semibold text-slate-700">{latestRun ? statusLabel(latestRun.status) : 'Not run'}{latestRun?.row_count !== null && latestRun?.row_count !== undefined ? <span className="font-normal text-slate-400"> · {latestRun.row_count.toLocaleString()} rows</span> : null}</div></div></div>
                {dataset.business_domain ? <div className="mt-3 text-xs text-slate-500">Domain <span className="font-medium text-slate-700">{dataset.business_domain}</span></div> : null}
              </div>
              <div className="flex min-h-14 items-center justify-between gap-3 border-t border-slate-100 bg-white/70 px-5 py-3"><div className="flex items-center gap-2 text-xs text-slate-500">{profilingReady ? <><CheckCircle2 className="h-4 w-4 text-emerald-500" />Ready to profile</> : <><Clock3 className="h-4 w-4 text-amber-500" />Finish setup to profile</>}</div>{latest ? <DatasetActions projectId={dataset.project_id} datasetVersionId={latest.id} agentDefinitionId={agentDefinition?.id ?? null} ready={profilingReady} /> : null}</div>
            </article>
          })}</div>}
        </section>

        <section className="mt-7 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white shadow-lg shadow-blue-200/40 sm:p-7"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2 text-sm font-semibold text-blue-100"><Sparkles className="h-4 w-4" /> Ready for data insights</div><h2 className="mt-1 text-xl font-bold">Your shortest path to quality intelligence</h2><p className="mt-1 max-w-2xl text-sm text-blue-100">Make one connection ready, bind a dataset, then let the profiling agent discover schema, metrics, findings, and quality signals.</p></div><Link href="/profiling" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50">Open profiling workspace <ArrowRight className="h-4 w-4" /></Link></div></section>
      </div>
    </main>
  )
}
