'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Clock3, History, Loader2, X } from 'lucide-react'

type Run = {
  id: string
  datasetName: string
  versionNumber: number | null
  status: string
  engineName: string | null
  rowCount: number | null
  columnCount: number | null
  startedAt: string | null
  completedAt: string | null
  errorCode: string | null
}

function statusClass(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (normalized === 'FAILED' || normalized === 'CANCELLED') return 'border-red-200 bg-red-50 text-red-700'
  if (normalized === 'PARTIAL') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

export default function ProfilingRunHistory() {
  const [open, setOpen] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open || runs.length) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch('/api/profiling/runs?limit=50', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Unable to load profiling run history.')
        return Array.isArray(payload.runs) ? payload.runs as Run[] : []
      })
      .then(setRuns)
      .catch((cause) => {
        if ((cause as Error).name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'Unable to load profiling run history.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, runs.length])

  const visibleRuns = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return runs
    return runs.filter((run) => [run.datasetName, run.status, run.engineName, run.id, run.errorCode]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalized))
  }, [query, runs])

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-700 shadow-lg hover:bg-blue-50"
    >
      <History className="h-4 w-4" /> Run history
    </button>

    {open ? <div className="fixed inset-0 z-50 bg-slate-950/30" onClick={() => setOpen(false)}>
      <aside className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Profiling run history</h2>
            <p className="mt-1 text-sm text-slate-500">Open any RLS-authorized persisted run in the deeper profiling explorer.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border p-2"><X className="h-4 w-4" /></button>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search dataset, status, engine or run ID"
          className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
        />

        {loading ? <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading runs</div> : null}
        {error ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="mt-5 space-y-3">
          {visibleRuns.map((run) => <Link
            key={run.id}
            href={`/profiling/explorer?runId=${encodeURIComponent(run.id)}`}
            onClick={() => setOpen(false)}
            className="block rounded-2xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-slate-900">{run.datasetName}{run.versionNumber !== null ? ` · v${run.versionNumber}` : ''}</div>
                <div className="mt-1 font-mono text-[11px] text-slate-400">{run.id}</div>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(run.status)}`}>{run.status}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>{run.rowCount ?? 'N/A'} rows</span>
              <span>{run.columnCount ?? 'N/A'} columns</span>
              <span>{run.engineName ?? 'unknown engine'}</span>
              {run.startedAt ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(run.startedAt).toLocaleString()}</span> : null}
            </div>
            {run.errorCode ? <div className="mt-2 text-xs font-semibold text-red-600">{run.errorCode}</div> : null}
          </Link>)}
          {!loading && !visibleRuns.length ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No profiling runs match this view.</div> : null}
        </div>
      </aside>
    </div> : null}
  </>
}
