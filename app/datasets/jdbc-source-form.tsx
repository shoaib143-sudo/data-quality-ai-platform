'use client'

import { useMemo, useState } from 'react'

export type JdbcProjectOption = { id: string; name: string }

export function JdbcSourceForm({ projects }: { projects: JdbcProjectOption[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [name, setName] = useState('')
  const [jdbcUrl, setJdbcUrl] = useState('')
  const [credentialRef, setCredentialRef] = useState('')
  const [schema, setSchema] = useState('')
  const [table, setTable] = useState('')
  const [schemas, setSchemas] = useState<string[]>([])
  const [tables, setTables] = useState<Array<{ name: string; type?: string | null }>>([])
  const [columns, setColumns] = useState<Array<{ name: string; type?: string | null }>>([])
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selectedTable = useMemo(() => tables.find(item => item.name === table), [tables, table])

  async function discover() {
    setStatus(null); setColumns([]); setRowCount(null); setBusy(true)
    try {
      const response = await fetch('/api/datasets/source/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, jdbcUrl, credentialRef, schema: schema || undefined }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'JDBC discovery failed.')
      setSchemas(payload.schemas ?? [])
      setTables(payload.tables ?? [])
      if (schema && !(payload.schemas ?? []).includes(schema)) setStatus(`Connected, but schema ${schema} was not returned by the source.`)
      else setStatus(`Connected. Found ${(payload.schemas ?? []).length} schemas${schema ? ` and ${(payload.tables ?? []).length} tables/views in ${schema}` : ''}.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'JDBC discovery failed.') }
    finally { setBusy(false) }
  }

  async function inspectTable(value: string) {
    setTable(value); setColumns([]); setRowCount(null); setStatus(null)
    if (!schema || !value) return
    setBusy(true)
    try {
      const response = await fetch('/api/datasets/source/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, jdbcUrl, credentialRef, schema }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Table discovery failed.')
      const match = (payload.tables ?? []).find((item: { name: string }) => item.name === value)
      if (!match) throw new Error('Selected table is no longer available.')
      setStatus(`Selected ${schema}.${value}. Click Register source to run full connectivity and schema validation.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Table discovery failed.') }
    finally { setBusy(false) }
  }

  async function register() {
    setStatus(null); setBusy(true)
    try {
      const response = await fetch('/api/datasets/source/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name, jdbcUrl, credentialRef, schema, table }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.validation?.errors?.join(' ') || payload.error || 'JDBC source registration failed.')
      setColumns(payload.validation?.details?.columns ?? payload.validation?.columns ?? [])
      setRowCount(typeof payload.validation?.rowCount === 'number' ? payload.validation.rowCount : null)
      setStatus(`JDBC source registered and profiling-ready: ${schema}.${table}${typeof payload.validation?.rowCount === 'number' ? ` · ${payload.validation.rowCount} rows` : ''}. Refresh the dataset list to use it.`)
      setName('')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'JDBC source registration failed.') }
    finally { setBusy(false) }
  }

  return <section className="rounded-xl border p-6">
    <div className="mb-5"><h2 className="text-lg font-semibold">Add JDBC database source</h2><p className="mt-1 text-sm text-muted-foreground">Discover schemas and tables through the server-side JDBC bridge. Database passwords are never entered into the application.</p></div>
    {projects.length === 0 ? <p className="text-sm text-muted-foreground">No projects are available.</p> : <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2 text-sm"><span className="font-medium">Project</span><select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={busy} className="w-full rounded-md border bg-background px-3 py-2">{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="space-y-2 text-sm"><span className="font-medium">Source name</span><input value={name} onChange={e => setName(e.target.value)} disabled={busy} placeholder="Customer PostgreSQL" className="w-full rounded-md border bg-background px-3 py-2" /></label>
      <label className="space-y-2 text-sm md:col-span-2"><span className="font-medium">JDBC URL</span><input value={jdbcUrl} onChange={e => setJdbcUrl(e.target.value)} disabled={busy} placeholder="jdbc:postgresql://host:5432/database" className="w-full rounded-md border bg-background px-3 py-2" /><span className="text-xs text-muted-foreground">Do not embed username or password.</span></label>
      <label className="space-y-2 text-sm"><span className="font-medium">Credential reference</span><input value={credentialRef} onChange={e => setCredentialRef(e.target.value)} disabled={busy} placeholder="Infisical secret reference" className="w-full rounded-md border bg-background px-3 py-2" /></label>
      <label className="space-y-2 text-sm"><span className="font-medium">Schema</span><select value={schema} onChange={e => { setSchema(e.target.value); setTable(''); setTables([]) }} disabled={busy || schemas.length === 0} className="w-full rounded-md border bg-background px-3 py-2"><option value="">Discover schemas first</option>{schemas.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <div className="md:col-span-2 flex flex-wrap gap-2"><button type="button" onClick={discover} disabled={busy || !projectId || !jdbcUrl || !credentialRef} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? 'Working…' : 'Test connection & discover'}</button></div>
      {schema && <label className="space-y-2 text-sm md:col-span-2"><span className="font-medium">Table / view</span><select value={table} onChange={e => inspectTable(e.target.value)} disabled={busy || tables.length === 0} className="w-full rounded-md border bg-background px-3 py-2"><option value="">Select a table or view</option>{tables.map(item => <option key={item.name} value={item.name}>{item.name} · {item.type}</option>)}</select>{selectedTable && <span className="text-xs text-muted-foreground">Selected {selectedTable.type?.toLowerCase() ?? 'object'}.</span>}</label>}
      {table && <div className="md:col-span-2"><label className="space-y-2 text-sm block"><span className="font-medium">Source display name</span><input value={name} onChange={e => setName(e.target.value)} disabled={busy} placeholder={`${schema}.${table}`} className="w-full rounded-md border bg-background px-3 py-2" /></label><button type="button" onClick={register} disabled={busy || !name || !schema || !table} className="mt-3 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? 'Validating…' : 'Register source'}</button></div>}
    </div>}
    {status && <p className="mt-4 rounded-md border p-3 text-sm" role="status">{status}</p>}
    {columns.length > 0 && <div className="mt-4 rounded-lg border p-4"><p className="text-sm font-medium">Schema validation passed</p><p className="mt-1 text-xs text-muted-foreground">{columns.length} columns{rowCount !== null ? ` · ${rowCount} rows` : ''}</p></div>}
  </section>
}
