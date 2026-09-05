'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2, Lightbulb } from 'lucide-react'
import { ConnectionPrerequisites } from './connection-prerequisites'
import Link from 'next/link'

export type JdbcProjectOption = { id: string; name: string }
export type JdbcOrganizationOption = { id: string; name: string }
type SavedDatabricksConnection = { id: string; name: string; host: string; httpPath: string; catalog: string; schemaScope: 'all' | 'selected'; schemas: string[]; credentialRef: string }
type ConnectionKind = 'csv' | 'file' | 'postgresql' | 'mssql' | 'mysql' | 'databricks' | 'jdbc'
type ConnectionOption = { id: ConnectionKind; label: string; description: string; placeholder: string; fields: string[]; tips: string[] }
const CREATE_PROJECT = '__create_project__'
const CONNECTIONS: ConnectionOption[] = [
  { id: 'csv', label: 'CSV File', description: 'HTTPS CSV or Supabase Storage object', placeholder: 'https://host/path/data.csv or bucket/path/data.csv', fields: ['source'], tips: ['Use a reachable HTTPS CSV URL or Supabase Storage bucket/path.', 'The file is checked immediately and its columns are discovered before registration.', 'No database username, password, or JDBC setup is needed for CSV.'] },
  { id: 'file', label: 'Unstructured File', description: 'Text, JSON, JSONL, documents, images, or other file metadata', placeholder: 'https://host/path/document.txt or bucket/path/document.pdf', fields: ['source'], tips: ['Text, Markdown, HTML, XML, JSON and JSONL content is scanned directly.', 'Binary files such as PDF, Office documents and images are scanned for metadata until a document extraction runtime is enabled.', 'Files can be read from HTTPS URLs or Supabase Storage bucket/path locations.'] },
  { id: 'postgresql', label: 'PostgreSQL', description: 'PostgreSQL or Supabase database', placeholder: 'jdbc:postgresql://host:5432/database', fields: ['host','port','database','username','password','ssl','schema','table'], tips: ['Enter the database host, port, database name, username, and password.', 'Keep SSL at Require for normal encrypted connections. Use certificate verification when your database trust configuration supports it.', 'Test the connection first, then choose the discovered schema and table or view.'] },
  { id: 'mssql', label: 'Microsoft SQL Server', description: 'SQL Server or Azure SQL', placeholder: 'jdbc:sqlserver://host:1433;databaseName=database', fields: ['host','port','database','username','password','encryption','schema','table'], tips: ['Enter the SQL Server or Azure SQL host, port, database, username, and password.', 'Encryption is applied to the JDBC connection from the selected setting. Production connections should use encrypted transport with certificate validation.', 'Test the connection first, then select the schema and table or view discovered from the server.'] },
  { id: 'mysql', label: 'MySQL', description: 'MySQL compatible database', placeholder: 'jdbc:mysql://host:3306/database', fields: ['host','port','database','username','password','ssl','schema','table'], tips: ['Enter the MySQL host, port, database name, username, and password.', 'SSL mode is translated to the MySQL JDBC driver setting. Use certificate and identity verification where your environment supports it.', 'Test the connection first, then select the discovered schema and table or view.'] },
  { id: 'databricks', label: 'Databricks Unity Catalog', description: 'Databricks SQL warehouse and Unity Catalog', placeholder: 'jdbc:databricks://host:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=/sql/1.0/warehouses/...', fields: ['host','httpPath','token','catalog','schema','table'], tips: ['Enter the SQL warehouse server hostname and HTTP path from Databricks.', 'Enter a Databricks personal access token for testing, or use an approved token supported by your workspace policy.', 'Select the Unity Catalog catalog, test discovery, then save the governed connection. Catalog Discovery scans the saved connection for its real tables, views, columns, and lineage.'] },
  { id: 'jdbc', label: 'Generic JDBC', description: 'Supported JDBC driver endpoint', placeholder: 'jdbc:<driver>://host:port/database', fields: ['driver','jdbcUrl','username','password','schema','table'], tips: ['Use a JDBC URL without embedded username or password.', 'Select a driver supported by the deployed connector runtime. The current bridge bundles PostgreSQL, SQL Server, MySQL, and Databricks drivers.', 'Test discovery before choosing the schema and table or view. Unsupported driver protocols must be added to the connector runtime before they can connect.'] },
]

function mysqlSslMode(value: string) {
  if (value === 'verify-full') return 'VERIFY_IDENTITY'
  if (value === 'verify-ca') return 'VERIFY_CA'
  return 'REQUIRED'
}

export function JdbcSourceForm({ projects, organizations, initialSource }: { projects: JdbcProjectOption[]; organizations: JdbcOrganizationOption[]; initialSource?: SavedDatabricksConnection }) {
  const [availableProjects, setAvailableProjects] = useState(projects)
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '')
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [connectionKind, setConnectionKind] = useState<ConnectionKind>(initialSource ? 'databricks' : 'postgresql')
  const [name, setName] = useState(initialSource?.name ?? '')
  const [jdbcUrl, setJdbcUrl] = useState('')
  const [host, setHost] = useState(initialSource?.host ?? '')
  const [port, setPort] = useState('')
  const [database, setDatabase] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [ssl, setSsl] = useState('require')
  const [httpPath, setHttpPath] = useState(initialSource?.httpPath ?? '')
  const [token, setToken] = useState('')
  const [catalog, setCatalog] = useState(initialSource?.catalog ?? '')
  const [schemaScope, setSchemaScope] = useState<'all' | 'selected'>(initialSource?.schemaScope ?? 'all')
  const [selectedSchemas, setSelectedSchemas] = useState<string[]>(initialSource?.schemas ?? [])
  const [driver, setDriver] = useState('')
  const [schema, setSchema] = useState('')
  const [table, setTable] = useState('')
  const [schemas, setSchemas] = useState<string[]>(initialSource?.schemas ?? [])
  const [tables, setTables] = useState<Array<{ name: string; type?: string | null; schema?: string; catalog?: string }>>([])
  const [columns, setColumns] = useState<Array<{ name: string; type?: string | null }>>([])
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [credentialRef, setCredentialRef] = useState(initialSource?.credentialRef ?? '')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const selected = useMemo(() => CONNECTIONS.find(item => item.id === connectionKind) ?? CONNECTIONS[1], [connectionKind])
  const isCsv = connectionKind === 'csv'
  const isFile = isCsv || connectionKind === 'file'

  function resetConnection(kind: ConnectionKind) { setConnectionKind(kind); setJdbcUrl(''); setHost(''); setPort(''); setDatabase(''); setUsername(''); setPassword(''); setSsl('require'); setHttpPath(''); setToken(''); setCatalog(''); setDriver(''); setSchema(''); setSchemaScope('all'); setSelectedSchemas([]); setTable(''); setSchemas([]); setTables([]); setColumns([]); setRowCount(null); setCredentialRef(''); setStatus(null); setError(false) }
  async function createProject() {
    if (!organizationId || !newProjectName.trim()) return
    setBusy(true); setError(false)
    try { const response = await fetch('/api/datasets/create-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId, name: newProjectName, description: newProjectDescription }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Project creation failed.'); const project = { id: payload.project.id, name: payload.project.name }; setAvailableProjects(current => [...current.filter(item => item.id !== project.id), project].sort((a,b) => a.name.localeCompare(b.name))); setProjectId(project.id); setCreateProjectOpen(false); setNewProjectName(''); setNewProjectDescription(''); setStatus(`Project ${project.name} created and selected.`) } catch (e) { setError(true); setStatus(e instanceof Error ? e.message : 'Project creation failed.') } finally { setBusy(false) }
  }
  function buildJdbcUrl() {
    if (isFile) return jdbcUrl.trim()
    if (connectionKind === 'databricks') return (() => {
      if (!host.trim() || !httpPath.trim()) return ''
      return `jdbc:databricks://${host.trim()}:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=${httpPath.trim()}${catalog.trim() ? `;ConnCatalog=${catalog.trim()}` : ''}`
    })()
    if (connectionKind === 'postgresql') return jdbcUrl.trim() || (() => { if (!host.trim() || !database.trim()) return ''; return `jdbc:postgresql://${host.trim()}:${port.trim() || '5432'}/${database.trim()}?sslmode=${encodeURIComponent(ssl)}` })()
    if (connectionKind === 'mssql') return jdbcUrl.trim() || (() => { if (!host.trim() || !database.trim()) return ''; const encryption = ssl === 'require' ? 'true' : 'true'; const trustServerCertificate = ssl === 'verify-full' || ssl === 'verify-ca' ? 'false' : 'true'; return `jdbc:sqlserver://${host.trim()}:${port.trim() || '1433'};databaseName=${database.trim()};encrypt=${encryption};trustServerCertificate=${trustServerCertificate}` })()
    if (connectionKind === 'mysql') return jdbcUrl.trim() || (() => { if (!host.trim() || !database.trim()) return ''; return `jdbc:mysql://${host.trim()}:${port.trim() || '3306'}/${database.trim()}?sslMode=${mysqlSslMode(ssl)}` })()
    return jdbcUrl.trim()
  }
  async function provisionCredentials() {
    if (isFile) return ''
    if (credentialRef) return credentialRef
    const effectiveUsername = connectionKind === 'databricks' ? 'token' : username.trim()
    const effectivePassword = connectionKind === 'databricks' ? token : password
    if (!effectiveUsername || !effectivePassword) throw new Error(connectionKind === 'databricks' ? 'Databricks access token is required.' : 'Username and password are required.')
    const response = await fetch('/api/datasets/source/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceId: initialSource?.id, connectionKind, jdbcUrl: buildJdbcUrl(), username: effectiveUsername, password: effectivePassword }) })
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Unable to securely configure credentials.')
    setCredentialRef(payload.credentialRef)
    if (connectionKind === 'databricks') setToken(''); else setPassword('')
    return payload.credentialRef as string
  }
  async function discover() {
    setStatus(null); setError(false); setColumns([]); setRowCount(null)
    if (!projectId || !name.trim()) { setError(true); setStatus('Project and connection name are required.'); return }
    const url = buildJdbcUrl(); if (!url) { setError(true); setStatus(isCsv ? 'Enter a CSV URL or storage path.' : 'Complete the connection details first.'); return }
    setBusy(true)
    try {
      if (isFile) { const response = await fetch('/api/datasets/source/discover-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceUri: url }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'FILE validation failed.'); setSchemas([isCsv ? 'CSV' : 'FILE']); setSchema(isCsv ? 'CSV' : 'FILE'); setTables(payload.tables ?? []); setColumns(payload.columns ?? []); setRowCount(typeof payload.rowCount === 'number' ? payload.rowCount : null); const warning = Array.isArray(payload.warnings) && payload.warnings.length ? ` ${payload.warnings.join(' ')}` : ''; setStatus(`${isCsv ? 'CSV validated' : 'File scanned'}. ${payload.columns?.length ?? 0} profile fields discovered.${warning}`); return }
      const ref = await provisionCredentials()
      const response = await fetch('/api/datasets/source/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, jdbcUrl: url, connectionKind, schema: connectionKind === 'databricks' ? undefined : schema || undefined, catalog: connectionKind === 'databricks' ? catalog || undefined : undefined, schemaScope: connectionKind === 'databricks' ? schemaScope : undefined, schemas: connectionKind === 'databricks' ? selectedSchemas : undefined, credentialRef: ref }),
      })
      const payload = await response.json()
      if (Array.isArray(payload.schemas)) setSchemas(payload.schemas)
      if (!response.ok) throw new Error(payload.error ?? 'Connection discovery failed.')
      setJdbcUrl(url); setTables(payload.tables ?? [])
      const scopedCount = payload.details?.selected_schemas?.length
      setStatus(`Connection successful. ${payload.schemas?.length ?? 0} schemas discovered${typeof scopedCount === 'number' ? `; ${scopedCount} in scope` : ''}. ${payload.tables?.length ?? 0} tables/views returned.`)
    } catch (e) { setError(true); setStatus(e instanceof Error ? e.message : 'Connection discovery failed.') } finally { setBusy(false) }
  }
  async function register() {
    setStatus(null); setError(false)
    if (!projectId || !name.trim()) { setError(true); setStatus('Project and connection name are required.'); return }
    const url = buildJdbcUrl(); if (!url) { setError(true); setStatus('Complete the connection details first.'); return }
    if (!isFile && connectionKind !== 'databricks' && (!schema || !table)) { setError(true); setStatus('Select a schema and table/view after discovery.'); return }
    if (connectionKind === 'databricks' && !catalog.trim()) { setError(true); setStatus('Databricks catalog is required before saving the connection.'); return }
    setBusy(true)
    try {
      const ref = isFile ? '' : (credentialRef || await provisionCredentials())
      const fileSourceType = isCsv ? 'CSV' : 'FILE'
      const connectionOnly = connectionKind === 'databricks'
      const response = await fetch('/api/datasets/source/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sourceId: initialSource?.id, name, sourceType: isFile ? fileSourceType : 'JDBC', jdbcUrl: isFile ? undefined : url, sourceUri: isFile ? url : undefined, connectionKind, catalog: connectionOnly ? catalog : undefined, schema: connectionOnly ? undefined : isFile ? (isCsv ? 'CSV' : 'FILE') : schema || undefined, schemas: connectionOnly ? selectedSchemas : undefined, schemaScope: connectionOnly ? schemaScope : undefined, table: connectionOnly ? undefined : (isFile ? undefined : table), credentialRef: ref, connectionOnly }),
      })
      const payload = await response.json()
      if (Array.isArray(payload.schemas)) setSchemas(payload.schemas)
      if (!response.ok) throw new Error(payload.validation?.errors?.join(' ') || payload.error || 'Source registration failed.')
      setColumns(payload.validation?.details?.columns ?? payload.validation?.columns ?? [])
      setRowCount(typeof payload.validation?.rowCount === 'number' ? payload.validation.rowCount : null)
      setStatus(connectionOnly ? 'Databricks connection saved. Open Catalog → Discovery to scan and persist its real tables, views, columns, and lineage.' : isFile ? `Connection is ready. ${isCsv ? 'CSV' : 'FILE'} source registered successfully.` : `Connection is ready. ${schema}.${table} is available for profiling.`)
      if (payload.source) window.dispatchEvent(new CustomEvent('dgp:source-created', { detail: { id: payload.source.id, projectId: payload.source.project_id, name: payload.source.name, sourceType: payload.source.source_type, status: payload.source.status } }))
    } catch (e) { setError(true); setStatus(e instanceof Error ? e.message : 'Source registration failed.') } finally { setBusy(false) }
  }
  const field = (label: string, value: string, setValue: (v:string)=>void, placeholder?: string, type = 'text', required = true) => <label className="space-y-1.5 text-sm"><span className="font-medium">{label} {required && <span className="text-rose-500">*</span>}</span><input type={type} value={value} onChange={e => setValue(e.target.value)} disabled={busy} placeholder={placeholder} className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>

  return <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
    <div className="mb-5"><h2 className="text-lg font-semibold">Connect a data source</h2><p className="mt-1 text-sm text-slate-500">All mandatory prerequisites are collected here and change automatically with the connection type. Credentials are sent securely and never shown again.</p></div>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1.5 text-sm"><span className="font-medium">Project <span className="text-rose-500">*</span></span><select value={createProjectOpen ? CREATE_PROJECT : projectId} onChange={e => e.target.value === CREATE_PROJECT ? setCreateProjectOpen(true) : (setProjectId(e.target.value), setCredentialRef(''))} disabled={busy || Boolean(initialSource)} className="w-full rounded-lg border bg-white px-3 py-2.5">{availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}{organizations.length > 0 && <option value={CREATE_PROJECT}>＋ Create new project…</option>}</select></label>
      <label className="space-y-1.5 text-sm"><span className="font-medium">Connection type <span className="text-rose-500">*</span></span><select value={connectionKind} onChange={e => resetConnection(e.target.value as ConnectionKind)} disabled={busy || Boolean(initialSource)} className="w-full rounded-lg border bg-white px-3 py-2.5">{CONNECTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><span className="text-xs text-slate-500">{selected.description}</span></label>
      <ConnectionPrerequisites connectionKind={connectionKind} />
      <div className="md:col-span-2 rounded-xl border border-violet-100 bg-violet-50/60 p-4"><div className="flex items-start gap-3"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" /><div><div className="text-xs font-semibold text-violet-900">Tips for {selected.label}</div><ul className="mt-2 grid gap-1.5 text-xs leading-5 text-violet-900/80 sm:grid-cols-3">{selected.tips.map(tip => <li key={tip}>• {tip}</li>)}</ul></div></div></div>
      {createProjectOpen && organizations.length > 0 && <div className="md:col-span-2 rounded-xl border border-blue-100 bg-blue-50/50 p-4"><div className="grid gap-3 md:grid-cols-3"><select value={organizationId} onChange={e => setOrganizationId(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select><input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="New project name" className="rounded-lg border bg-white px-3 py-2 text-sm" /><div className="flex gap-2"><button type="button" onClick={() => void createProject()} disabled={busy || !newProjectName.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Create</button><button type="button" onClick={() => setCreateProjectOpen(false)} className="rounded-lg border px-3 py-2 text-xs">Cancel</button></div></div></div>}
      {field('Connection name', name, setName, `${selected.label} connection`)}
      {isFile ? field(isCsv ? 'CSV URL / storage path' : 'File URL / storage path', jdbcUrl, setJdbcUrl, selected.placeholder) : <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="mb-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-sm font-semibold">{selected.label} connection details</span></div><div className="grid gap-3 md:grid-cols-2">
        {connectionKind === 'jdbc' && field('JDBC driver', driver, setDriver, 'PostgreSQL / SQL Server / MySQL / Databricks')}
        {connectionKind !== 'jdbc' && connectionKind !== 'databricks' && field('Host', host, setHost, 'database.example.com')}
        {connectionKind !== 'jdbc' && connectionKind !== 'databricks' && field('Port', port, setPort, connectionKind === 'mssql' ? '1433' : connectionKind === 'mysql' ? '3306' : '5432')}
        {connectionKind === 'databricks' && field('Server hostname', host, setHost, 'dbc-xxxx.cloud.databricks.com')}
        {connectionKind === 'databricks' && field('HTTP path', httpPath, setHttpPath, '/sql/1.0/warehouses/...')}
        {connectionKind !== 'databricks' && connectionKind !== 'jdbc' && field('Database', database, setDatabase, 'database')}
        {connectionKind === 'jdbc' && field('JDBC URL', jdbcUrl, setJdbcUrl, selected.placeholder)}
        {connectionKind !== 'databricks' && field('Username', username, (value) => { setUsername(value); setCredentialRef('') }, 'Database username')}
        {connectionKind === 'databricks' ? field('Access token', token, (value) => { setToken(value); if (value) setCredentialRef('') }, credentialRef ? 'Saved token will be reused' : 'Workspace token', 'password', !credentialRef) : field('Password', password, (value) => { setPassword(value); setCredentialRef('') }, 'Database password', 'password')}
        {connectionKind !== 'databricks' && connectionKind !== 'jdbc' && <label className="space-y-1.5 text-sm"><span className="font-medium">{connectionKind === 'mssql' ? 'Encryption' : 'SSL mode'} <span className="text-rose-500">*</span></span><select value={ssl} onChange={e => setSsl(e.target.value)} className="w-full rounded-lg border bg-white px-3 py-2.5"><option value="require">Require</option><option value="verify-ca">Verify CA</option><option value="verify-full">Verify full</option></select></label>}
        {connectionKind === 'databricks' && field('Catalog', catalog, setCatalog, 'main')}
      </div></div>}
      {!isFile && connectionKind !== 'databricks' && <>{field('Schema', schema, setSchema, schemas.length ? 'Select from discovered schemas' : 'Discover schemas first')}{field('Table / view', table, setTable, tables.length ? 'Select from discovered tables/views' : 'Discover tables after schema')}</>}
      {connectionKind === 'databricks' && <fieldset disabled={busy} className="md:col-span-2 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Schema scope</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="databricks-schema-scope" checked={schemaScope === 'all'} onChange={() => { setSchemaScope('all'); setTables([]) }} />All data schemas</label>
          <label className="flex items-center gap-2"><input type="radio" name="databricks-schema-scope" checked={schemaScope === 'selected'} onChange={() => { setSchemaScope('selected'); setTables([]) }} />Select schemas</label>
        </div>
        <p className="mt-2 text-xs text-slate-500">All data schemas includes accessible schemas except information_schema. Select multiple schemas to discover their tables and cross-schema lineage.</p>
        {schemaScope === 'selected' && <div className="mt-3 flex flex-wrap gap-3">
          {[...new Set([...schemas, ...selectedSchemas])].sort().map(item => <label key={item} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={selectedSchemas.includes(item)} onChange={event => { setSelectedSchemas(current => event.target.checked ? [...current, item] : current.filter(name => name !== item)); setTables([]) }} />{item}</label>)}
          {!schemas.length && <p className="text-xs text-slate-500">Test the connection with all data schemas to load the available choices.</p>}
        </div>}
        {schemaScope === 'selected' && <p className="mt-3 text-xs text-slate-600">{selectedSchemas.length} schemas selected</p>}
      </fieldset>}
      {!isFile && credentialRef && <div className="md:col-span-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />Database credentials securely configured for this connection.</div>}
      {schemas.length > 0 && !isFile && connectionKind !== 'databricks' && <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 text-xs font-semibold text-slate-600">Discovered schemas</div><div className="flex flex-wrap gap-2">{schemas.map(item => <button type="button" key={item} onClick={() => { setSchema(item); setTable('') }} className={`rounded-full border px-3 py-1.5 text-xs ${schema === item ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>{item}</button>)}</div></div>}
      {tables.length > 0 && !isFile && <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 text-xs font-semibold text-slate-600">Tables and views</div><div className="grid gap-2 sm:grid-cols-2">{tables.map(item => <button type="button" key={[item.catalog, item.schema, item.name].filter(Boolean).join('.')} onClick={() => setTable(item.name)} className={`flex justify-between rounded-lg border px-3 py-2 text-left text-xs ${table === item.name ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}><span>{connectionKind === 'databricks' ? [item.catalog, item.schema, item.name].filter(Boolean).join('.') : item.name}</span><span>{item.type ?? 'TABLE'}</span></button>)}</div></div>}
      {columns.length > 0 && <div className="md:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs text-slate-600"><strong className="text-slate-800">Validated target:</strong> {columns.length} columns{typeof rowCount === 'number' ? ` · ${rowCount} rows` : ''}</div>}
      <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={discover} disabled={busy || !projectId} className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 disabled:opacity-50">{busy ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Working…</span> : isCsv ? 'Validate CSV' : connectionKind === 'file' ? 'Scan file & metadata' : 'Test connection & discover'}</button><button type="button" onClick={register} disabled={busy || !projectId || !name.trim()} className="flex-1 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{connectionKind === 'databricks' ? 'Save connection' : 'Save & make ready'}</button></div>
      {connectionKind === 'databricks' && <Link href="/catalog/discovery" className="md:col-span-2 text-sm font-semibold text-blue-700">Open Catalog Discovery</Link>}
      {status && <div className={`md:col-span-2 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{error ? <CircleAlert className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4" />}{status}</div>}
    </div>
  </section>
}
