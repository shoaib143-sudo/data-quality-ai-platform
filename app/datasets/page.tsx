import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { RegisterDatasetForm, type ProjectOption, type SourceOption } from './register-dataset-form'

type DatasetRow = { id: string; project_id: string; data_source_id: string | null; name: string; description: string | null; source_identifier: string | null; business_domain: string | null; status: string; created_at: string }
type VersionRow = { id: string; dataset_id: string; version_number: number; source_uri: string | null; status: string; created_at: string }
type SourceRow = { id: string; project_id: string; name: string; source_type: string; status: string }

export default async function DatasetsPage() {
  await requireUser()
  const supabase = await createClient()

  const [projectsResult, sourcesResult, datasetsResult, versionsResult] = await Promise.all([
    supabase.schema('app').from('projects').select('id, name').order('name'),
    supabase.schema('catalog').from('data_sources').select('id, project_id, name, source_type, status').eq('status', 'ACTIVE').order('name'),
    supabase.schema('catalog').from('datasets').select('id, project_id, data_source_id, name, description, source_identifier, business_domain, status, created_at').order('created_at', { ascending: false }),
    supabase.schema('catalog').from('dataset_versions').select('id, dataset_id, version_number, source_uri, status, created_at').order('version_number', { ascending: false }),
  ])

  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  if (sourcesResult.error) throw new Error(`Unable to load data sources: ${sourcesResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load dataset versions: ${versionsResult.error.message}`)

  const projects = (projectsResult.data ?? []) as ProjectOption[]
  const sources = (sourcesResult.data ?? []) as SourceRow[]
  const datasets = (datasetsResult.data ?? []) as DatasetRow[]
  const versions = (versionsResult.data ?? []) as VersionRow[]
  const sourceById = new Map(sources.map(source => [source.id, source]))
  const versionsByDataset = new Map<string, VersionRow[]>()
  for (const version of versions) versionsByDataset.set(version.dataset_id, [...(versionsByDataset.get(version.dataset_id) ?? []), version])

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm underline">← Back to dashboard</Link>
          <div className="flex gap-2"><Link href="/profiling" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Profiling Workspace</Link><Link href="/agents" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">AI Agents</Link></div>
        </div>
        <header><h1 className="text-3xl font-semibold">Datasets</h1><p className="mt-2 text-muted-foreground">Register governed datasets and establish the profiling-ready execution handoff.</p></header>
        <RegisterDatasetForm projects={projects} sources={sources.map(s => ({ id: s.id, projectId: s.project_id, name: s.name, sourceType: s.source_type, status: s.status }))} />

        <section className="rounded-xl border p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Registered datasets</h2><p className="mt-1 text-sm text-muted-foreground">Dataset identity, source binding, and version readiness.</p></div><span className="rounded-full border px-3 py-1 text-xs">{datasets.length} datasets</span></div>
          {datasets.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">No datasets are registered yet.</p> :
            <div className="mt-5 space-y-3">{datasets.map(dataset => {
              const datasetVersions = versionsByDataset.get(dataset.id) ?? []
              const latest = datasetVersions[0]
              const source = dataset.data_source_id ? sourceById.get(dataset.data_source_id) : undefined
              return <div key={dataset.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><h3 className="font-medium">{dataset.name}</h3><p className="mt-1 text-sm text-muted-foreground">{dataset.description || 'No description provided.'}</p></div><span className="rounded-full border px-2 py-1 text-xs">{dataset.status}</span></div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-4"><span>Source: {source?.name ?? 'Unbound'}</span><span>Type: {source?.source_type ?? 'N/A'}</span><span>Version: {latest ? `v${latest.version_number}` : 'None'}</span><span>Version status: {latest?.status ?? 'N/A'}</span></div>
                <div className="mt-2 text-xs text-muted-foreground">Identifier: {dataset.source_identifier || 'N/A'}{dataset.business_domain ? ` · Domain: ${dataset.business_domain}` : ''}</div>
              </div>
            })}</div>}
        </section>
      </div>
    </main>
  )
}
