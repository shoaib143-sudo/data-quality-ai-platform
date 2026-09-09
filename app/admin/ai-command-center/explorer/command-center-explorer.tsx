'use client'

import { useMemo, useState } from 'react'
import { Activity, Search, SlidersHorizontal } from 'lucide-react'

import {
  commandCenterExplorerCounts,
  filterCommandCenterExplorerItems,
  type CommandCenterExplorerCategory,
  type CommandCenterExplorerItem,
} from '@/lib/ai/command-center-explorer'

const categoryLabels: Record<CommandCenterExplorerCategory, string> = {
  AI_SYSTEM: 'AI systems',
  FINDING: 'Findings',
  EVALUATION: 'Evaluations',
  TELEMETRY: 'Telemetry',
  INVESTIGATION: 'Investigations',
  ROUTING_POLICY: 'Routing policies',
  AUTONOMY_ACTION: 'Autonomy actions',
}

function statusTone(status: string) {
  const value = status.toUpperCase()
  if (['ERROR', 'FAIL', 'FAILED', 'CRITICAL', 'KILL', 'REJECTED', 'REVOKED'].includes(value)) return 'border-red-200 bg-red-50 text-red-800'
  if (['WARN', 'HIGH', 'PARTIAL', 'PAUSE', 'PENDING', 'PENDING_APPROVAL', 'DRAFT'].includes(value)) return 'border-amber-200 bg-amber-50 text-amber-800'
  if (['SUCCESS', 'PASS', 'ACTIVE', 'APPROVED', 'RUNNING', 'ENABLED'].includes(value)) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

export default function CommandCenterExplorer({ items }: { items: CommandCenterExplorerItem[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CommandCenterExplorerCategory | 'ALL'>('ALL')
  const [status, setStatus] = useState('ALL')
  const [sort, setSort] = useState<'NEWEST' | 'OLDEST' | 'TITLE'>('NEWEST')

  const counts = useMemo(() => commandCenterExplorerCounts(items), [items])
  const statuses = useMemo(() => Object.keys(counts.byStatus).sort(), [counts.byStatus])
  const filtered = useMemo(() => filterCommandCenterExplorerItems(items, { query, category, status, sort }), [items, query, category, status, sort])

  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <article className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Canonical records</p><p className="mt-2 text-3xl font-black">{counts.total}</p></article>
      <article className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Visible after filters</p><p className="mt-2 text-3xl font-black">{filtered.length}</p></article>
      <article className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Evidence categories</p><p className="mt-2 text-3xl font-black">{Object.keys(counts.byCategory).length}</p></article>
      <article className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Recorded statuses</p><p className="mt-2 text-3xl font-black">{statuses.length}</p></article>
    </section>

    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4"/><h2 className="font-black">Evidence filters</h2></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <label className="relative lg:col-span-2"><span className="sr-only">Search evidence</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, status, source or evidence detail" className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-sm"/></label>
        <label><span className="sr-only">Category</span><select value={category} onChange={(event) => setCategory(event.target.value as CommandCenterExplorerCategory | 'ALL')} className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="ALL">All categories</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="ALL">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">{Object.entries(categoryLabels).map(([value, label]) => <button key={value} type="button" onClick={() => setCategory(category === value ? 'ALL' : value as CommandCenterExplorerCategory)} className={`rounded-full border px-3 py-1 text-xs font-bold ${category === value ? 'border-violet-500 bg-violet-50 text-violet-800' : 'bg-white text-slate-600'}`}>{label} {counts.byCategory[value as CommandCenterExplorerCategory] ?? 0}</button>)}</div>
        <select value={sort} onChange={(event) => setSort(event.target.value as 'NEWEST' | 'OLDEST' | 'TITLE')} className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold"><option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option><option value="TITLE">Title A to Z</option></select>
      </div>
    </section>

    <section className="space-y-3">
      {filtered.length ? filtered.map((item) => <details key={`${item.category}:${item.id}`} className="group rounded-2xl border bg-white p-5 shadow-sm open:border-violet-200">
        <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border bg-slate-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">{categoryLabels[item.category]}</span><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${statusTone(item.status)}`}>{item.status}</span></div><h3 className="mt-2 text-base font-black text-slate-950">{item.title}</h3><p className="mt-1 text-sm text-slate-600">{item.subtitle}</p></div><div className="text-right text-xs text-slate-400"><p>{item.timestamp ? new Date(item.timestamp).toLocaleString() : 'No timestamp recorded'}</p><p className="mt-1 font-mono">{item.source}</p></div></div></summary>
        <div className="mt-4 border-t pt-4"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{item.details.map((detail) => <div key={`${item.id}:${detail.label}`} className="rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{detail.label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{detail.value || 'Not recorded'}</dd></div>)}</dl><p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><Activity className="h-3.5 w-3.5"/>Read-only canonical evidence projection. Expanding this record does not execute any governance action.</p></div>
      </details>) : <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No canonical evidence matches the active filters.</div>}
    </section>
  </div>
}
