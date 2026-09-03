'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

export type ProjectOption = { id: string; name: string }
export type OrganizationOption = { id: string; name: string }
export type SourceOption = { id: string; projectId: string; name: string; sourceType: string; status: string }

const CREATE_PROJECT = '__create_project__'
type ProjectMode = 'existing' | 'create'

export function RegisterDatasetForm({ projects, organizations, sources }: { projects: ProjectOption[]; organizations: OrganizationOption[]; sources: SourceOption[] }) {
  const router = useRouter()
  const [availableProjects, setAvailableProjects] = useState(projects)
  const [availableSources, setAvailableSources] = useState(sources)
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [projectMode, setProjectMode] = useState<ProjectMode>('existing')
  const [sourceId, setSourceId] = useState('')
  const [name, setName] = useState('')
  const [sourceIdentifier, setSourceIdentifier] = useState('')
  const [description, setDescription] = useState('')
  const [businessDomain, setBusinessDomain] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(organizations[0]?.id ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [profiling, setProfiling] = useState(false)
  const [profilingTarget, setProfilingTarget] = useState<{ projectId: string; datasetVersionId: string; agentDefinitionId: string } | null>(null)

  const projectSources = useMemo(() => availableSources.filter((source) => projectMode === 'existing' && source.projectId === projectId && ['ACTIVE', 'CONFIGURED'].includes(String(source.status).toUpperCase())), [availableSources, projectId, projectMode])
  const canCreateProject = organizations.length > 0

  useEffect(() => {
    setAvailableProjects(current => {
      const merged = [...current]
      for (const project of projects) if (!merged.some(item => item.id === project.id)) merged.push(project)
      return merged.sort((a, b) => a.name.localeCompare(b.name))
    })
    setAvailableSources(current => {
      const merged = [...current]
      for (const source of sources) {
        const index = merged.findIndex(item => item.id === source.id)
        if (index >= 0) merged[index] = source
        else merged.push(source)
      }
      return merged.sort((a, b) => a.name.localeCompare(b.name))
    })
  }, [projects, sources])

  useEffect(() => {
    if (!availableProjects.length) { setProjectId(''); setProjectMode('create'); setSourceId(''); return }
    if (projectId && availableProjects.some(project => project.id === projectId)) return
    setProjectId(availableProjects[0].id); setProjectMode('existing'); setSourceId('')
  }, [availableProjects, projectId])

  useEffect(() => {
    if (projectMode !== 'existing') return
    if (!projectSources.length) { setSourceId(''); return }
    if (!sourceId || !projectSources.some(source => source.id === sourceId)) setSourceId(projectSources[0].id)
  }, [projectMode, projectSources, sourceId])

  useEffect(() => {
    function onProjectCreated(event: Event) {
      const project = (event as CustomEvent<ProjectOption>).detail
      if (!project?.id || !project?.name) return
      setAvailableProjects(current => current.some(item => item.id === project.id) ? current : [...current, project].sort((a, b) => a.name.localeCompare(b.name)))
      setProjectId(project.id); setProjectMode('existing'); setSourceId('')
    }
    function onSourceCreated(event: Event) {
      const source = (event as CustomEvent<SourceOption>).detail
      if (!source?.id || !source?.projectId || !source?.name || !['ACTIVE', 'CONFIGURED'].includes(String(source.status).toUpperCase())) return
      setAvailableSources(current => [...current.filter(item => item.id !== source.id), source].sort((a, b) => a.name.localeCompare(b.name)))
      setProjectId(source.projectId); setProjectMode('existing'); setSourceId(source.id)
      setStatus(`Source ${source.name} is available and selected for dataset registration.`)
      router.refresh()
    }
    window.addEventListener('dgp:project-created', onProjectCreated)
    window.addEventListener('dgp:source-created', onSourceCreated)
    return () => { window.removeEventListener('dgp:project-created', onProjectCreated); window.removeEventListener('dgp:source-created', onSourceCreated) }
  }, [router])

  function changeProject(value: string) {
    if (value === CREATE_PROJECT) { setProjectMode('create'); setSourceId(''); setStatus(null); return }
    if (!value) return
    setProjectMode('existing'); setProjectId(value)
    setSourceId(availableSources.find(source => source.projectId === value && ['ACTIVE', 'CONFIGURED'].includes(String(source.status).toUpperCase()))?.id ?? '')
    setStatus(null)
  }

  async function createProject() {
    setStatus(null)
    if (!selectedOrganizationId || !newProjectName.trim()) { setStatus('Organization and project name are required.'); return }
    setCreatingProject(true)
    try {
      const response = await fetch('/api/datasets/create-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: selectedOrganizationId, name: newProjectName, description: newProjectDescription }) })
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Project creation failed.')
      const project: ProjectOption = { id: payload.project.id, name: payload.project.name }
      setAvailableProjects(current => [...current.filter(item => item.id !== project.id), project].sort((a, b) => a.name.localeCompare(b.name)))
      setProjectId(project.id); setProjectMode('existing'); setSourceId(''); setNewProjectName(''); setNewProjectDescription('')
      window.dispatchEvent(new CustomEvent('dgp:project-created', { detail: project }))
      setStatus(`Project ${project.name} created. Connect and save a data source above before registering a dataset.`); router.refresh()
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Project creation failed.') } finally { setCreatingProject(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus(null); setProfilingTarget(null)
    const form = new FormData(event.currentTarget)
    const submittedProjectId = String(form.get('projectId') ?? '').trim() || projectId
    const submittedSourceId = String(form.get('sourceId') ?? '').trim() || sourceId
    const submittedName = String(form.get('name') ?? '').trim()
    const submittedSourceIdentifier = String(form.get('sourceIdentifier') ?? '').trim()
    const submittedDescription = String(form.get('description') ?? '').trim()
    const submittedBusinessDomain = String(form.get('businessDomain') ?? '').trim()
    if (!submittedProjectId || submittedProjectId === CREATE_PROJECT || !submittedSourceId || !submittedName || !submittedSourceIdentifier) { setStatus('Select an existing project, select a data source, then enter dataset name and source identifier.'); return }
    setRunning(true)
    try {
      const response = await fetch('/api/datasets/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: submittedProjectId, sourceId: submittedSourceId, name: submittedName, sourceIdentifier: submittedSourceIdentifier, description: submittedDescription, businessDomain: submittedBusinessDomain }) })
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? payload.source_validation?.errors?.join(' ') ?? 'Dataset registration failed.')
      const profilingReady = payload.profiling_ready === true
      setStatus(profilingReady
        ? `Registered ${payload.dataset.name} v${payload.version.version_number}. Profiling source is ready.`
        : `Registered ${payload.dataset.name} v${payload.version.version_number}. Dataset is saved, but profiling is not ready yet: ${payload.source_validation?.warnings?.at(-1) ?? 'validate the source before profiling.'}`)
      if (profilingReady && payload.agentDefinitionId) setProfilingTarget({ projectId: submittedProjectId, datasetVersionId: payload.version.id, agentDefinitionId: payload.agentDefinitionId })
      else setProfilingTarget(null)
      setName(''); setSourceIdentifier(''); setDescription(''); setBusinessDomain(''); router.refresh()
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Dataset registration failed.') } finally { setRunning(false) }
  }

  async function runProfiling() {
    if (!profilingTarget) return
    setProfiling(true); setStatus('Profiling dataset. Running schema/profile metrics and quality scoring…')
    try {
      const response = await fetch('/api/agents/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profilingTarget) })
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Profiling execution failed.')
      const score = payload.result?.metrics?.score?.overall_score
      setStatus(`Profiling completed. ${payload.result?.metrics?.metrics_persisted ?? 0} metrics, ${payload.result?.metrics?.findings_persisted ?? 0} findings persisted${typeof score === 'number' ? ` · quality score ${(score * 100).toFixed(1)}%` : ''}.`)
      setProfilingTarget(null); router.refresh()
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Profiling execution failed.'); router.refresh() } finally { setProfiling(false) }
  }

  return <section className="rounded-xl border p-6">
    <div className="mb-5"><h2 className="text-lg font-semibold">Register a profiling dataset</h2><p className="mt-1 text-sm text-muted-foreground">Create the dataset, its first version, the executable profiling source, then start the existing Profiling Agent 2.0.</p></div>
    {availableProjects.length === 0 ? <p className="text-sm text-muted-foreground">No projects are available for dataset registration.</p> :
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 text-sm"><label className="space-y-2 block"><span className="font-medium">Project</span><select name="projectId" value={projectMode === 'create' ? CREATE_PROJECT : projectId} onChange={e => changeProject(e.target.value)} disabled={running || profiling || creatingProject} className="w-full rounded-md border bg-background px-3 py-2"><option value="">Select an existing project</option>{availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}{canCreateProject && <option value={CREATE_PROJECT}>＋ Create new project…</option>}</select></label>
          {projectMode === 'create' && canCreateProject && <div className="rounded-lg border p-3 space-y-3"><p className="text-xs text-muted-foreground">Creating a project does not change your selected existing project. You can switch back to it at any time from the dropdown.</p><label className="space-y-1 block"><span className="text-xs font-medium">Organization</span><select value={selectedOrganizationId} onChange={e => setSelectedOrganizationId(e.target.value)} disabled={creatingProject} className="w-full rounded-md border bg-background px-3 py-2">{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label className="space-y-1 block"><span className="text-xs font-medium">New project name</span><input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} disabled={creatingProject} placeholder="Finance Data Quality" autoFocus className="w-full rounded-md border bg-background px-3 py-2" /></label><label className="space-y-1 block"><span className="text-xs text-muted-foreground">Description</span><input value={newProjectDescription} onChange={e => setNewProjectDescription(e.target.value)} disabled={creatingProject} placeholder="Optional project description" className="w-full rounded-md border bg-background px-3 py-2" /></label><div className="flex gap-2"><button type="button" onClick={() => void createProject()} disabled={creatingProject || !newProjectName.trim()} className="rounded-md border px-3 py-2 text-xs font-medium disabled:opacity-50">{creatingProject ? 'Creating…' : 'Create project'}</button><button type="button" onClick={() => { setProjectMode('existing'); setSourceId(''); setNewProjectName(''); setNewProjectDescription(''); setStatus(null) }} disabled={creatingProject} className="rounded-md border px-3 py-2 text-xs">Cancel</button></div></div>}
        </div>
        <label className="space-y-2 text-sm"><span className="font-medium">Data source</span><select name="sourceId" value={sourceId} onChange={e => setSourceId(e.target.value)} disabled={running || profiling || projectSources.length === 0} className="w-full rounded-md border bg-background px-3 py-2"><option value="">{projectSources.length ? 'Select a source' : 'Connect a source first'}</option>{projectSources.map(s => <option key={s.id} value={s.id}>{s.name} · {s.sourceType}{String(s.status).toUpperCase() === 'CONFIGURED' ? ' · saved connection' : ''}</option>)}</select><span className="text-xs text-muted-foreground">Active sources and saved configured connections for the selected project are available. A configured JDBC connection is activated automatically when dataset registration validates its schema and table.</span></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Dataset name</span><input name="name" value={name} onChange={e => setName(e.target.value)} disabled={running || profiling} placeholder="Customer master" /></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Source identifier</span><input name="sourceIdentifier" value={sourceIdentifier} onChange={e => setSourceIdentifier(e.target.value)} disabled={running || profiling} placeholder="public.customers or file URI" /></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Business domain</span><input name="businessDomain" value={businessDomain} onChange={e => setBusinessDomain(e.target.value)} disabled={running || profiling} placeholder="Customer" /></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Description</span><input name="description" value={description} onChange={e => setDescription(e.target.value)} disabled={running || profiling} placeholder="Purpose and business context" /></label>
        <div className="md:col-span-2"><button type="submit" disabled={running || profiling} className="rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">{running ? 'Registering…' : 'Register dataset'}</button></div>
      </form>}
    {profilingTarget && <div className="mt-5 rounded-lg border p-4"><p className="text-sm font-medium">Dataset is profiling-ready</p><p className="mt-1 text-sm text-muted-foreground">Start the production Profiling Agent 2.0 to execute schema discovery, metrics, findings, and quality scoring.</p><button type="button" onClick={runProfiling} disabled={profiling} className="mt-3 rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">{profiling ? 'Profiling…' : 'Run profiling'}</button></div>}
    {status && <p className="mt-4 rounded-md border p-3 text-sm" role="status">{status}</p>}
  </section>
}