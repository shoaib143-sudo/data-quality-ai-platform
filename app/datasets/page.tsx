import Link from 'next/link'
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

function sourceLifecycleLabel(status: string) {
  return String(status).toUpperCase() === 'ACTIVE' ? 'READY' : 'SETUP REQUIRED'
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

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm underline">← Back to dashboard</Link>
          <div className="flex gap-2"><Link href="/profiling" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Profiling Workspace</Link><Link href="/agents" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">AI Agents</Link></div>
        </div>
        <header><h1 className="text-3xl font-semibold">Datasets</h1><p className="mt-2 text-muted-foreground">Connect once, register a dataset, then run profiling. Connection readiness and dataset readiness are the only lifecycle states exposed here.</p></header>

        <JdbcSourceForm projects={projects} organizations={organizations} />
        <RegisterDatasetForm projects={projects} organizations={organizations} sources={sources.map(s => ({ id: s.id, projectId: s.project_id, name: s.name, sourceType: s.source_type, status: s.status }))} />

        <section className="rounded-xl border p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Connections</h2><p className="mt-1 text-sm text-muted-foreground">One connection record per source. READY means the platform has validated it and can use it.</p></div><span className="rounded-full border px-3 py-1 text-xs">{sources.length} connections</span></div>
          {sources.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">No connections are registered yet.</p> :
            <div className="mt-5 space-y-5">{Array.from(sourcesByProject.entries()).map(([projectId, projectSources]) => <div key={projectId}>
              <div className="mb-2 text-sm font-medium">{projectById.get(projectId)?.name ?? 'Unknown project'}</div>
              <div className="divide-y rounded-lg border">{projectSources.map(source => <div key={source.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{source.name}</h3><span className="rounded-full border px-2 py-0.5 text-xs">{source.source_type}</span><span className="rounded-full border px-2 py-0.5 text-xs">{sourceLifecycleLabel(source.status)}</span></div><p className="mt-1 text-xs text-muted-foreground">{String(source.status).toUpperCase() === 'ACTIVE' ? 'Ready for dataset registration and execution.' : 'Saved, but connectivity or required source setup is still pending.'}</p></div><SourceActions projectId={source.project_id} sourceId={source.id} status={source.status} /></div>)}</div>
            </div>)}</div>}
        </section>

        <section className="rounded-xl border p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Datasets</h2><p className="mt-1 text-sm text-muted-foreground">A dataset becomes READY when its selected connection and source object are usable. READY datasets can be profiled directly.</p></div><span className="rounded-full border px-3 py-1 text-xs">{datasets.length} datasets</span></div>
          {datasets.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">No datasets are registered yet.</p> :
            <div className="mt-5 space-y-3">{datasets.map(dataset => {
              const datasetVersions = versionsByDataset.get(dataset.id) ?? []
              const latest = datasetVersions.reduce<VersionRow | undefined>((current, version) => !current || version.version_number > current.version_number ? version : current, undefined)
              const source = dataset.data_source_id ? sourceById.get(dataset.data_source_id) : undefined
              const executionSource = latest ? executionSourceByVersion.get(latest.id) : undefined
              const latestRun = latest ? latestRunByVersion.get(latest.id) : undefined
              const profilingReady = Boolean(latest && latest.status === 'AVAILABLE' && executionSource?.active && source?.status === 'ACTIVE')
              return <div key={dataset.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><h3 className="font-medium">{dataset.name}</h3><p className="mt-1 text-sm text-muted-foreground">{dataset.description || 'No description provided.'}</p></div><span className="rounded-full border px-2 py-1 text-xs">{profilingReady ? 'READY' : 'SETUP REQUIRED'}</span></div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3"><span>Connection: {source?.name ?? 'Unbound'}</span><span>Version: {latest ? `v${latest.version_number}` : 'None'}</span><span>Version status: {statusLabel(latest?.status)}</span></div>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-3"><span>Source readiness: {source ? sourceLifecycleLabel(source.status) : 'N/A'}</span><span>Dataset readiness: {profilingReady ? 'READY' : 'SETUP REQUIRED'}</span><span>Latest run: {latestRun ? `${statusLabel(latestRun.status)}${latestRun.row_count !== null ? ` · ${latestRun.row_count} rows` : ''}` : 'Not run'}</span></div>
                <div className="mt-2 text-xs text-muted-foreground">Object: {dataset.source_identifier || latest?.source_uri || 'N/A'}{dataset.business_domain ? ` · ${dataset.business_domain}` : ''}</div>
                {latest ? <DatasetActions projectId={dataset.project_id} datasetVersionId={latest.id} agentDefinitionId={agentDefinition?.id ?? null} ready={profilingReady} /> : null}
              </div>
            })}</div>}
        </section>
      </div>
    </main>
  )
}
