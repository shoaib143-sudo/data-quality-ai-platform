'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertTriangle, Database, FolderCog, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export type CleanupProject = {
  id: string
  organizationId: string
  organizationName: string
  name: string
  description: string
}

export type CleanupSource = {
  id: string
  project_id: string
  name: string
  source_type: string
  status: string
}

export type CleanupDataset = {
  id: string
  project_id: string
  data_source_id: string | null
  name: string
  business_domain: string | null
  status: string
}

type Props = {
  projects: CleanupProject[]
  sources: CleanupSource[]
  datasets: CleanupDataset[]
}

type DeleteTarget = { kind: 'PROJECT' | 'SOURCE' | 'DATASET'; id: string; name: string } | null

export function CleanupConsole({ projects, sources, datasets }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [confirmation, setConfirmation] = useState('')
  const [projectEdits, setProjectEdits] = useState<Record<string, { name: string; description: string }>>(
    () => Object.fromEntries(projects.map(project => [project.id, { name: project.name, description: project.description }]))
  )

  const sourceByProject = useMemo(() => {
    const map = new Map<string, CleanupSource[]>()
    for (const source of sources) map.set(source.project_id, [...(map.get(source.project_id) ?? []), source])
    return map
  }, [sources])

  const datasetByProject = useMemo(() => {
    const map = new Map<string, CleanupDataset[]>()
    for (const dataset of datasets) map.set(dataset.project_id, [...(map.get(dataset.project_id) ?? []), dataset])
    return map
  }, [datasets])

  const normalized = query.trim().toLowerCase()
  const visibleProjects = projects.filter(project => {
    if (!normalized) return true
    const projectText = `${project.organizationName} ${project.name} ${project.description}`.toLowerCase()
    const sourceMatch = (sourceByProject.get(project.id) ?? []).some(source => `${source.name} ${source.source_type} ${source.status}`.toLowerCase().includes(normalized))
    const datasetMatch = (datasetByProject.get(project.id) ?? []).some(dataset => `${dataset.name} ${dataset.business_domain ?? ''} ${dataset.status}`.toLowerCase().includes(normalized))
    return projectText.includes(normalized) || sourceMatch || datasetMatch
  })

  async function saveProject(project: CleanupProject) {
    const edit = projectEdits[project.id]
    if (!edit?.name.trim()) return
    setBusyKey(`project:${project.id}:save`)
    setError(false)
    setMessage('Saving project changes…')
    try {
      const response = await fetch('/api/admin/cleanup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'PROJECT', id: project.id, name: edit.name.trim(), description: edit.description.trim() }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to update project.')
      setMessage('Project updated.')
      router.refresh()
    } catch (e) {
      setError(true)
      setMessage(e instanceof Error ? e.message : 'Unable to update project.')
    } finally {
      setBusyKey(null)
    }
  }

  async function deleteObject() {
    if (!deleteTarget || confirmation !== deleteTarget.name) return
    const key = `${deleteTarget.kind}:${deleteTarget.id}:delete`
    setBusyKey(key)
    setError(false)
    setMessage(`Deleting ${deleteTarget.name}…`)
    try {
      const response = await fetch('/api/admin/cleanup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...deleteTarget, confirmation }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const details = Array.isArray(payload.blockers) && payload.blockers.length ? ` ${payload.blockers.join('; ')}` : ''
        throw new Error(`${payload.error ?? 'Permanent deletion was blocked.'}${details}`)
      }
      setMessage(`${deleteTarget.name} permanently deleted.`)
      setDeleteTarget(null)
      setConfirmation('')
      router.refresh()
    } catch (e) {
      setError(true)
      setMessage(e instanceof Error ? e.message : 'Permanent deletion failed.')
    } finally {
      setBusyKey(null)
    }
  }

  function openDelete(target: NonNullable<DeleteTarget>) {
    setDeleteTarget(target)
    setConfirmation('')
    setError(false)
    setMessage(null)
  }

  return <>
    <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-violet-700">
            <ShieldCheck className="h-4 w-4" /> Data Governance Admin · Super Admin
          </div>
          <h1 className="mt-4 text-3xl font-black">Governed cleanup console</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Create, rename, configure and permanently remove DataNexus-owned projects, data sources and datasets. Permanent delete is exclusive to Data Governance Admin and remains blocked by active jobs, immutable evidence, or governed dependencies.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/datasets" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> Create project, source or dataset</Link>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex gap-3"><FolderCog className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Folder and subfolder note:</strong> the current source hierarchy represents external database/catalog/schema objects, not DataNexus-owned folders. Those objects remain read-only here so cleanup cannot accidentally delete source-system structures.</div></div>
      </div>
    </header>

    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black">Owned catalog hierarchy</h2>
          <p className="text-xs text-slate-500">{projects.length} projects · {sources.length} sources · {datasets.length} datasets</p>
        </div>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects, sources or datasets…" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400 sm:max-w-sm" />
      </div>

      {message ? <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message}</div> : null}

      <div className="mt-5 space-y-5">
        {visibleProjects.map(project => {
          const projectSources = sourceByProject.get(project.id) ?? []
          const projectDatasets = datasetByProject.get(project.id) ?? []
          const edit = projectEdits[project.id] ?? { name: project.name, description: project.description }
          return <article key={project.id} className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="bg-slate-50 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(280px,2fr)]">
                  <label className="text-xs font-semibold text-slate-600">Project name
                    <input value={edit.name} onChange={event => setProjectEdits(current => ({ ...current, [project.id]: { ...edit, name: event.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Description
                    <input value={edit.description} onChange={event => setProjectEdits(current => ({ ...current, [project.id]: { ...edit, description: event.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[11px] text-slate-500">{project.organizationName}</span>
                  <button type="button" disabled={busyKey !== null} onClick={() => void saveProject(project)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{busyKey === `project:${project.id}:save` ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />} Save project</button>
                  <button type="button" disabled={busyKey !== null} onClick={() => openDelete({ kind: 'PROJECT', id: project.id, name: project.name })} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete project</button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">{projectSources.length} source(s) · {projectDatasets.length} dataset(s). A project must be emptied before permanent deletion.</p>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black">Data sources</h3><span className="text-[11px] text-slate-500">{projectSources.length}</span></div>
                <div className="space-y-2">
                  {projectSources.length ? projectSources.map(source => <div key={source.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <Database className="h-4 w-4 shrink-0 text-blue-500" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{source.name}</p><p className="text-[11px] text-slate-500">{source.source_type} · {source.status}</p></div>
                    <Link href={`/datasets/edit/${source.id}`} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Edit</Link>
                    <button type="button" disabled={busyKey !== null} onClick={() => openDelete({ kind: 'SOURCE', id: source.id, name: source.name })} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Delete</button>
                  </div>) : <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">No data sources.</div>}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black">Datasets</h3><span className="text-[11px] text-slate-500">{projectDatasets.length}</span></div>
                <div className="space-y-2">
                  {projectDatasets.length ? projectDatasets.map(dataset => <div key={dataset.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <Database className="h-4 w-4 shrink-0 text-emerald-500" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{dataset.name}</p><p className="truncate text-[11px] text-slate-500">{dataset.business_domain || 'Unassigned domain'} · {dataset.status}</p></div>
                    <Link href={`/datasets/dataset/${dataset.id}/edit`} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Edit</Link>
                    <button type="button" disabled={busyKey !== null} onClick={() => openDelete({ kind: 'DATASET', id: dataset.id, name: dataset.name })} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Delete</button>
                  </div>) : <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">No datasets.</div>}
                </div>
              </div>
            </div>
          </article>
        })}
      </div>
    </section>

    {deleteTarget ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700"><AlertTriangle className="h-5 w-5" /></span><div><h2 className="text-lg font-black">Permanent {deleteTarget.kind.toLowerCase()} deletion</h2><p className="mt-1 text-sm leading-6 text-slate-600">This action is restricted to Data Governance Admin Super Admin. Governed dependencies are checked again on the server before anything is removed.</p></div></div>
        <label className="mt-5 block text-xs font-semibold text-slate-700">Type <span className="font-black text-rose-700">{deleteTarget.name}</span> to confirm
          <input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-rose-400" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busyKey !== null} onClick={() => { setDeleteTarget(null); setConfirmation('') }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Cancel</button>
          <button type="button" disabled={busyKey !== null || confirmation !== deleteTarget.name} onClick={() => void deleteObject()} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busyKey ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Permanently delete</button>
        </div>
      </div>
    </div> : null}
  </>
}
