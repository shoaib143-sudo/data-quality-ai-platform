'use client'

import { FormEvent, useMemo, useState } from 'react'

export type ProjectOption = { id: string; name: string }
export type SourceOption = { id: string; projectId: string; name: string; sourceType: string; status: string }

export function RegisterDatasetForm({ projects, sources }: { projects: ProjectOption[]; sources: SourceOption[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [sourceId, setSourceId] = useState('')
  const [name, setName] = useState('')
  const [sourceIdentifier, setSourceIdentifier] = useState('')
  const [description, setDescription] = useState('')
  const [businessDomain, setBusinessDomain] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [profiling, setProfiling] = useState(false)
  const [profilingTarget, setProfilingTarget] = useState<{ projectId: string; datasetVersionId: string; agentDefinitionId: string } | null>(null)

  const projectSources = useMemo(() => sources.filter((source) => source.projectId === projectId), [sources, projectId])

  function changeProject(value: string) {
    setProjectId(value)
    setSourceId(sources.find((source) => source.projectId === value)?.id ?? '')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setStatus(null)
    setProfilingTarget(null)
    if (!projectId || !sourceId || !name.trim() || !sourceIdentifier.trim()) {
      setStatus('Project, source, dataset name, and source identifier are required.')
      return
    }
    setRunning(true)
    try {
      const response = await fetch('/api/datasets/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sourceId, name, sourceIdentifier, description, businessDomain }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Dataset registration failed.')
      setStatus(`Registered ${payload.dataset.name} v${payload.version.version_number}. Profiling source is ready.`)
      setProfilingTarget({ projectId, datasetVersionId: payload.version.id, agentDefinitionId: payload.agentDefinitionId })
      setName(''); setSourceIdentifier(''); setDescription(''); setBusinessDomain('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Dataset registration failed.')
    } finally { setRunning(false) }
  }

  async function runProfiling() {
    if (!profilingTarget) return
    setProfiling(true)
    setStatus('Profiling dataset. Running schema/profile metrics and quality scoring…')
    try {
      const response = await fetch('/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilingTarget),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Profiling execution failed.')
      const score = payload.result?.metrics?.score?.overall_score
      setStatus(`Profiling completed. ${payload.result?.metrics?.metrics_persisted ?? 0} metrics, ${payload.result?.metrics?.findings_persisted ?? 0} findings persisted${typeof score === 'number' ? ` · quality score ${(score * 100).toFixed(1)}%` : ''}.`)
      setProfilingTarget(null)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Profiling execution failed.')
    } finally { setProfiling(false) }
  }

  return (
    <section className="rounded-xl border p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Register a profiling dataset</h2>
        <p className="mt-1 text-sm text-muted-foreground">Create the dataset, its first version, the executable profiling source, then start the existing Profiling Agent 2.0.</p>
      </div>
      {projects.length === 0 ? <p className="text-sm text-muted-foreground">No projects are available for dataset registration.</p> :
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm"><span className="font-medium">Project</span><select value={projectId} onChange={e => changeProject(e.target.value)} disabled={running || profiling} className="w-full rounded-md border bg-background px-3 py-2">{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="space-y-2 text-sm"><span className="font-medium">Data source</span><select value={sourceId} onChange={e => setSourceId(e.target.value)} disabled={running || profiling || projectSources.length === 0} className="w-full rounded-md border bg-background px-3 py-2"><option value="">Select a source</option>{projectSources.map(s => <option key={s.id} value={s.id}>{s.name} · {s.sourceType}</option>)}</select><span className="text-xs text-muted-foreground">Only active sources already connected above are listed here. To use PostgreSQL, SQL Server, MySQL, Databricks, Generic JDBC, or another CSV source, connect and save it in the source section above first.</span></label>
          <label className="space-y-2 text-sm"><span className="font-medium">Dataset name</span><input value={name} onChange={e => setName(e.target.value)} disabled={running || profiling} placeholder="Customer master" className="w-full rounded-md border bg-background px-3 py-2" /></label>
          <label className="space-y-2 text-sm"><span className="font-medium">Source identifier</span><input value={sourceIdentifier} onChange={e => setSourceIdentifier(e.target.value)} disabled={running || profiling} placeholder="public.customers or file URI" className="w-full rounded-md border bg-background px-3 py-2" /></label>
          <label className="space-y-2 text-sm"><span className="font-medium">Business domain</span><input value={businessDomain} onChange={e => setBusinessDomain(e.target.value)} disabled={running || profiling} placeholder="Customer" className="w-full rounded-md border bg-background px-3 py-2" /></label>
          <label className="space-y-2 text-sm"><span className="font-medium">Description</span><input value={description} onChange={e => setDescription(e.target.value)} disabled={running || profiling} placeholder="Purpose and business context" className="w-full rounded-md border bg-background px-3 py-2" /></label>
          <div className="md:col-span-2"><button type="submit" disabled={running || profiling || !sourceId} className="rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">{running ? 'Registering…' : 'Register dataset'}</button></div>
        </form>}
      {profilingTarget && (
        <div className="mt-5 rounded-lg border p-4">
          <p className="text-sm font-medium">Dataset is profiling-ready</p>
          <p className="mt-1 text-sm text-muted-foreground">Start the production Profiling Agent 2.0 to execute schema discovery, metrics, findings, and quality scoring.</p>
          <button type="button" onClick={runProfiling} disabled={profiling} className="mt-3 rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">{profiling ? 'Profiling…' : 'Run profiling'}</button>
        </div>
      )}
      {status && <p className="mt-4 rounded-md border p-3 text-sm" role="status">{status}</p>}
    </section>
  )
}
