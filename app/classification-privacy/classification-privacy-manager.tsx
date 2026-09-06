'use client'

import { useMemo, useState } from 'react'

type Row = Record<string, any>

export function ClassificationPrivacyManager({ projects, datasets, sources, assets, labels, classifications, datasetCoverage, catalogCoverage, privacyHooks }: {
  projects: Row[]; datasets: Row[]; sources: Row[]; assets: Row[]; labels: Row[]; classifications: Row[]; datasetCoverage: Row[]; catalogCoverage: Row[]; privacyHooks: Row[]
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [targetType, setTargetType] = useState('CATALOG_ASSET')
  const [targetId, setTargetId] = useState('')
  const [labelId, setLabelId] = useState('')
  const [columnName, setColumnName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const sourceIds = useMemo(() => new Set(sources.filter(s => s.project_id === projectId).map(s => s.id)), [sources, projectId])
  const projectAssets = useMemo(() => assets.filter(a => sourceIds.has(a.source_id)), [assets, sourceIds])
  const projectDatasets = useMemo(() => datasets.filter(d => d.project_id === projectId), [datasets, projectId])
  const projectLabels = useMemo(() => labels.filter(l => l.project_id == null || l.project_id === projectId), [labels, projectId])
  const projectClassifications = useMemo(() => classifications.filter(c => c.project_id === projectId), [classifications, projectId])
  const selectedAsset = projectAssets.find(a => a.id === targetId)
  const fieldNames = Array.isArray(selectedAsset?.columns) ? selectedAsset.columns.map((c: Row) => c?.name).filter(Boolean) : []

  async function propose() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/classifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        projectId, labelId, targetType,
        datasetId: targetType === 'DATASET' ? targetId : null,
        discoveredAssetId: targetType === 'CATALOG_ASSET' ? targetId : null,
        columnName: columnName || null,
      }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Classification proposal failed')
      setMessage('Classification proposed for human review. No governance authority was implied by the proposal.')
      window.location.reload()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Classification proposal failed') }
    finally { setBusy(false) }
  }

  async function review(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/classifications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId, decision }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Classification review failed')
      setMessage(decision === 'APPROVED' ? 'Classification approved as human-governed authority.' : 'Classification rejected; proposal history remains preserved.')
      window.location.reload()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Classification review failed') }
    finally { setBusy(false) }
  }

  const datasetRows = datasetCoverage.filter(r => r.project_id === projectId)
  const catalogRows = catalogCoverage.filter(r => r.project_id === projectId)
  const hookRows = privacyHooks.filter(r => r.project_id === projectId)

  return <div className="mt-6 space-y-6">
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-semibold">Project<select className="mt-1 w-full rounded-lg border p-2 font-normal" value={projectId} onChange={e => { setProjectId(e.target.value); setTargetId('') }}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label className="text-sm font-semibold">Target<select className="mt-1 w-full rounded-lg border p-2 font-normal" value={targetType} onChange={e => { setTargetType(e.target.value); setTargetId(''); setColumnName('') }}>
          <option value="CATALOG_ASSET">Current catalog asset</option><option value="DATASET">Dataset</option>
        </select></label>
        <label className="text-sm font-semibold">Asset / dataset<select className="mt-1 w-full rounded-lg border p-2 font-normal" value={targetId} onChange={e => { setTargetId(e.target.value); setColumnName('') }}>
          <option value="">Select…</option>
          {(targetType === 'CATALOG_ASSET' ? projectAssets : projectDatasets).map(r => <option key={r.id} value={r.id}>{r.asset_key ?? r.name}</option>)}
        </select></label>
        <label className="text-sm font-semibold">Classification<select className="mt-1 w-full rounded-lg border p-2 font-normal" value={labelId} onChange={e => setLabelId(e.target.value)}>
          <option value="">Select…</option>{projectLabels.map(l => <option key={l.id} value={l.id}>{l.code} · {l.name} · L{l.sensitivity_level ?? '?'}</option>)}
        </select></label>
        <label className="text-sm font-semibold">Field (optional)<select className="mt-1 w-full rounded-lg border p-2 font-normal" value={columnName} onChange={e => setColumnName(e.target.value)} disabled={targetType !== 'CATALOG_ASSET' || !selectedAsset}>
          <option value="">Whole asset</option>{fieldNames.map((name: string) => <option key={name} value={name}>{name}</option>)}
        </select></label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={busy || !projectId || !targetId || !labelId} onClick={propose}>Propose classification</button>
        <p className="text-xs text-slate-500">Human proposals still enter review. Source observations and AI suggestions are never silently authoritative.</p>
      </div>
      {message && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{message}</p>}
    </section>

    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="font-black">Review queue &amp; governed state</h2>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">Target</th><th className="p-2">Field</th><th className="p-2">Origin</th><th className="p-2">Authority</th><th className="p-2">State</th><th className="p-2">Decision</th></tr></thead><tbody>
        {projectClassifications.map(c => <tr key={c.id} className="border-b last:border-0"><td className="p-2">{c.target_locator ?? c.dataset_id ?? 'Dataset'}</td><td className="p-2">{c.column_name ?? '—'}</td><td className="p-2">{c.origin}</td><td className="p-2 font-semibold">{c.authority_state}</td><td className="p-2">{c.target_state}</td><td className="p-2">{c.status === 'SUGGESTED' ? <span className="flex gap-2"><button disabled={busy} onClick={() => review(c.id, 'APPROVED')} className="rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white">Approve</button><button disabled={busy} onClick={() => review(c.id, 'REJECTED')} className="rounded bg-slate-700 px-2 py-1 text-xs font-bold text-white">Reject</button></span> : c.status}</td></tr>)}
        {!projectClassifications.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No governed classification records for this project.</td></tr>}
      </tbody></table></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-black">Dataset coverage</h3><p className="mt-2 text-3xl font-black">{datasetRows.filter(r => r.coverage_state === 'GOVERNED').length}/{datasetRows.length}</p><p className="text-xs text-slate-500">with at least one authoritative classification</p></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-black">Catalog coverage</h3><p className="mt-2 text-3xl font-black">{catalogRows.filter(r => r.coverage_state === 'GOVERNED').length}/{catalogRows.length}</p><p className="text-xs text-slate-500">stable current catalog identities governed</p></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-black">Privacy control hooks</h3><p className="mt-2 text-3xl font-black">{hookRows.length}</p><p className="text-xs text-slate-500">declarative intents only; external enforcement is not claimed</p></div>
    </section>
  </div>
}
