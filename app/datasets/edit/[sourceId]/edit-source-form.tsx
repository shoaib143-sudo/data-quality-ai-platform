'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Save, ShieldCheck } from 'lucide-react'

type Props = { source: { id: string; projectId: string; projectName: string; name: string; sourceType: string; connectionKind: string; jdbcUrl: string; schema: string; table: string; status: string } }

export function EditSourceForm({ source }: Props) {
  const [name, setName] = useState(source.name)
  const [jdbcUrl, setJdbcUrl] = useState(source.jdbcUrl)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [schema, setSchema] = useState(source.schema)
  const [table, setTable] = useState(source.table)
  const [schemas, setSchemas] = useState<string[]>([])
  const [tables, setTables] = useState<Array<{ name: string; type?: string | null }>>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)

  async function testAndSave() {
    setBusy(true); setError(false); setStatus('Testing the connection…')
    try {
      if (!jdbcUrl.trim() || !schema.trim() || !table.trim()) throw new Error('JDBC URL, schema, and table/view are required.')
      if (!username.trim() || !password) throw new Error('Enter the credentials for this connection type before testing.')
      const credentialResponse = await fetch('/api/datasets/source/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: source.projectId, connectionKind: source.connectionKind, username: username.trim(), password }) })
      const credentialPayload = await credentialResponse.json().catch(() => ({}))
      if (!credentialResponse.ok) throw new Error(credentialPayload.error ?? 'Unable to securely configure credentials.')
      const credentialRef = credentialPayload.credentialRef
      const discoveryResponse = await fetch('/api/datasets/source/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: source.projectId, jdbcUrl: jdbcUrl.trim(), connectionKind: source.connectionKind, schema: schema.trim(), credentialRef }) })
      const discoveryPayload = await discoveryResponse.json().catch(() => ({}))
      if (!discoveryResponse.ok) throw new Error(discoveryPayload.error ?? discoveryPayload.validation?.errors?.join(' ') ?? 'Connection test failed.')
      setSchemas(discoveryPayload.schemas ?? []); setTables(discoveryPayload.tables ?? [])
      const saveResponse = await fetch('/api/datasets/source/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: source.projectId, name: name.trim(), sourceType: 'JDBC', jdbcUrl: jdbcUrl.trim(), connectionKind: source.connectionKind, schema: schema.trim(), table: table.trim(), credentialRef }) })
      const savePayload = await saveResponse.json().catch(() => ({}))
      if (!saveResponse.ok) throw new Error(savePayload.error ?? savePayload.validation?.errors?.join(' ') ?? 'Unable to save the connection.')
      setPassword(''); setStatus(`Connection tested successfully and saved. ${schema.trim()}.${table.trim()} is ready for use.`)
    } catch (e) { setError(true); setStatus(e instanceof Error ? e.message : 'Connection update failed.') } finally { setBusy(false) }
  }

  return <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8"><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wide text-blue-600">{source.connectionKind}</div><h2 className="mt-1 text-xl font-bold">Connection details</h2><p className="mt-1 text-sm text-slate-500">Project: {source.projectName}. Saved credentials are never revealed, so enter them again when updating the connection.</p></div><div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Credentials handled securely</div></div><div className="grid gap-4 md:grid-cols-2"><label className="space-y-1.5 text-sm md:col-span-2"><span className="font-medium">Connection name *</span><input value={name} onChange={e => setName(e.target.value)} disabled={busy} className="w-full rounded-lg border bg-white px-3 py-2.5" /></label><label className="space-y-1.5 text-sm md:col-span-2"><span className="font-medium">JDBC URL *</span><input value={jdbcUrl} onChange={e => setJdbcUrl(e.target.value)} disabled={busy} placeholder="jdbc:mysql://host:3306/database" className="w-full rounded-lg border bg-white px-3 py-2.5 font-mono text-sm" /><span className="text-xs text-slate-500">Example MySQL URL: jdbc:mysql://mysql.example.com:3306/sales_db</span></label><label className="space-y-1.5 text-sm"><span className="font-medium">Username *</span><input value={username} onChange={e => setUsername(e.target.value)} disabled={busy} placeholder="data_reader" className="w-full rounded-lg border bg-white px-3 py-2.5" /></label><label className="space-y-1.5 text-sm"><span className="font-medium">Password *</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} placeholder="Enter password again" autoComplete="new-password" className="w-full rounded-lg border bg-white px-3 py-2.5" /></label><label className="space-y-1.5 text-sm"><span className="font-medium">Schema *</span><input value={schema} onChange={e => setSchema(e.target.value)} disabled={busy} list="edit-source-schemas" placeholder="sales" className="w-full rounded-lg border bg-white px-3 py-2.5" /></label><label className="space-y-1.5 text-sm"><span className="font-medium">Table / view *</span><input value={table} onChange={e => setTable(e.target.value)} disabled={busy} list="edit-source-tables" placeholder="customers" className="w-full rounded-lg border bg-white px-3 py-2.5" /></label></div><datalist id="edit-source-schemas">{schemas.map(item => <option key={item} value={item} />)}</datalist><datalist id="edit-source-tables">{tables.map(item => <option key={item.name} value={item.name} />)}</datalist><div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-700"><strong>How this works:</strong> enter the current connection details and credentials, test discovery, then the verified connection is saved as ready. The password is sent only through the secure credential flow and is not returned to the browser after saving.</div><div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void testAndSave()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? 'Testing and saving…' : 'Test connection & save'}</button>{status ? <span className={`inline-flex items-center gap-2 text-sm ${error ? 'text-rose-700' : 'text-emerald-700'}`}>{!error && <CheckCircle2 className="h-4 w-4" />}{status}</span> : null}</div></section>
}
