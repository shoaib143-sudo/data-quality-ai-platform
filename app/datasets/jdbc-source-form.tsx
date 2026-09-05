'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2, Lightbulb, ShieldCheck } from 'lucide-react'
import { ConnectionPrerequisites } from './connection-prerequisites'
import { NativeHierarchyPicker } from './native-hierarchy-picker'
import type { NativeHierarchyResult } from '@/lib/connectors/native-hierarchy'
import Link from 'next/link'

export type JdbcProjectOption = { id: string; name: string }
export type JdbcOrganizationOption = { id: string; name: string }
type SavedDatabricksConnection = { id: string; name: string; host: string; httpPath: string; catalog?: string; schemaScope?: 'all' | 'selected'; schemas?: string[]; credentialRef: string }
type ConnectionKind = 'csv' | 'file' | 'postgresql' | 'mssql' | 'mysql' | 'databricks' | 'jdbc'
type ConnectionOption = { id: ConnectionKind; label: string; description: string; placeholder: string; tips: string[] }
const CREATE_PROJECT = '__create_project__'
const CONNECTIONS: ConnectionOption[] = [
  { id: 'csv', label: 'CSV File', description: 'HTTPS CSV or Supabase Storage object', placeholder: 'https://host/path/data.csv or bucket/path/data.csv', tips: ['Connection validation may inspect file content, but catalog discovery publishes physical file metadata without persisting row values.', 'Schema inference and profiling run under their own execution boundary.', 'No database username, password, or JDBC setup is needed for CSV.'] },
  { id: 'file', label: 'Unstructured File', description: 'Text, JSON, JSONL, documents, images, or other file metadata', placeholder: 'https://host/path/document.txt or bucket/path/document.pdf', tips: ['Catalog discovery publishes factual object metadata without waiting for document extraction or AI.', 'Content extraction, classification and semantic enrichment are asynchronous.', 'Files can be read from HTTPS URLs or Supabase Storage bucket/path locations.'] },
  { id: 'postgresql', label: 'PostgreSQL', description: 'PostgreSQL or Supabase database', placeholder: 'jdbc:postgresql://host:5432/database', tips: ['Connect to the database first; DataNexus reads PostgreSQL native schemas, objects, columns and stable catalog identifiers where exposed.', 'The hierarchy is reported by PostgreSQL metadata rather than invented by DataNexus.', 'Use parent includes for dynamic scope and explicit exclusions to carve out subtrees.'] },
  { id: 'mssql', label: 'Microsoft SQL Server', description: 'SQL Server or Azure SQL', placeholder: 'jdbc:sqlserver://host:1433;databaseName=database', tips: ['Connect to the target database using SQL Server connection semantics.', 'DataNexus preserves the database → schema → native object hierarchy returned by the driver.', 'Dynamic parent includes inherit future children; explicit exclusions always win.'] },
  { id: 'mysql', label: 'MySQL', description: 'MySQL compatible database', placeholder: 'jdbc:mysql://host:3306/database', tips: ['MySQL database/schema semantics are preserved as reported by the driver.', 'DataNexus does not create an extra schema layer when the product does not have one.', 'Dynamic parent includes inherit future children; explicit exclusions always win.'] },
  { id: 'databricks', label: 'Databricks Unity Catalog', description: 'Databricks SQL warehouse and Unity Catalog', placeholder: 'jdbc:databricks://host:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=/sql/1.0/warehouses/...', tips: ['Enter only workspace connection details; do not preselect a catalog or schema in the JDBC URL.', 'DataNexus discovers Unity Catalog catalogs, schemas, tables/views, fields and stable table IDs where Databricks exposes them.', 'Large selected scopes are checkpointed by catalog and only complete manifests can publish a catalog revision.'] },
  { id: 'jdbc', label: 'Generic JDBC', description: 'Supported JDBC driver endpoint', placeholder: 'jdbc:<driver>://host:port/database', tips: ['Use a JDBC URL without embedded credentials.', 'DataNexus asks the JDBC driver for its native catalog/schema terminology and hierarchy.', 'Provider capabilities are shown after connection so unsupported guarantees are never implied.'] },
]

function mysqlSslMode(value: string) {
  if (value === 'verify-full') return 'VERIFY_IDENTITY'
  if (value === 'verify-ca') return 'VERIFY_CA'
  return 'REQUIRED'
}

function capabilityLabel(value: unknown) {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  if (value === null || value === undefined || value === '') return 'not reported'
  return String(value).replaceAll('_', ' ').toLowerCase()
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
  const [driver, setDriver] = useState('')
  const [columns, setColumns] = useState<Array<{ name: string; type?: string | null }>>([])
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [credentialRef, setCredentialRef] = useState(initialSource?.credentialRef ?? '')
  const [hierarchy, setHierarchy] = useState<NativeHierarchyResult | null>(null)
  const [capabilities, setCapabilities] = useState<Record<string, unknown> | null>(null)
  const [selectionMode, setSelectionMode] = useState<'ALL' | 'SELECTED'>('ALL')
  // Explicit exclusions are encoded as !<nodeId> inside this local UI state. The API receives
  // normalized include/exclude arrays; no prefixed IDs are persisted.
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const selected = useMemo(() => CONNECTIONS.find(item => item.id === connectionKind) ?? CONNECTIONS[1], [connectionKind])
  const isCsv = connectionKind === 'csv'
  const isFile = isCsv || connectionKind === 'file'

  function resetHierarchy() {
    setHierarchy(null)
    setCapabilities(null)
    setSelectionMode('ALL')
    setSelectedNodeIds([])
  }

  function resetConnection(kind: ConnectionKind) {
    setConnectionKind(kind); setJdbcUrl(''); setHost(''); setPort(''); setDatabase(''); setUsername(''); setPassword(''); setSsl('require'); setHttpPath(''); setToken(''); setDriver(''); setColumns([]); setRowCount(null); setCredentialRef(''); resetHierarchy(); setStatus(null); setError(false)
  }

  async function createProject() {
    if (!organizationId || !newProjectName.trim()) return
    setBusy(true); setError(false)
    try {
      const response = await fetch('/api/datasets/create-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId, name: newProjectName, description: newProjectDescription }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Project creation failed.')
      const project = { id: payload.project.id, name: payload.project.name }
      setAvailableProjects(current => [...current.filter(item => item.id !== project.id), project].sort((a,b) => a.name.localeCompare(b.name)))
      setProjectId(project.id); setCreateProjectOpen(false); setNewProjectName(''); setNewProjectDescription(''); setStatus(`Project ${project.name} created and selected.`)
    } catch (e) { setError(true); setStatus(e instanceof Error ? e.message : 'Project creation failed.') } finally { setBusy(false) }
  }

  function buildJdbcUrl() {
    if (isFile) return jdbcUrl.trim()
    if (connectionKind === 'databricks') {
      if (!host.trim() || !httpPath.trim()) return ''
      return `jdbc:databricks://${host.trim()}:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=${httpPath.trim()}`
    }
    if (connectionKind === 'postgresql') {
      if (jdbcUrl.trim()) return jdbcUrl.trim()
      if (!host.trim() || !database.trim()) return ''
      return `jdbc:postgresql://${host.trim()}:${port.trim() || '5432'}/${database.trim()}?sslmode=${encodeURIComponent(ssl)}`
    }
    if (connectionKind === 'mssql') {
      if (jdbcUrl.trim()) return jdbcUrl.trim()
      if (!host.trim() || !database.trim()) return ''
      const trustServerCertificate = ssl === 'verify-full' || ssl === 'verify-ca' ? 'false' : 'true'
      return `jdbc:sqlserver://${host.trim()}:${port.trim() || '1433'};databaseName=${database.trim()};encrypt=true;trustServerCertificate=${trustServerCertificate}`
    }
    if (connectionKind === 'mysql') {
      if (jdbcUrl.trim()) return jdbcUrl.trim()
      if (!host.trim() || !database.trim()) return ''
      return `jdbc:mysql://${host.trim()}:${port.trim() || '3306'}/${database.trim()}?sslMode=${mysqlSslMode(ssl)}`
    }
    return jdbcUrl.trim()
  }

  async function provisionCredentials() {
    if (isFile) return ''
    if (credentialRef) return credentialRef
    const effectiveUsername = connectionKind === 'databricks' ? 'token' : username.trim()
    const effectivePassword = connectionKind === 'databricks' ? token : password
    if (!effectiveUsername || !effectivePassword) throw new Error(connectionKind === 'databricks' ? 'Databricks access token is required.' : 'Username and password are required.')
    const response = await fetch('/api/datasets/source/credentials', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sourceId: initialSource?.id, connectionKind, jdbcUrl: buildJdbcUrl(), username: effectiveUsername, password: effectivePassword }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error ?? 'Unable to securely configure credentials.')
    setCredentialRef(payload.credentialRef)
    if (connectionKind === 'databricks') setToken(''); else setPassword('')
    return payload.credentialRef as string
  }

  async function discover() {
    setStatus(null); setError(false); setColumns([]); setRowCount(null)
    if (!projectId || !name.trim()) { setError(true); setStatus('Project and connection name are required.'); return }
    const url = buildJdbcUrl()
    if (!url) { setError(true); setStatus(isCsv ? 'Enter a CSV URL or storage path.' : 'Complete the connection details first.'); return }
    setBusy(true)
    try {
      if (isFile) {
        const response = await fetch('/api/datasets/source/discover-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceUri: url }) })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'FILE validation failed.')
        setColumns(payload.columns ?? []); setRowCount(typeof payload.rowCount === 'number' ? payload.rowCount : null)
        const warning = Array.isArray(payload.warnings) && payload.warnings.length ? ` ${payload.warnings.join(' ')}` : ''
        setStatus(`${isCsv ? 'CSV validated' : 'File scanned'}. ${payload.columns?.length ?? 0} profile fields discovered for later profiling.${warning}`)
        return
      }
      const ref = await provisionCredentials()
      const response = await fetch('/api/datasets/source/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, jdbcUrl: url, connectionKind, credentialRef: ref }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Connection discovery failed.')
      if (!payload.hierarchy || !Array.isArray(payload.hierarchy.nodes)) throw new Error('The connector did not return a native source hierarchy.')
      setJdbcUrl(url)
      setHierarchy(payload.hierarchy as NativeHierarchyResult)
      setCapabilities(payload.capabilities && typeof payload.capabilities === 'object' ? payload.capabilities as Record<string, unknown> : null)
      setSelectionMode('ALL')
      setSelectedNodeIds([])
      const objectCount = payload.hierarchy.nodes.filter((node: { kind?: string }) => node.kind === 'OBJECT').length
      const fieldCount = payload.hierarchy.nodes.filter((node: { kind?: string }) => node.kind === 'FIELD').length
      const nativeIdCount = payload.hierarchy.nodes.filter((node: { kind?: string; nativeId?: string | null }) => node.kind === 'OBJECT' && node.nativeId).length
      setStatus(`Connected to ${payload.hierarchy.databaseProduct}. ${payload.hierarchy.nodes.length} native hierarchy nodes discovered, including ${objectCount} objects, ${fieldCount} fields and ${nativeIdCount} stable object identities.`)
    } catch (e) { setError(true); setStatus(e instanceof Error ? e.message : 'Connection discovery failed.') } finally { setBusy(false) }
  }

  async function register() {
    setStatus(null); setError(false)
    if (!projectId || !name.trim()) { setError(true); setStatus('Project and connection name are required.'); return }
    const url = buildJdbcUrl()
    if (!url) { setError(true); setStatus('Complete the connection details first.'); return }
    if (!isFile && !hierarchy) { setError(true); setStatus('Test the connection first so DataNexus can discover the source hierarchy.'); return }
    const includeNodeIds = selectedNodeIds.filter(id => !id.startsWith('!'))
    const excludedNodeIds = selectedNodeIds.filter(id => id.startsWith('!')).map(id => id.slice(1))
    if (!isFile && selectionMode === 'SELECTED' && includeNodeIds.length === 0) { setError(true); setStatus('Select at least one included node from the discovered hierarchy.'); return }
    setBusy(true)
    try {
      const ref = isFile ? '' : (credentialRef || await provisionCredentials())
      const fileSourceType = isCsv ? 'CSV' : 'FILE'
      const selectedQualifiedNames = hierarchy
        ? includeNodeIds.map(id => hierarchy.nodes.find(node => node.id === id)?.qualifiedName).filter((value): value is string => Boolean(value))
        : []
      const excludedQualifiedNames = hierarchy
        ? excludedNodeIds.map(id => hierarchy.nodes.find(node => node.id === id)?.qualifiedName).filter((value): value is string => Boolean(value))
        : []
      const response = await fetch('/api/datasets/source/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          sourceId: initialSource?.id,
          name,
          sourceType: isFile ? fileSourceType : 'JDBC',
          jdbcUrl: isFile ? undefined : url,
          sourceUri: isFile ? url : undefined,
          connectionKind,
          credentialRef: ref,
          connectionOnly: !isFile,
          hierarchySelection: !isFile ? {
            mode: selectionMode,
            nodeIds: includeNodeIds,
            qualifiedNames: selectedQualifiedNames,
            excludedNodeIds,
            excludedQualifiedNames,
            includeSystem: false,
            inheritFutureChildren: true,
          } : undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.validation?.errors?.join(' ') || payload.error || 'Source registration failed.')
      setStatus(isFile ? `Connection is ready. ${isCsv ? 'CSV' : 'FILE'} source registered successfully.` : 'Database connection and governed discovery scope saved. Catalog Discovery publishes complete physical facts first; lineage, AI semantics, PII, business-domain, criticality and glossary enrichment run separately.')
      if (payload.source) window.dispatchEvent(new CustomEvent('dgp:source-created', { detail: { id: payload.source.id, projectId: payload.source.project_id, name: payload.source.name, sourceType: payload.source.source_type, status: payload.source.status } }))
    } catch (e) { setError(true); setStatus(e instanceof Error ? e.message : 'Source registration failed.') } finally { setBusy(false) }
  }

  const field = (label: string, value: string, setValue: (v:string)=>void, placeholder?: string, type = 'text', required = true) => <label className="space-y-1.5 text-sm"><span className="font-medium">{label} {required && <span className="text-rose-500">*</span>}</span><input type={type} value={value} onChange={e => setValue(e.target.value)} disabled={busy} placeholder={placeholder} className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>

  return <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
    <div className="mb-5"><h2 className="text-lg font-semibold">Connect a data source</h2><p className="mt-1 text-sm text-slate-500">Connect first. DataNexus then reads and presents the hierarchy exposed by the underlying database or application. Credentials are stored securely and never shown again.</p></div>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1.5 text-sm"><span className="font-medium">Project <span className="text-rose-500">*</span></span><select value={createProjectOpen ? CREATE_PROJECT : projectId} onChange={e => e.target.value === CREATE_PROJECT ? setCreateProjectOpen(true) : (setProjectId(e.target.value), setCredentialRef(''), resetHierarchy())} disabled={busy || Boolean(initialSource)} className="w-full rounded-lg border bg-white px-3 py-2.5">{availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}{organizations.length > 0 && <option value={CREATE_PROJECT}>＋ Create new project…</option>}</select></label>
      <label className="space-y-1.5 text-sm"><span className="font-medium">Connection type <span className="text-rose-500">*</span></span><select value={connectionKind} onChange={e => resetConnection(e.target.value as ConnectionKind)} disabled={busy || Boolean(initialSource)} className="w-full rounded-lg border bg-white px-3 py-2.5">{CONNECTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><span className="text-xs text-slate-500">{selected.description}</span></label>
      <ConnectionPrerequisites connectionKind={connectionKind} />
      <div className="md:col-span-2 rounded-xl border border-violet-100 bg-violet-50/60 p-4"><div className="flex items-start gap-3"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" /><div><div className="text-xs font-semibold text-violet-900">Tips for {selected.label}</div><ul className="mt-2 grid gap-1.5 text-xs leading-5 text-violet-900/80 sm:grid-cols-3">{selected.tips.map(tip => <li key={tip}>• {tip}</li>)}</ul></div></div></div>
      {createProjectOpen && organizations.length > 0 && <div className="md:col-span-2 rounded-xl border border-blue-100 bg-blue-50/50 p-4"><div className="grid gap-3 md:grid-cols-3"><select value={organizationId} onChange={e => setOrganizationId(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select><input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="New project name" className="rounded-lg border bg-white px-3 py-2 text-sm" /><div className="flex gap-2"><button type="button" onClick={() => void createProject()} disabled={busy || !newProjectName.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Create</button><button type="button" onClick={() => setCreateProjectOpen(false)} className="rounded-lg border px-3 py-2 text-xs">Cancel</button></div></div></div>}
      {field('Connection name', name, setName, `${selected.label} connection`)}
      {isFile ? field(isCsv ? 'CSV URL / storage path' : 'File URL / storage path', jdbcUrl, setJdbcUrl, selected.placeholder) : <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="mb-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-sm font-semibold">{selected.label} connection details</span></div><div className="grid gap-3 md:grid-cols-2">
        {connectionKind === 'jdbc' && field('JDBC driver', driver, setDriver, 'Driver / product name', 'text', false)}
        {connectionKind !== 'jdbc' && connectionKind !== 'databricks' && field('Host', host, value => { setHost(value); resetHierarchy() }, 'database.example.com')}
        {connectionKind !== 'jdbc' && connectionKind !== 'databricks' && field('Port', port, value => { setPort(value); resetHierarchy() }, connectionKind === 'mssql' ? '1433' : connectionKind === 'mysql' ? '3306' : '5432')}
        {connectionKind === 'databricks' && field('Server hostname', host, value => { setHost(value); resetHierarchy() }, 'dbc-xxxx.cloud.databricks.com')}
        {connectionKind === 'databricks' && field('HTTP path', httpPath, value => { setHttpPath(value); resetHierarchy() }, '/sql/1.0/warehouses/...')}
        {connectionKind !== 'databricks' && connectionKind !== 'jdbc' && field('Database', database, value => { setDatabase(value); resetHierarchy() }, 'database')}
        {connectionKind === 'jdbc' && field('JDBC URL', jdbcUrl, value => { setJdbcUrl(value); resetHierarchy() }, selected.placeholder)}
        {connectionKind !== 'databricks' && field('Username', username, value => { setUsername(value); setCredentialRef(''); resetHierarchy() }, 'Database username')}
        {connectionKind === 'databricks' ? field('Access token', token, value => { setToken(value); if (value) setCredentialRef(''); resetHierarchy() }, credentialRef ? 'Saved token will be reused' : 'Workspace token', 'password', !credentialRef) : field('Password', password, value => { setPassword(value); setCredentialRef(''); resetHierarchy() }, 'Database password', 'password')}
        {connectionKind !== 'databricks' && connectionKind !== 'jdbc' && <label className="space-y-1.5 text-sm"><span className="font-medium">{connectionKind === 'mssql' ? 'Encryption' : 'SSL mode'} <span className="text-rose-500">*</span></span><select value={ssl} onChange={e => { setSsl(e.target.value); resetHierarchy() }} className="w-full rounded-lg border bg-white px-3 py-2.5"><option value="require">Require</option><option value="verify-ca">Verify CA</option><option value="verify-full">Verify full</option></select></label>}
      </div></div>}
      {!isFile && credentialRef && <div className="md:col-span-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />Database credentials securely configured for this connection.</div>}
      {capabilities && <div className="md:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><ShieldCheck className="h-4 w-4" />Connector capabilities reported by source adapter</div><div className="mt-3 grid gap-2 text-xs text-emerald-950/80 sm:grid-cols-2 lg:grid-cols-4"><span>Stable object IDs: <strong>{capabilityLabel(capabilities.stable_object_ids)}</strong></span><span>Partitioning: <strong>{capabilityLabel(capabilities.partitioning)}</strong></span><span>Resumable partitions: <strong>{capabilityLabel(capabilities.resumable_partitions)}</strong></span><span>Provider snapshot: <strong>{capabilityLabel(capabilities.provider_snapshot)}</strong></span><span>Full listing: <strong>{capabilityLabel(capabilities.authoritative_full_listing)}</strong></span><span>Deletion evidence: <strong>{capabilityLabel(capabilities.deletion_evidence)}</strong></span><span>Field metadata: <strong>{capabilityLabel(capabilities.field_metadata)}</strong></span><span>Lineage enrichment: <strong>{capabilityLabel(capabilities.lineage_enrichment)}</strong></span></div></div>}
      {hierarchy && <NativeHierarchyPicker hierarchy={hierarchy} mode={selectionMode} selectedNodeIds={selectedNodeIds} disabled={busy} onModeChange={setSelectionMode} onSelectionChange={setSelectedNodeIds} />}
      {columns.length > 0 && <div className="md:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs text-slate-600"><strong className="text-slate-800">Validated source:</strong> {columns.length} profile fields{typeof rowCount === 'number' ? ` · ${rowCount} rows` : ''}</div>}
      <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={discover} disabled={busy || !projectId} className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 disabled:opacity-50">{busy ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Working…</span> : isCsv ? 'Validate CSV' : connectionKind === 'file' ? 'Scan file & metadata' : 'Connect & discover native hierarchy'}</button><button type="button" onClick={register} disabled={busy || !projectId || !name.trim() || (!isFile && !hierarchy)} className="flex-1 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isFile ? 'Save & make ready' : 'Save connection & governed scope'}</button></div>
      {!isFile && <Link href="/catalog/discovery" className="md:col-span-2 text-sm font-semibold text-blue-700">Open Catalog Discovery</Link>}
      {status && <div className={`md:col-span-2 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{error ? <CircleAlert className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4" />}{status}</div>}
    </div>
  </section>
}
