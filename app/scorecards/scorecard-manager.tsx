'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'

type Project = { id: string; name: string }
type Scorecard = {
  id?: string
  project_id?: string
  overall_score: number | string
  dimensions: Record<string, number | string>
  evidence: Record<string, unknown>
  calculated_at?: string
}

function percent(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : 'N/A'
}

function label(key: string) {
  return key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function ScorecardManager({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [history, setHistory] = useState<Scorecard[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = useMemo(() => projects.find((project) => project.id === projectId), [projects, projectId])

  async function load(refresh = false) {
    if (!projectId) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/scorecards/${encodeURIComponent(projectId)}`, { method: refresh ? 'POST' : 'GET' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load governance scorecard.')
      setScorecard(payload.scorecard ?? null)
      if (Array.isArray(payload.history)) setHistory(payload.history)
      if (refresh) {
        const historyResponse = await fetch(`/api/scorecards/${encodeURIComponent(projectId)}`)
        const historyPayload = await historyResponse.json().catch(() => ({}))
        if (historyResponse.ok && Array.isArray(historyPayload.history)) setHistory(historyPayload.history)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load governance scorecard.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void load(false) }, [projectId])

  const dimensions = Object.entries(scorecard?.dimensions ?? {})
  const evidence = Object.entries(scorecard?.evidence ?? {})

  return <div className="space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Evidence based governance</p><h2 className="mt-1 text-2xl font-black">Project scorecard</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Scores are calculated only from persisted catalog, stewardship, profiling, quality, observability, certification, contract and remediation evidence.</p></div>
        <div className="flex flex-wrap items-end gap-3"><label className="min-w-64 text-sm font-semibold">Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button type="button" onClick={() => void load(true)} disabled={busy || !projectId} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh</button></div>
      </div>
    </section>

    {error ? <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</section> : null}

    {scorecard ? <>
      <section className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <article className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><ShieldCheck className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Overall governance score</p><p className="text-5xl font-black text-slate-950">{percent(scorecard.overall_score)}</p></div></div><p className="mt-5 text-sm text-slate-500">{selected?.name ?? 'Project'} · {scorecard.calculated_at ? `Calculated ${new Date(scorecard.calculated_at).toLocaleString()}` : 'Calculated now'}</p></article>
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-violet-600" /><h3 className="text-lg font-bold">Control dimensions</h3></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{dimensions.map(([key, value]) => <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-700">{label(key)}</span><span className="text-lg font-black">{percent(value)}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.max(0, Math.min(100, Number(value) * 100))}%` }} /></div></div>)}</div></article>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold">Evidence register</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{evidence.map(([key, value]) => <div key={key} className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label(key)}</p><p className="mt-2 text-2xl font-black">{typeof value === 'number' || typeof value === 'string' ? String(value) : JSON.stringify(value)}</p></div>)}</div></section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold">Recent score history</h3><div className="mt-4 space-y-2">{history.length ? history.map((item, index) => <div key={item.id ?? index} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm"><span className="text-slate-500">{item.calculated_at ? new Date(item.calculated_at).toLocaleString() : `Snapshot ${index + 1}`}</span><span className="font-black">{percent(item.overall_score)}</span></div>) : <p className="text-sm text-slate-500">History will accumulate as scheduled and manual scorecard refreshes run.</p>}</div></section>
    </> : busy ? <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />Calculating governance scorecard…</section> : null}
  </div>
}
