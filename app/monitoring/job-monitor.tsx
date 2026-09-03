'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type MonitoringRun = {
  id: string
  agent_definition_id: string
  project_id: string
  dataset_id: string | null
  dataset_version_id: string | null
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
}

export type MonitoringStep = {
  id: string
  agent_run_id: string
  step_name: string
  step_order: number
  status: string
  attempt: number
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
}

export type MonitoringAgent = { id: string; name: string; version: string; agent_key: string }
export type MonitoringDataset = { id: string; name: string }

type Props = {
  initialRuns: MonitoringRun[]
  initialAgents: MonitoringAgent[]
  initialDatasets: MonitoringDataset[]
  initialSteps: MonitoringStep[]
  initialNow: string
  initialRunId?: string | null
  userId: string
}

const ACTIVE = new Set(['RUNNING', 'QUEUED', 'PENDING'])
const COMPLETE = new Set(['SUCCEEDED', 'COMPLETED'])
const DATE_FORMATTER = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' })
const TIME_FORMATTER = new Intl.DateTimeFormat('en-SG', { timeStyle: 'medium', timeZone: 'Asia/Singapore' })

function formatDate(value: string) { return DATE_FORMATTER.format(new Date(value)) }
function formatTime(value: string) { return TIME_FORMATTER.format(new Date(value)) }
function duration(run: MonitoringRun, now: Date) {
  const end = run.completed_at ? new Date(run.completed_at) : now
  const seconds = Math.max(0, Math.floor((end.getTime() - new Date(run.started_at ?? run.created_at).getTime()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}
function progress(steps: MonitoringStep[]) {
  if (!steps.length) return { percent: 0, label: 'Initializing' }
  const completed = steps.filter((s) => COMPLETE.has(s.status)).length
  const failed = steps.some((s) => s.status === 'FAILED')
  if (failed) return { percent: Math.round((completed / steps.length) * 100), label: 'Execution failed' }
  if (completed === steps.length) return { percent: 100, label: 'All steps complete' }
  return { percent: Math.max(5, Math.round((completed / steps.length) * 100)), label: `${completed} of ${steps.length} steps` }
}
function isStalled(run: MonitoringRun, now: Date) {
  if (!ACTIVE.has(run.status)) return false
  const started = new Date(run.started_at ?? run.created_at).getTime()
  return now.getTime() - started > 30 * 60 * 1000
}

function StatusBadge({ status }: { status: string }) {
  const active = ACTIVE.has(status)
  const complete = COMPLETE.has(status)
  const classes = complete
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400'
    : status === 'FAILED'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400'
      : active
        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-400'
        : 'border-border bg-muted/50 text-muted-foreground'
  const dot = complete ? 'bg-emerald-500' : status === 'FAILED' ? 'bg-red-500' : active ? 'bg-blue-500' : 'bg-muted-foreground'
  const label = status === 'SUCCEEDED' ? 'Completed' : status.charAt(0) + status.slice(1).toLowerCase()
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</span>
}

function MetricCard({ label, value, detail, tone, icon }: { label: string; value: number; detail: string; tone: 'active' | 'success' | 'danger' | 'neutral'; icon: string }) {
  const styles = {
    active: 'border-blue-200 bg-gradient-to-br from-blue-50 via-cyan-50/60 to-background dark:border-blue-900/50 dark:from-blue-950/30 dark:via-cyan-950/20',
    success: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50/60 to-background dark:border-emerald-900/50 dark:from-emerald-950/30 dark:via-teal-950/20',
    danger: 'border-red-200 bg-gradient-to-br from-red-50 via-orange-50/50 to-background dark:border-red-900/50 dark:from-red-950/30 dark:via-orange-950/20',
    neutral: 'border-violet-200 bg-gradient-to-br from-violet-50 via-indigo-50/50 to-background dark:border-violet-900/50 dark:from-violet-950/30 dark:via-indigo-950/20',
  }
  const iconStyles = {
    active: 'bg-blue-600 text-white shadow-blue-200 dark:shadow-blue-950',
    success: 'bg-emerald-600 text-white shadow-emerald-200 dark:shadow-emerald-950',
    danger: 'bg-red-600 text-white shadow-red-200 dark:shadow-red-950',
    neutral: 'bg-violet-600 text-white shadow-violet-200 dark:shadow-violet-950',
  }
  return <div className={`group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg ${styles[tone]}`}>
    <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/30 blur-2xl dark:bg-white/5" />
    <div className="relative flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg shadow-lg ${iconStyles[tone]}`}>{icon}</span></div>
  </div>
}

export function JobMonitor({ initialRuns, initialAgents, initialDatasets, initialSteps, initialNow, initialRunId = null, userId: _userId }: Props) {
  const [runs, setRuns] = useState(initialRuns)
  const [steps, setSteps] = useState(initialSteps)
  const [filter, setFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(initialRunId && initialRuns.some((run) => run.id === initialRunId) ? initialRunId : initialRuns[0]?.id ?? null)
  const [lastUpdated, setLastUpdated] = useState(() => new Date(initialNow))
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const agents = useMemo(() => new Map(initialAgents.map((a) => [a.id, a])), [initialAgents])
  const datasets = useMemo(() => new Map(initialDatasets.map((d) => [d.id, d])), [initialDatasets])
  const stepsByRun = useMemo(() => {
    const map = new Map<string, MonitoringStep[]>()
    for (const step of steps) map.set(step.agent_run_id, [...(map.get(step.agent_run_id) ?? []), step])
    for (const list of map.values()) list.sort((a, b) => a.step_order - b.step_order)
    return map
  }, [steps])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const supabase = createClient()
    const { data, error } = await supabase.schema('agent').from('agent_runs').select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message').order('created_at', { ascending: false }).limit(50)
    if (!error && data) {
      const nextRuns = data as MonitoringRun[]
      setRuns(nextRuns)
      const ids = nextRuns.map((r) => r.id)
      if (ids.length) {
        const { data: nextSteps, error: stepError } = await supabase.schema('agent').from('agent_run_steps').select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message').in('agent_run_id', ids).order('step_order')
        if (!stepError && nextSteps) setSteps(nextSteps as MonitoringStep[])
      } else setSteps([])
      setLastUpdated(new Date())
    }
    setRefreshing(false)
  }, [])
  useEffect(() => { const timer = window.setInterval(refresh, 3000); return () => window.clearInterval(timer) }, [refresh])
  useEffect(() => { if (!selectedId || !runs.some((r) => r.id === selectedId)) setSelectedId(runs[0]?.id ?? null) }, [runs, selectedId])

  const filtered = useMemo(() => filter === 'ALL' ? runs : runs.filter((r) => r.status === filter), [runs, filter])
  const selected = runs.find((r) => r.id === selectedId) ?? null
  const selectedSteps = selected ? stepsByRun.get(selected.id) ?? [] : []
  const active = runs.filter((r) => ACTIVE.has(r.status))
  const stalled = runs.filter((r) => isStalled(r, lastUpdated))
  const queued = runs.filter((r) => r.status === 'QUEUED' || r.status === 'PENDING').length
  const completed = runs.filter((r) => COMPLETE.has(r.status)).length
  const failed = runs.filter((r) => r.status === 'FAILED').length
  const hero = active[0]
  const heroSteps = hero ? stepsByRun.get(hero.id) ?? [] : []
  const heroProgress = hero ? progress(heroSteps) : null

  const selectRun = (id: string) => {
    setSelectedId(id)
    window.setTimeout(() => document.getElementById('selected-job')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const copyRunId = async () => {
    if (!selected) return
    await navigator.clipboard.writeText(selected.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-r from-slate-950 via-blue-950 to-violet-950 p-6 text-white shadow-xl sm:p-8 dark:from-slate-900 dark:via-blue-950 dark:to-violet-950">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" /><div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200"><span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]" /> Operations Center</div><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Job Monitoring</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">A live operational view of agent executions, progress, stalled jobs, and execution health.</p></div><div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur"><p className="text-xs text-slate-300">Live synchronization</p><p className="mt-1 text-sm font-semibold">Every 3 seconds</p></div></div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Active jobs" value={active.length} detail={stalled.length ? `${stalled.length} need attention` : active.length ? 'Execution in progress' : 'Nothing running right now'} tone="active" icon="●" />
      <MetricCard label="Queued" value={queued} detail="Waiting to execute" tone="neutral" icon="◷" />
      <MetricCard label="Completed" value={completed} detail="Successful executions" tone="success" icon="✓" />
      <MetricCard label="Failed" value={failed} detail="Requires attention" tone="danger" icon="!" />
    </section>

    {stalled.length > 0 && <section className="relative overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/30 dark:to-orange-950/20"><div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-orange-300/20 to-transparent" /><div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-lg">!</span><div><p className="font-semibold text-amber-950 dark:text-amber-300">{stalled.length} job{stalled.length === 1 ? '' : 's'} may be stalled</p><p className="mt-1 text-xs text-amber-900/70 dark:text-amber-400/80">Active for more than 30 minutes. Review execution steps and diagnostics before taking action.</p></div></div><button type="button" onClick={() => { setFilter('RUNNING'); if (stalled[0]) selectRun(stalled[0].id) }} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600">Review stalled jobs</button></div></section>}

    {hero && heroProgress ? <section className="relative overflow-hidden rounded-3xl border bg-card shadow-lg"><div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" /><div className="p-6 sm:p-8"><div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" /></span>Live execution</div><div className="mt-3 flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold tracking-tight">{agents.get(hero.agent_definition_id)?.name ?? 'Agent execution'} <span className="font-medium text-muted-foreground">v{agents.get(hero.agent_definition_id)?.version ?? '?'}</span></h2><StatusBadge status={hero.status} /></div><p className="mt-1 text-sm text-muted-foreground">{hero.dataset_id ? datasets.get(hero.dataset_id)?.name ?? 'Dataset unavailable' : 'Dataset unavailable'}</p></div><div className="rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 px-5 py-3 text-white shadow-lg"><p className="text-3xl font-bold tracking-tight">{heroProgress.percent}%</p><p className="text-xs text-blue-100">{heroProgress.label}</p></div></div><div className="mt-7 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 transition-all duration-500" style={{ width: `${heroProgress.percent}%` }} /></div><div className="mt-6 flex flex-wrap gap-3">{heroSteps.length ? heroSteps.map((step) => <div key={step.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${ACTIVE.has(step.status) ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300' : COMPLETE.has(step.status) ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-muted/40 text-muted-foreground'}`}><span className="font-semibold">{COMPLETE.has(step.status) ? '✓' : ACTIVE.has(step.status) ? '●' : '○'}</span><span>{step.step_name}</span></div>) : <span className="text-sm text-muted-foreground">Preparing execution steps…</span>}</div><div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-xs text-muted-foreground"><span>Running for <strong className="text-foreground">{duration(hero, lastUpdated)}</strong></span><span>Started {hero.started_at ? formatTime(hero.started_at) : 'Not started'}</span><button type="button" onClick={() => selectRun(hero.id)} className="ml-auto rounded-lg bg-foreground px-3 py-2 font-semibold text-background transition hover:opacity-90">Open execution</button></div></div></section> : <section className="rounded-3xl border border-dashed bg-card p-8 shadow-sm"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-lg text-white shadow-lg">✓</div><div><h2 className="font-semibold">All clear</h2><p className="mt-1 text-sm text-muted-foreground">There are no active executions right now.</p></div></div></section>}

    <section className="overflow-hidden rounded-3xl border bg-card shadow-lg"><div className="border-b bg-gradient-to-r from-violet-50/70 via-background to-blue-50/70 p-5 dark:from-violet-950/20 dark:to-blue-950/20 sm:p-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-xs text-white">≡</span><h2 className="font-bold">Recent activity</h2></div><p className="mt-1 text-xs text-muted-foreground">Select any execution to inspect its operational timeline.</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Filter jobs" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border bg-background px-3 py-2.5 text-sm shadow-sm"><option value="ALL">All jobs</option><option value="RUNNING">Running</option><option value="QUEUED">Queued</option><option value="SUCCEEDED">Completed</option><option value="FAILED">Failed</option></select><button type="button" onClick={refresh} disabled={refreshing} className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm transition hover:opacity-90 disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh now'}</button><span className="rounded-xl border bg-background px-3 py-2.5 text-xs text-muted-foreground">Updated {formatTime(lastUpdated.toISOString())}</span></div></div></div>{filtered.length === 0 ? <div className="p-12 text-center"><p className="font-medium">No jobs found</p><p className="mt-1 text-sm text-muted-foreground">Try another status filter or start an agent.</p></div> : <div className="divide-y">{filtered.map((run) => { const agent = agents.get(run.agent_definition_id); const dataset = run.dataset_id ? datasets.get(run.dataset_id) : null; const p = progress(stepsByRun.get(run.id) ?? []); const runStalled = isStalled(run, lastUpdated); return <button key={run.id} type="button" onClick={() => selectRun(run.id)} className={`relative w-full px-5 py-4 text-left transition-all hover:bg-gradient-to-r hover:from-blue-50/60 hover:to-violet-50/30 dark:hover:from-blue-950/20 dark:hover:to-violet-950/10 ${selectedId === run.id ? 'bg-gradient-to-r from-blue-50 to-violet-50/60 dark:from-blue-950/20 dark:to-violet-950/10' : ''}`}><div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_140px_100px] lg:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${run.status === 'FAILED' ? 'bg-red-500' : COMPLETE.has(run.status) ? 'bg-emerald-500' : ACTIVE.has(run.status) ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)]' : 'bg-violet-400'}`} /><p className="truncate text-sm font-semibold">{agent ? `${agent.name} v${agent.version}` : 'Agent run'}</p>{runStalled && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">STALLED?</span>}</div><p className="mt-1 truncate pl-5 text-xs text-muted-foreground">{dataset?.name ?? 'Dataset unavailable'}</p></div><div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all ${run.status === 'FAILED' ? 'bg-gradient-to-r from-red-400 to-orange-500' : 'bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500'}`} style={{ width: `${p.percent}%` }} /></div><span className="w-10 text-right text-xs font-semibold text-muted-foreground">{p.percent}%</span></div><StatusBadge status={run.status} /><span className="text-xs font-medium text-muted-foreground lg:text-right">{duration(run, lastUpdated)}</span></div></button> })}</div>}</section>

    {selected && <section id="selected-job" className="scroll-mt-6 overflow-hidden rounded-3xl border bg-card shadow-lg"><div className="border-b bg-gradient-to-r from-slate-50 via-blue-50/50 to-violet-50/50 p-5 dark:from-slate-950/40 dark:via-blue-950/20 dark:to-violet-950/20 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Selected execution</p><StatusBadge status={selected.status} />{isStalled(selected, lastUpdated) && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Needs attention</span>}</div><h2 className="mt-2 truncate text-xl font-bold">{agents.get(selected.agent_definition_id)?.name ?? 'Agent run'} <span className="font-medium text-muted-foreground">v{agents.get(selected.agent_definition_id)?.version ?? '?'}</span></h2><p className="mt-1 text-sm text-muted-foreground">{selected.dataset_id ? datasets.get(selected.dataset_id)?.name ?? 'Dataset unavailable' : 'Dataset unavailable'} · {duration(selected, lastUpdated)}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => jumpTo('job-logs')} className="rounded-xl border bg-background px-3 py-2 text-xs font-semibold shadow-sm transition hover:bg-muted">Logs</button><button type="button" onClick={() => jumpTo('job-actions')} className="rounded-xl border bg-background px-3 py-2 text-xs font-semibold shadow-sm transition hover:bg-muted">Actions</button><button type="button" onClick={() => void copyRunId()} className="rounded-xl border bg-background px-3 py-2 text-xs font-semibold shadow-sm transition hover:bg-muted">{copied ? 'Copied' : 'Copy run ID'}</button></div></div></div><div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Execution timeline</p><p className="mt-1 text-sm text-muted-foreground">Step state and transition history</p></div><span className="rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-3 py-1 text-sm font-bold text-white">{progress(selectedSteps).percent}%</span></div><div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 transition-all" style={{ width: `${progress(selectedSteps).percent}%` }} /></div><div className="mt-6 space-y-1">{selectedSteps.length ? selectedSteps.map((step, index) => <div key={step.id} className="flex gap-4 rounded-2xl p-3 transition-colors hover:bg-muted/40"><div className="flex flex-col items-center"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${COMPLETE.has(step.status) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ACTIVE.has(step.status) ? 'border-blue-200 bg-blue-50 text-blue-700' : step.status === 'FAILED' ? 'border-red-200 bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'}`}>{COMPLETE.has(step.status) ? '✓' : ACTIVE.has(step.status) ? '●' : step.status === 'FAILED' ? '!' : index + 1}</div>{index < selectedSteps.length - 1 && <div className="mt-2 h-full w-px bg-gradient-to-b from-border to-transparent" />}</div><div className="min-w-0 flex-1 pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{step.step_name}</p><StatusBadge status={step.status} /></div><p className="mt-1 text-xs text-muted-foreground">Attempt {step.attempt}{step.started_at ? ` · ${formatTime(step.started_at)}` : ''}{step.completed_at ? ` → ${formatTime(step.completed_at)}` : ''}</p>{step.error_message && <p className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400">{step.error_message}</p>}</div></div>) : <div className="rounded-2xl border border-dashed p-8 text-center"><p className="text-sm font-medium">No execution steps recorded</p><p className="mt-1 text-xs text-muted-foreground">The executor may still be initializing. Refreshing continues automatically.</p></div>}</div></div><aside className="rounded-2xl border bg-gradient-to-br from-slate-50 to-blue-50/50 p-5 dark:from-slate-950/30 dark:to-blue-950/10"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Run information</p><dl className="mt-5 space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1"><StatusBadge status={selected.status} /></dd></div><div><dt className="text-xs text-muted-foreground">Started</dt><dd className="mt-1 font-medium">{selected.started_at ? formatDate(selected.started_at) : 'Not started'}</dd></div><div><dt className="text-xs text-muted-foreground">Duration</dt><dd className="mt-1 font-medium">{duration(selected, lastUpdated)}</dd></div><div><dt className="text-xs text-muted-foreground">Run ID</dt><dd className="mt-1 break-all rounded-lg bg-background/80 p-2 font-mono text-[11px] text-muted-foreground">{selected.id}</dd></div></dl>{selected.error_message && <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4"><p className="text-sm font-semibold text-red-700 dark:text-red-400">Execution error</p><p className="mt-1 text-xs text-muted-foreground">{selected.error_message}</p>{selected.error_code && <p className="mt-2 font-mono text-[10px] text-muted-foreground">{selected.error_code}</p>}</div>}{isStalled(selected, lastUpdated) && <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/20"><p className="text-sm font-semibold text-amber-900 dark:text-amber-300">No recent completion signal</p><p className="mt-1 text-xs text-amber-800/80 dark:text-amber-400/80">The monitor flags long active runs for investigation. Review logs before terminating.</p></div>}</aside></div></section>}

    <section id="job-actions" className="overflow-hidden rounded-3xl border bg-gradient-to-r from-violet-50 via-background to-blue-50 p-5 shadow-sm dark:from-violet-950/20 dark:to-blue-950/20 sm:p-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">Operational controls</p><h2 className="mt-1 font-bold">Actions for the selected execution</h2><p className="mt-1 text-xs text-muted-foreground">Use the selected execution context to access logs, diagnostics, and lifecycle controls.</p></div>{selected ? <StatusBadge status={selected.status} /> : <span className="text-xs text-muted-foreground">Select a job first</span>}</div></section>

    <div className="flex flex-col gap-2 border-t pt-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Auto refresh every 3 seconds</span><span>Last synchronized {formatTime(lastUpdated.toISOString())}</span></div>
  </div>
}
