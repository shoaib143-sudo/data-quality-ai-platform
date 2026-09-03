'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Loader2, Network, Send } from 'lucide-react'

type Project = { id: string; name: string }
type LineageState = { integrations: Array<Record<string, unknown>>; events: Array<Record<string, unknown>>; assets: Array<Record<string, unknown>> }

const example = {
  sourceKey: 'openlineage-airflow',
  eventId: 'run-2026-09-04-001',
  eventType: 'COMPLETE',
  job: { namespace: 'finance', name: 'customer_master_transform' },
  inputs: [{ namespace: 'raw', name: 'customers' }],
  outputs: [{ namespace: 'curated', name: 'customer_master' }],
}

export function LineageIngestManager({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [payload, setPayload] = useState(JSON.stringify(example, null, 2))
  const [state, setState] = useState<LineageState>({ integrations: [], events: [], assets: [] })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    if (!projectId) return
    const response = await fetch(`/api/lineage/ingest?projectId=${encodeURIComponent(projectId)}`)
    const result = await response.json().catch(() => ({}))
    if (response.ok) setState({ integrations: result.integrations ?? [], events: result.events ?? [], assets: result.assets ?? [] })
  }

  useEffect(() => { void load() }, [projectId])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      const response = await fetch('/api/lineage/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...parsed, projectId }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? 'Lineage ingestion failed.')
      setMessage(result.reused ? 'Lineage event already processed. Existing result reused.' : `Lineage event accepted with ${result.edgeCount ?? 0} persisted edges.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lineage ingestion failed.')
    } finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Open lineage ingestion</p><h2 className="mt-1 text-2xl font-black">External execution lineage</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Accept idempotent OpenLineage-style input and output events from orchestrators, transformation systems and query-history collectors.</p></div><label className="min-w-64 text-sm font-semibold">Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div></section>

    <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      <form onSubmit={(event) => void submit(event)} className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><Network className="h-5 w-5 text-violet-600" /><h3 className="text-lg font-bold">Ingest event</h3></div><p className="mt-2 text-sm text-slate-500">Use stable event IDs to make retries safe. Inputs and outputs may reference registered dataset IDs or external namespace/name pairs.</p><textarea value={payload} onChange={(event) => setPayload(event.target.value)} rows={18} className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100" /><button disabled={busy || !projectId} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Ingest lineage event</button>{message ? <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p> : null}{error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}</form>

      <div className="space-y-4"><article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Integrations</p><p className="mt-2 text-4xl font-black">{state.integrations.length}</p></article><article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">External assets</p><p className="mt-2 text-4xl font-black">{state.assets.length}</p></article><article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent ingestion events</p><div className="mt-4 space-y-2">{state.events.slice(0, 12).map((row) => <div key={String(row.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-bold">{String(row.job_name ?? row.event_type ?? 'Lineage event')}</span><span>{String(row.edge_count ?? 0)} edges</span></div><p className="mt-1 truncate text-slate-400">{String(row.external_event_id ?? '')}</p></div>)}</div></article></div>
    </section>
  </div>
}
