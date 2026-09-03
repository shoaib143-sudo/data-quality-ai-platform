'use client'

import { useMemo, useState } from 'react'

export type JdbcProjectOption = { id: string; name: string }
type ConnectionKind = 'csv' | 'postgresql' | 'mssql' | 'mysql' | 'databricks' | 'jdbc'

type ConnectionOption = {
  id: ConnectionKind
  label: string
  description: string
  placeholder: string
}

const CONNECTIONS: ConnectionOption[] = [
  { id: 'csv', label: 'CSV File', description: 'CSV file from an HTTPS URL or Supabase Storage object', placeholder: 'https://host/path/data.csv or bucket/path/data.csv' },
  { id: 'postgresql', label: 'PostgreSQL', description: 'PostgreSQL / Supabase databases', placeholder: 'jdbc:postgresql://host:5432/database' },
  { id: 'mssql', label: 'Microsoft SQL Server', description: 'SQL Server / Azure SQL', placeholder: 'jdbc:sqlserver://host:1433;databaseName=database' },
  { id: 'mysql', label: 'MySQL', description: 'MySQL-compatible databases', placeholder: 'jdbc:mysql://host:3306/database' },
  { id: 'databricks', label: 'Databricks Unity Catalog', description: 'Catalog, schema and table onboarding', placeholder: 'jdbc:databricks://host:443/default' },
  { id: 'jdbc', label: 'Generic JDBC', description: 'Any supported JDBC driver endpoint', placeholder: 'jdbc:<driver>://host:port/database' },
]

export function JdbcSourceForm({ projects }: { projects: JdbcProjectOption[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [connectionKind, setConnectionKind] = useState<ConnectionKind>('postgresql')
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

  const selectedConnection = useMemo(() => CONNECTIONS.find(item => item.id === connectionKind) ?? CONNECTIONS[1], [connectionKind])
  const isCsv = connectionKind === 'csv'
  const selectedTable = useMemo(() => tables.find(item => item.name === table), [tables, table])

  function selectConnection(value: ConnectionKind) {
    setConnectionKind(value)
    setJdbcUrl('')
    setCredentialRef('')
    setSchema('')
    setTable('')
    setSchemas([])
    setTables([])
    setColumns([])
    setRowCount(null)
    setStatus(null)
  }

  async function discover() {
    setStatus(null); setColumns([]); setRowCount(null)
    if (!projectId || !jdbcUrl.trim() || (!isCsv && !credentialRef.trim())) {
      setStatus(isCsv ? 'Enter a CSV URL or storage path first.' : 'Enter the connection string and credential reference first.')
      return
    }
    setBusy(true)
    try {
      if (isCsv) {
        const response = await fetch('/api/datasets/source/discover-file', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, sourceUri: jdbcUrl.trim() }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'CSV discovery failed.')
        setSchemas(['CSV'])
        setSchema('CSV')
        setTables(payload.tables ?? [])
        setStatus(`CSV source available. Found ${payload.columns?.length ?? 0} columns${typeof payload.rowCount === 'number' ? ` and ${payload.rowCount} rows` : ''}.`)
        return
      }
      const response = await fetch('/api/datasets/source/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, jdbcUrl, credentialRef, schema: schema || undefined }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Connection discovery failed.')
      setSchemas(payload.schemas ?? [])
      setTables(payload.tables ?? [])
      if (schema && !(payload.schemas ?? []).includes(schema)) setStatus(`Connected, but schema ${schema} was not returned by the source.`)
      else setStatus(`Connection successful. Found ${(payload.schemas ?? []).length} schemas${schema ? ` and ${(payload.tables ?? []).length} tables/views in ${schema}` : ''}.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Connection discovery failed.') }
    finally { setBusy(false) }
  }

  async function inspectTable(value: string) {
    setTable(value); setColumns([]); setRowCount(null); setStatus(null)
    if (isCsv || !schema || !value) return
    setBusy(true)
    try {
      const response = await fetch('/api/datasets/source/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, jdbcUrl, credentialRef, schema }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Table discovery failed.')
      const match = (payload.tables ?? []).find((item: { name: string }) => item.name === value)
      if (!match) throw new Error('Selected table is no longer available.')
      setStatus(`Selected ${schema}.${value}. Save the connection to run full connectivity and schema validation.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Table discovery failed.') }
    finally { setBusy(false) }
  }

  async function register() {
    setStatus(null)
    if (!projectId || !name.trim() || !jdbcUrl.trim() || (!isCsv && (!credentialRef.trim() || !schema || !table))) {
      setStatus(isCsv ? 'Project, connection name, and CSV URL/storage path are required.' : 'Project, connection name, connection string, credential reference, schema, and table are required.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/datasets/source/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name, sourceType: isCsv ? 'CSV' : 'JDBC', jdbcUrl: isCsv ? undefined : jdbcUrl, sourceUri: isCsv ? jdbcUrl : undefined, credentialRef, schema: isCsv ? 'CSV' : schema, table: isCsv ? undefined : table }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.validation?.errors?.join(' ') || payload.error || 'Source registration failed.')
      setColumns(payload.validation?.details?.columns ?? payload.validation?.columns ?? [])
      setRowCount(typeof payload.validation?.rowCount === 'number' ? payload.validation.rowCount : null)
      setStatus(isCsv ? `CSV source saved and is profiling-ready: ${jdbcUrl}.` : `Connection saved and source is profiling-ready: ${schema}.${table}${typeof payload.validation?.rowCount === 'number' ? ` · ${payload.validation.rowCount} rows` : ''}.`)
      setName('')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Source registration failed.') }
    finally { setBusy(false) }
  }

  return <section className="rounded-xl border p-6">
    <div className="mb-6">
      <h2 className="text-lg font-semibold">Connect a data source</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose the source type from one dropdown. Database sources can test connectivity and discover schemas and tables. CSV sources can be validated directly.</p>
    </div>

    {projects.length === 0 ? <p className="text-sm text-muted-foreground">No projects are available.</p> : <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2 text-sm"><span className="font-medium">Project</span><select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={busy} className="w-full rounded-md border bg-background px-3 py-2">{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="space-y-2 text-sm"><span className="font-medium">Connection type</span><select value={connectionKind} onChange={e => selectConnection(e.target.value as ConnectionKind)} disabled={busy} className="w-full rounded-md border bg-background px-3 py-2">{CONNECTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><span className="text-xs text-muted-foreground">{selectedConnection.description}</span></label>
      <label className="space-y-2 text-sm"><span className="font-medium">Connection name</span><input value={name} onChange={e => setName(e.target.value)} disabled={busy} placeholder={`${selectedConnection.label} connection`} className="w-full rounded-md border bg-background px-3 py-2" /></label>
      {!isCsv && <label className="space-y-2 text-sm"><span className="font-medium">Credential reference</span><input value={credentialRef} onChange={e => setCredentialRef(e.target.value)} disabled={busy} placeholder="Infisical secret reference" className="w-full rounded-md border bg-background px-3 py-2" /><span className="text-xs text-muted-foreground">Credentials are resolved server-side. Never enter a database password here.</span></label>}
      <label className="space-y-2 text-sm md:col-span-2"><span className="font-medium">{isCsv ? 'CSV file URL / storage path' : 'Connection string'}</span><input value={jdbcUrl} onChange={e => setJdbcUrl(e.target.value)} disabled={busy} placeholder={selectedConnection.placeholder} className="w-full rounded-md border bg-background px-3 py-2" /><span className="text-xs text-muted-foreground">{isCsv ? 'Use an HTTPS CSV URL or a Supabase Storage bucket/path.' : 'Do not embed username, password, tokens, or secrets in the URL.'}</span></label>
      <label className="space-y-2 text-sm"><span className="font-medium">Schema</span><select value={schema} onChange={e => { setSchema(e.target.value); setTable(''); setTables([]) }} disabled={busy || isCsv || schemas.length === 0} className="w-full rounded-md border bg-background px-3 py-2"><option value="">{isCsv ? 'CSV file (no database schema)' : 'Discover schemas first'}</option>{schemas.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <div className="flex items-end"><button type="button" onClick={discover} disabled={busy} className="w-full rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? 'Connecting…' : isCsv ? 'Validate CSV' : 'Test connection & discover'}</button></div>
      {!isCsv && schema && <label className="space-y-2 text-sm md:col-span-2"><span className="font-medium">Table / view</span><select value={table} onChange={e => inspectTable(e.target.value)} disabled={busy || tables.length === 0} className="w-full rounded-md border bg-background px-3 py-2"><option value="">Select a table or view</option>{tables.map(item => <option key={item.name} value={item.name}>{item.name} · {item.type}</option>)}</select>{selectedTable && <span className="text-xs text-muted-foreground">Selected {selectedTable.type?.toLowerCase() ?? 'object'}.</span>}</label>}
      {((isCsv && schema === 'CSV') || table) && <div className="md:col-span-2"><button type="button" onClick={register} disabled={busy} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? 'Validating…' : isCsv ? 'Save CSV source' : 'Save connection & register source'}</button></div>}
    </div>}

    {status && <p className="mt-4 rounded-md border p-3 text-sm" role="status">{status}</p>}
    {columns.length > 0 && <div className="mt-4 rounded-lg border p-4"><p className="text-sm font-medium">Schema validation passed</p><p className="mt-1 text-xs text-muted-foreground">{columns.length} columns{rowCount !== null ? ` · ${rowCount} rows` : ''}</p></div>}
  </section>
}
