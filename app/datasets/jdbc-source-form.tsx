'use client'

import { useEffect, useMemo, useState } from 'react'

export type JdbcProjectOption = { id: string; name: string }
export type JdbcOrganizationOption = { id: string; name: string }
type ConnectionKind = 'csv' | 'postgresql' | 'mssql' | 'mysql' | 'databricks' | 'jdbc'
type ConnectionOption = { id: ConnectionKind; label: string; description: string; placeholder: string }

type SourceEvent = { id: string; projectId: string; name: string; sourceType: string; status: string }
const CREATE_PROJECT = '__create_project__'
const CONNECTIONS: ConnectionOption[] = [
  { id: 'csv', label: 'CSV File', description: 'CSV file from an HTTPS URL or Supabase Storage object', placeholder: 'https://host/path/data.csv or bucket/path/data.csv' },
  { id: 'postgresql', label: 'PostgreSQL', description: 'PostgreSQL / Supabase databases', placeholder: 'jdbc:postgresql://host:5432/database' },
  { id: 'mssql', label: 'Microsoft SQL Server', description: 'SQL Server / Azure SQL', placeholder: 'jdbc:sqlserver://host:1433;databaseName=database' },
  { id: 'mysql', label: 'MySQL', description: 'MySQL-compatible databases', placeholder: 'jdbc:mysql://host:3306/database' },
  { id: 'databricks', label: 'Databricks Unity Catalog', description: 'Catalog, schema and table onboarding', placeholder: 'jdbc:databricks://host:443/default' },
  { id: 'jdbc', label: 'Generic JDBC', description: 'Any supported JDBC driver endpoint', placeholder: 'jdbc:<driver>://host:port/database' },
]

export function JdbcSourceForm({ projects, organizations }: { projects: JdbcProjectOption[]; organizations: JdbcOrganizationOption[] }) {
  const [availableProjects, setAvailableProjects] = useState(projects)
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [connectionKind, setConnectionKind] = useState<ConnectionKind>('postgresql')
  const [name, setName] = useState('')
  const [jdbcUrl, setJdbcUrl] = useState('')
  const [schema, setSchema] = useState('')
  const [table, setTable] = useState('')
  const [schemas, setSchemas] = useState<string[]>([])
  const [tables, setTables] = useState<Array<{ name: string; type?: string | null }>>([])
  const [columns, setColumns] = useState<Array<{ name: string; type?: string | null }>>([])
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [connectionTested, setConnectionTested] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(organizations[0]?.id ?? '')
  const selectedConnection = useMemo(() => CONNECTIONS.find(item => item.id === connectionKind) ?? CONNECTIONS[1], [connectionKind])
  const isCsv = connectionKind === 'csv'
  const selectedTable = useMemo(() => tables.find(item => item.name === table), [tables, table])

  useEffect(() => {
    const onProjectCreated = (event: Event) => {
      const project = (event as CustomEvent<JdbcProjectOption>).detail
      if (!project?.id || !project?.name) return
      setAvailableProjects(current => current.some(item => item.id === project.id) ? current : [...current, project].sort((a, b) => a.name.localeCompare(b.name)))
    }
    window.addEventListener('dgp:project-created', onProjectCreated)
    return () => window.removeEventListener('dgp:project-created', onProjectCreated)
  }, [])

  function selectConnection(value: ConnectionKind) {
    setConnectionKind(value); setJdbcUrl(''); setSchema(''); setTable(''); setSchemas([]); setTables([]); setColumns([]); setRowCount(null); setConnectionTested(false); setStatus(null)
  }
  function selectProject(value: string) {
    if (value === CREATE_PROJECT) { setCreateProjectOpen(true); setStatus(null); return }
    setProjectId(value); setSchemas([]); setTables([]); setColumns([]); setRowCount(null); setConnectionTested(false); setStatus(null)
  }
  async function createProject() {
    setStatus(null)
    if (!selectedOrganizationId || !newProjectName.trim()) { setStatus('Organization and project name are required.'); return }
    setCreatingProject(true)
    try {
      const response = await fetch('/api/datasets/create-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: selectedOrganizationId, name: newProjectName, description: newProjectDescription }) })
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Project creation failed.')
      const project: JdbcProjectOption = { id: payload.project.id, name: payload.project.name }
      setAvailableProjects(current => [...current.filter(item => item.id !== project.id), project].sort((a, b) => a.name.localeCompare(b.name)))
      setProjectId(project.id); setCreateProjectOpen(false); setNewProjectName(''); setNewProjectDescription('')
      window.dispatchEvent(new CustomEvent('dgp:project-created', { detail: project })); setStatus(`Project ${project.name} created and selected.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Project creation failed.') } finally { setCreatingProject(false) }
  }
  async function discover() {
    setStatus(null); setColumns([]); setRowCount(null); setConnectionTested(false)
    if (!projectId || !jdbcUrl.trim()) { setStatus(isCsv ? 'Enter a CSV URL or storage path first.' : 'Enter the connection string first. Database credentials are managed server-side.'); return }
    setBusy(true)
    try {
      if (isCsv) {
        const response = await fetch('/api/datasets/source/discover-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceUri: jdbcUrl.trim() }) })
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'CSV discovery failed.')
        setSchemas(['CSV']); setSchema('CSV'); setTables(payload.tables ?? []); setColumns(payload.columns ?? []); setRowCount(typeof payload.rowCount === 'number' ? payload.rowCount : null); setConnectionTested(true); setStatus(`CSV source validated. Found ${payload.columns?.length ?? 0} columns${typeof payload.rowCount === 'number' ? ` and ${payload.rowCount} rows` : ''}.`); return
      }
      const response = await fetch('/api/datasets/source/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, jdbcUrl, connectionKind, schema: schema || undefined }) })
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Connection discovery failed.')
      setSchemas(payload.schemas ?? []); setTables(payload.tables ?? []); setConnectionTested(true); setStatus(`Connection successful. Found ${(payload.schemas ?? []).length} schemas${schema ? ` and ${(payload.tables ?? []).length} tables/views in ${schema}` : ''}.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Connection discovery failed.') } finally { setBusy(false) }
  }
  async function inspectTable(value: string) {
    setTable(value); setColumns([]); setRowCount(null); setStatus(null)
    if (isCsv || !schema || !value) return
    setBusy(true)
    try {
      const response = await fetch('/api/datasets/source/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, jdbcUrl, connectionKind, schema }) })
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Table discovery failed.')
      if (!(payload.tables ?? []).some((item: { name: string }) => item.name === value)) throw new Error('Selected table is no longer available.')
      setConnectionTested(true); setStatus(`Selected ${schema}.${value}. Save the connection or activate it after validation.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Table discovery failed.') } finally { setBusy(false) }
  }
  function dispatchSource(source: { id?: string; project_id?: string; name?: string; source_type?: string; status?: string }) {
    if (!source.id || !source.project_id || !source.name || !source.source_type || !source.status) throw new Error('The source was saved but the returned source record is incomplete.')
    const detail: SourceEvent = { id: source.id, projectId: source.project_id, name: source.name, sourceType: source.source_type, status: source.status }
    window.dispatchEvent(new CustomEvent('dgp:source-created', { detail }))
  }
  async function saveConnection() {
    setStatus(null)
    if (!projectId || !name.trim() || !jdbcUrl.trim()) { setStatus('Project, connection name, and connection string are required.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/datasets/source/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name, sourceType: 'JDBC', jdbcUrl, connectionKind, connectionOnly: true }) })
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Connection save failed.')
      dispatchSource(payload.source)
      setStatus('Connection saved as configured and added to the dataset source selector. Select it there, then provide schema.table when registering the dataset.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Connection save failed.') } finally { setBusy(false) }
  }
  async function register() {
    setStatus(null)
    if (!projectId || !name.trim() || !jdbcUrl.trim() || (!isCsv && (!schema || !table))) { setStatus(isCsv ? 'Project, connection name, and CSV URL/storage path are required.' : 'Project, connection name, connection string, schema, and table are required.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/datasets/source/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name, sourceType: isCsv ? 'CSV' : 'JDBC', jdbcUrl: isCsv ? undefined : jdbcUrl, sourceUri: isCsv ? jdbcUrl : undefined, connectionKind, schema: isCsv ? 'CSV' : schema, table: isCsv ? undefined : table }) })
      const payload = await response.json(); if (!response.ok) throw new Error(payload.validation?.errors?.join(' ') || payload.error || 'Source registration failed.')
      setColumns(payload.validation?.details?.columns ?? payload.validation?.columns ?? []); setRowCount(typeof payload.validation?.rowCount === 'number' ? payload.validation.rowCount : null); setConnectionTested(true)
      dispatchSource(payload.source)
      setStatus(isCsv ? `CSV source saved and is profiling-ready: ${jdbcUrl}.` : `Connection saved and source is profiling-ready: ${schema}.${table}${typeof payload.validation?.rowCount === 'number' ? ` · ${payload.validation.rowCount} rows` : ''}.`)
      setName('')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Source registration failed.') } finally { setBusy(false) }
  }
  const canActivate = isCsv ? connectionTested : connectionTested && !!schema && !!table

  return <section className="rounded-xl border p-6">
    <div className="mb-6"><h2 className="text-lg font-semibold">Connect a data source</h2><p className="mt-1 text-sm text-muted-foreground">Choose the source type from one dropdown. Database credentials are managed securely by the server. CSV sources can be validated directly.</p></div>
    {availableProjects.length === 0 ? <p className="text-sm text-muted-foreground">No projects are available.</p> : <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 text-sm"><label className="space-y-2 block"><span className="font-medium">Project</span><select value={createProjectOpen ? CREATE_PROJECT : projectId} onChange={e => selectProject(e.target.value)} disabled={busy || creatingProject} className="w-full rounded-md border bg-background px-3 py-2">{availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}{organizations.length > 0 && <option value={CREATE_PROJECT}>＋ Create new project…</option>}</select></label>
        {createProjectOpen && organizations.length > 0 && <div className="rounded-lg border p-3 space-y-3"><label className="space-y-1 block"><span className="text-xs font-medium">Organization</span><select value={selectedOrganizationId} onChange={e => setSelectedOrganizationId(e.target.value)} disabled={creatingProject} className="w-full rounded-md border bg-background px-3 py-2">{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label className="space-y-1 block"><span className="text-xs font-medium">New project name</span><input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} disabled={creatingProject} placeholder="Finance Data Quality" className="w-full rounded-md border bg-background px-3 py-2" /></label><label className="space-y-1 block"><span className="text-xs font-medium">Description</span><input value={newProjectDescription} onChange={e => setNewProjectDescription(e.target.value)} disabled={creatingProject} placeholder="Optional project description" className="w-full rounded-md border bg-background px-3 py-2" /></label><div className="flex gap-2"><button type="button" onClick={() => void createProject()} disabled={creatingProject || !newProjectName.trim()} className="rounded-md border px-3 py-2 text-xs font-medium">{creatingProject ? 'Creating…' : 'Create project'}</button><button type="button" onClick={() => { setCreateProjectOpen(false); setStatus(null) }} disabled={creatingProject} className="rounded-md border px-3 py-2 text-xs">Cancel</button></div></div>}
      </div>
      <label className="space-y-2 text-sm"><span className="font-medium">Connection type</span><select value={connectionKind} onChange={e => selectConnection(e.target.value as ConnectionKind)} disabled={busy} className="w-full rounded-md border bg-background px-3 py-2">{CONNECTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><span className="text-xs text-muted-foreground">{selectedConnection.description}</span></label>
      <label className="space-y-2 text-sm"><span className="font-medium">Connection name</span><input value={name} onChange={e => setName(e.target.value)} disabled={busy} placeholder={`${selectedConnection.label} connection`} className="w-full rounded-md border bg-background px-3 py-2" /></label>
      <label className="space-y-2 text-sm md:col-span-2"><span className="font-medium">{isCsv ? 'CSV file URL / storage path' : 'Connection string'}</span><input value={jdbcUrl} onChange={e => setJdbcUrl(e.target.value)} disabled={busy} placeholder={selectedConnection.placeholder} className="w-full rounded-md border bg-background px-3 py-2" /><span className="text-xs text-muted-foreground">{isCsv ? 'Use an HTTPS CSV URL or a Supabase Storage bucket/path.' : 'Credentials are managed securely by the server. Do not embed usernames, passwords, tokens, or secrets in the URL.'}</span></label>
      <label className="space-y-2 text-sm"><span className="font-medium">Schema</span><select value={schema} onChange={e => { setSchema(e.target.value); setTable(''); setTables([]) }} disabled={busy || isCsv || schemas.length === 0} className="w-full rounded-md border bg-background px-3 py-2"><option value="">{isCsv ? 'CSV file (no database schema)' : 'Discover schemas first'}</option>{schemas.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <div className="flex items-end"><button type="button" onClick={discover} disabled={busy || !projectId || !jdbcUrl.trim()} className="w-full rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? 'Connecting…' : isCsv ? 'Validate CSV' : 'Test connection & discover'}</button></div>
      {!isCsv && schema && <label className="space-y-2 text-sm md:col-span-2"><span className="font-medium">Table / view</span><select value={table} onChange={e => inspectTable(e.target.value)} disabled={busy || tables.length === 0} className="w-full rounded-md border bg-background px-3 py-2"><option value="">Select a table or view</option>{tables.map(item => <option key={item.name} value={item.name}>{item.name} · {item.type}</option>)}</select>{selectedTable && <span className="text-xs text-muted-foreground">Selected {selectedTable.type?.toLowerCase() ?? 'object'}.</span>}</label>}
      <div className="md:col-span-2 flex flex-wrap gap-2"><button type="button" onClick={saveConnection} disabled={busy || isCsv || !projectId || !name.trim() || !jdbcUrl.trim()} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? 'Saving…' : 'Save connection'}</button><button type="button" onClick={register} disabled={busy || !canActivate || !name.trim()} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? 'Saving…' : isCsv ? 'Save CSV source' : 'Save connection & activate source'}</button></div>
    </div>}
    {status && <p className="mt-4 rounded-md border p-3 text-sm" role="status">{status}</p>}
    {columns.length > 0 && <div className="mt-4 rounded-lg border p-4"><p className="text-sm font-medium">Schema validation passed</p><p className="mt-1 text-xs text-muted-foreground">{columns.length} columns{rowCount !== null ? ` · ${rowCount} rows` : ''}</p></div>}
  </section>
}
