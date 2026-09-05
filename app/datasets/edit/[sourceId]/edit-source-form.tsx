'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Save, ShieldCheck } from 'lucide-react'
import { NativeHierarchyPicker } from '../../native-hierarchy-picker'
import type { NativeHierarchyResult } from '@/lib/connectors/native-hierarchy'

type SavedSelection = { mode: 'ALL' | 'SELECTED'; nodeIds: string[]; qualifiedNames: string[] }
type Props = { source: { id: string; projectId: string; projectName: string; name: string; sourceType: string; connectionKind: string; jdbcUrl: string; credentialRef: string; hierarchySelection: SavedSelection; status: string } }

export function EditSourceForm({ source }: Props) {
  const [name, setName] = useState(source.name)
  const [jdbcUrl, setJdbcUrl] = useState(source.jdbcUrl)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [credentialRef, setCredentialRef] = useState(source.credentialRef)
  const [hierarchy, setHierarchy] = useState<NativeHierarchyResult | null>(null)
  const [selectionMode, setSelectionMode] = useState<'ALL' | 'SELECTED'>(source.hierarchySelection.mode)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(source.hierarchySelection.nodeIds)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const isDatabricks = source.connectionKind.toLowerCase() === 'databricks' || jdbcUrl.toLowerCase().startsWith('jdbc:databricks:')

  async function provisionCredentials() {
    if (credentialRef && !password) return credentialRef
    const effectiveUsername = isDatabricks ? 'token' : username.trim()
    if (!effectiveUsername || !password) throw new Error(isDatabricks ? 'Enter a Databricks access token when replacing the saved credential.' : 'Enter username and password when replacing the saved credential.')
    const response = await fetch('/api/datasets/source/credentials', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: source.projectId, sourceId: source.id, jdbcUrl: jdbcUrl.trim(), connectionKind: source.connectionKind, username: effectiveUsername, password }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error ?? 'Unable to securely configure credentials.')
    setCredentialRef(payload.credentialRef)
    setPassword('')
    return payload.credentialRef as string
  }

  async function discover() {
    setBusy(true); setError(false); setStatus('Connecting and reading the source hierarchy…')
    try {
      if (!jdbcUrl.trim()) throw new Error('JDBC URL is required.')
      const ref = await provisionCredentials()
      const response = await fetch('/api/datasets/source/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: source.projectId, jdbcUrl: jdbcUrl.trim(), connectionKind: source.connectionKind, credentialRef: ref }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Connection discovery failed.')
      const discovered = payload.hierarchy as NativeHierarchyResult | undefined
      if (!discovered?.nodes?.length) throw new Error('The database did not return a native hierarchy.')
      setHierarchy(discovered)

      if (source.hierarchySelection.mode === 'SELECTED') {
        const ids = new Set(discovered.nodes.map(node => node.id))
        const byQualified = new Map(discovered.nodes.map(node => [node.qualifiedName, node.id]))
        const restored = [
          ...source.hierarchySelection.nodeIds.filter(id => ids.has(id)),
          ...source.hierarchySelection.qualifiedNames.map(name => byQualified.get(name)).filter((id): id is string => Boolean(id)),
        ]
        setSelectedNodeIds([...new Set(restored)])
        setSelectionMode('SELECTED')
      }
      setStatus(`Connected to ${discovered.databaseProduct}. ${discovered.nodes.length} native hierarchy nodes are available for scope selection.`)
    } catch (e) { setError(true); setStatus(e instanceof Error ? e.message : 'Connection discovery failed.') } finally { setBusy(false) }
  }

  async function save() {
    setBusy(true); setError(false); setStatus('Validating and saving the native hierarchy scope…')
    try {
      if (!hierarchy) throw new Error('Connect and discover the current source hierarchy before saving.')
      if (selectionMode === 'SELECTED' && selectedNodeIds.length === 0) throw new Error('Select at least one native hierarchy node.')
      const ref = await provisionCredentials()
      const qualifiedNames = selectedNodeIds.map(id => hierarchy.nodes.find(node => node.id === id)?.qualifiedName).filter((value): value is string => Boolean(value))
      const response = await fetch('/api/datasets/source/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: source.projectId,
          sourceId: source.id,
          name: name.trim(),
          sourceType: 'JDBC',
          jdbcUrl: jdbcUrl.trim(),
          connectionKind: source.connectionKind,
          credentialRef: ref,
          connectionOnly: true,
          hierarchySelection: { mode: selectionMode, nodeIds: selectedNodeIds, qualifiedNames },
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save the connection.')
      setStatus('Connection and native hierarchy scope saved successfully.')
    } catch (e) { setError(true); setStatus(e instanceof Error ? e.message : 'Connection update failed.') } finally { setBusy(false) }
  }

  return <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wide text-blue-600">{source.connectionKind}</div><h2 className="mt-1 text-xl font-bold">Connection details</h2><p className="mt-1 text-sm text-slate-500">Project: {source.projectName}. Reconnect to read the current hierarchy from the underlying source before changing scope.</p></div><div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Saved credential remains referenced securely</div></div>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1.5 text-sm md:col-span-2"><span className="font-medium">Connection name *</span><input value={name} onChange={e => setName(e.target.value)} disabled={busy} className="w-full rounded-lg border bg-white px-3 py-2.5" /></label>
      <label className="space-y-1.5 text-sm md:col-span-2"><span className="font-medium">JDBC URL *</span><input value={jdbcUrl} onChange={e => { setJdbcUrl(e.target.value); setHierarchy(null) }} disabled={busy} className="w-full rounded-lg border bg-white px-3 py-2.5 font-mono text-sm" /></label>
      {!isDatabricks && <label className="space-y-1.5 text-sm"><span className="font-medium">New username <span className="text-slate-400">(only to replace credential)</span></span><input value={username} onChange={e => { setUsername(e.target.value); if (e.target.value) setCredentialRef('') }} disabled={busy} placeholder="Leave blank to reuse saved credential" className="w-full rounded-lg border bg-white px-3 py-2.5" /></label>}
      <label className="space-y-1.5 text-sm"><span className="font-medium">{isDatabricks ? 'New access token' : 'New password'} <span className="text-slate-400">(optional)</span></span><input type="password" value={password} onChange={e => { setPassword(e.target.value); if (e.target.value) setCredentialRef('') }} disabled={busy} placeholder="Leave blank to reuse saved credential" autoComplete="new-password" className="w-full rounded-lg border bg-white px-3 py-2.5" /></label>
      <div className="md:col-span-2"><button type="button" onClick={() => void discover()} disabled={busy || !jdbcUrl.trim()} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-700 disabled:opacity-50">{busy ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Working…</span> : 'Reconnect & discover native hierarchy'}</button></div>
      {hierarchy && <NativeHierarchyPicker hierarchy={hierarchy} mode={selectionMode} selectedNodeIds={selectedNodeIds} disabled={busy} onModeChange={setSelectionMode} onSelectionChange={setSelectedNodeIds} />}
    </div>
    <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void save()} disabled={busy || !hierarchy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? 'Saving…' : 'Save connection & scope'}</button>{status ? <span className={`inline-flex items-center gap-2 text-sm ${error ? 'text-rose-700' : 'text-emerald-700'}`}>{!error && <CheckCircle2 className="h-4 w-4" />}{status}</span> : null}</div>
  </section>
}
