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
  const classes = complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400' : status === 'FAILED' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400' : active ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-400' : 'border-border bg-muted/50 text-muted-foreground'
  const dot = complete ? 'bg-emerald-500' : status === 'FAILED' ? 'bg-red-500' : active ? 'bg-blue-500' : 'bg-muted-foreground'
  const label = status === 'SUCCEEDED' ? 'Completed' : status.charAt(0) + status.slice(1).toLowerCase()
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</span>
}
function MetricCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: 'active' | 'success' | 'danger' | 'neutral' }) {
  const dot = tone === 'success' ? 'bg-emerald-500' : tone === 'danger' ? 'bg-red-500' : tone === 'active' ? 'bg-blue-500' : 'bg-muted-foreground'
  return <div className="rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><span className={`h-2 w-2 rounded-full ${dot}`} /></div><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}

export function JobMonitor({ initialRuns, initialAgents, initialDatasets, initialSteps, initialNow, userId: _userId }: Props) {
  const [runs, setRuns] = useState(initialRuns)
  const [steps, setSteps] = useState(initialSteps)
  const [filter, setFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(initialRuns[0]?.id ?? null)
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
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Active jobs" value={active.length} detail={stalled.length ? `${stalled.length} need attention` : active.length ? 'Execution in progress' : 'Nothing running right now'} tone="active" />
      <MetricCard label="Queued" value={queued} detail="Waiting to execute" tone="neutral" />
      <MetricCard label="Completed" value={completed} detail="Successful executions" tone="success" />
      <MetricCard label="Failed" value={failed} detail="Requires attention" tone="danger" />
    </section>

    {stalled.length > 0 && <section className="rounded-2xl border border-amber-300/70 bg-amber-50/70 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-amber-900 dark:text-amber-300">{stalled.length} job{stalled.length === 1 ? '' : 's'} may be stalled</p><p className="mt-1 text-xs text-amber-800/80 dark:text-amber-400/80">Active for more than 30 minutes. Inspect the selected job and its diagnostics before taking action.</p></div><button type="button" onClick={() => { setFilter('RUNNING'); if (stalled[0]) selectRun(stalled[0].id) }} className="rounded-lg border border-amber-300 bg-background px-3 py-2 text-xs font-medium hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/40">Review stalled jobs</button></div></section>}

    {hero && heroProgress ? <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="absolute inset-x-0 top-0 h-1 bg-blue-500" /><div className="p-6 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" /></span>Live execution</div><div className="mt-3 flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold tracking-tight">{agents.get(hero.agent_definition_id)?.name ?? 'Agent execution'} <span className="text-muted-foreground">v{agents.get(hero.agent_definition_id)?.version ?? '?'}</span></h2><StatusBadge status={hero.status} /></div><p className="mt-1 text-sm text-muted-foreground">{hero.dataset_id ? datasets.get(hero.dataset_id)?.name ?? 'Dataset unavailable' : 'Dataset unavailable'}</p></div><div className="text-left lg:text-right"><p className="text-3xl font-semibold tracking-tight">{heroProgress.percent}%</p><p className="text-xs text-muted-foreground">{heroProgress.label}</p></div></div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${heroProgress.percent}%` }} /></div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">{heroSteps.length ? heroSteps.map((step) => <div key={step.id} className="flex items-center gap-2 text-sm"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${COMPLETE.has(step.status) ? 'bg-emerald-100 text-emerald-700' : ACTIVE.has(step.status) ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>{COMPLETE.has(step.status) ? '✓' : ACTIVE.has(step.status) ? '•' : '○'}</span><span className={ACTIVE.has(step.status) ? 'font-medium' : 'text-muted-foreground'}>{step.step_name}</span></div>) : <span className="text-sm text-muted-foreground">Preparing execution steps…</span>}</div>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4"><span className="mr-auto text-xs text-muted-foreground">Running for {duration(hero, lastUpdated)} · Started {hero.started_at ? formatTime(hero.started_at) : 'Not started'}</span><button type="button" onClick={() => selectRun(hero.id)} className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90">Open job</button></div>
    </div></section> : <section className="rounded-2xl border border-dashed bg-card p-7 shadow-sm"><div className="flex items-center gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-lg">✓</div><div><h2 className="font-semibold">All clear</h2><p className="mt-1 text-sm text-muted-foreground">There are no active executions right now.</p></div></div></section>}

    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Recent activity</h2><p className="mt-1 text-xs text-muted-foreground">Select any job to open its operational detail view.</p></div><div className="flex flex-wrap items-center gap-3"><select aria-label="Filter jobs" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="ALL">All jobs</option><option value="RUNNING">Running</option><option value="QUEUED">Queued</option><option value="SUCCEEDED">Completed</option><option value="FAILED">Failed</option></select><button type="button" onClick={refresh} disabled={refreshing} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh'}</button><span className="text-xs text-muted-foreground">Updated {formatTime(lastUpdated.toISOString())}</span></div></div>{filtered.length === 0 ? <div className="p-10 text-center"><p className="font-medium">No jobs found</p><p className="mt-1 text-sm text-muted-foreground">Try another status filter or start an agent.</p></div> : <div className="divide-y">{filtered.map((run) => { const agent = agents.get(run.agent_definition_id); const dataset = run.dataset_id ? datasets.get(run.dataset_id) : null; const p = progress(stepsByRun.get(run.id) ?? []); const runStalled = isStalled(run, lastUpdated); return <button key={run.id} type="button" onClick={() => selectRun(run.id)} className={`w-full px-5 py-4 text-left transition-all hover:bg-muted/40 ${selectedId === run.id ? 'bg-muted/40 ring-1 ring-inset ring-foreground/10' : ''}`}><div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_140px_100px] lg:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{agent ? `${agent.name} v${agent.version}` : 'Agent run'}</p>{runStalled && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Stalled?</span>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{dataset?.name ?? 'Dataset unavailable'}</p></div><div className="flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${p.percent}%` }} /></div><span className="w-10 text-right text-xs text-muted-foreground">{p.percent}%</span></div><StatusBadge status={run.status} /><span className="text-xs text-muted-foreground lg:text-right">{duration(run, lastUpdated)}</span></div></button> })}</div>}</section>

    {selected && <section id="selected-job" className="scroll-mt-6 overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="border-b bg-muted/20 p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Selected job</p><StatusBadge status={selected.status} />{isStalled(selected, lastUpdated) && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Needs attention</span>}</div><h2 className="mt-2 truncate text-xl font-semibold">{agents.get(selected.agent_definition_id)?.name ?? 'Agent run'} <span className="text-muted-foreground">v{agents.get(selected.agent_definition_id)?.version ?? '?'}</span></h2><p className="mt-1 text-sm text-muted-foreground">{selected.dataset_id ? datasets.get(selected.dataset_id)?.name ?? 'Dataset unavailable' : 'Dataset unavailable'} · {duration(selected, lastUpdated)}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => jumpTo('job-logs')} className="rounded-lg border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">Logs</button><button type="button" onClick={() => jumpTo('job-actions')} className="rounded-lg border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">Actions</button><button type="button" onClick={() => void copyRunId()} className="rounded-lg border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">{copied ? 'Copied' : 'Copy run ID'}</button></div></div></div>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div><div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Execution timeline</p><p className="mt-1 text-sm text-muted-foreground">Step state and transition history</p></div><span className="text-sm font-semibold">{progress(selectedSteps).percent}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${progress(selectedSteps).percent}%` }} /></div><div className="mt-6 space-y-1">{selectedSteps.length ? selectedSteps.map((step, index) => <div key={step.id} className="flex gap-4 rounded-xl p-3 transition-colors hover:bg-muted/40"><div className="flex flex-col items-center"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${COMPLETE.has(step.status) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ACTIVE.has(step.status) ? 'border-blue-200 bg-blue-50 text-blue-700' : step.status === 'FAILED' ? 'border-red-200 bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'}`}>{COMPLETE.has(step.status) ? '✓' : ACTIVE.has(step.status) ? '•' : step.status === 'FAILED' ? '!' : index + 1}</div>{index < selectedSteps.length - 1 && <div className="mt-2 h-full w-px bg-border" />}</div><div className="min-w-0 flex-1 pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{step.step_name}</p><StatusBadge status={step.status} /></div><p className="mt-1 text-xs text-muted-foreground">Attempt {step.attempt}{step.started_at ? ` · ${formatTime(step.started_at)}` : ''}{step.completed_at ? ` → ${formatTime(step.completed_at)}` : ''}</p>{step.error_message && <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400">{step.error_message}</p>}</div></div>) : <div className="rounded-xl border border-dashed p-8 text-center"><p className="text-sm font-medium">No execution steps recorded</p><p className="mt-1 text-xs text-muted-foreground">The executor may still be initializing. Refreshing continues automatically.</p></div>}</div></div><aside className="rounded-xl border bg-muted/20 p-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Run information</p><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1"><StatusBadge status={selected.status} /></dd></div><div><dt className="text-xs text-muted-foreground">Started</dt><dd className="mt-1">{selected.started_at ? formatDate(selected.started_at) : 'Not started'}</dd></div><div><dt className="text-xs text-muted-foreground">Duration</dt><dd className="mt-1 font-medium">{duration(selected, lastUpdated)}</dd></div><div><dt className="text-xs text-muted-foreground">Run ID</dt><dd className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{selected.id}</dd></div></dl>{selected.error_message && <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4"><p className="text-sm font-medium text-red-700 dark:text-red-400">Execution error</p><p className="mt-1 text-xs text-muted-foreground">{selected.error_message}</p>{selected.error_code && <p className="mt-2 font-mono text-[10px] text-muted-foreground">{selected.error_code}</p>}</div>}{isStalled(selected, lastUpdated) && <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/20"><p className="text-sm font-medium text-amber-900 dark:text-amber-300">No recent completion signal</p><p className="mt-1 text-xs text-amber-800/80 dark:text-amber-400/80">The monitor flags long active runs for investigation. Review logs before terminating.</p></div>}</aside></div>
    </section>}

    <section id="job-actions" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Operational controls</p><h2 className="mt-1 font-semibold">Take action on a selected job</h2><p className="mt-1 text-xs text-muted-foreground">Termination and diagnostics controls remain in the dedicated panels below. Selecting a job above keeps the context visible.</p></div>{selected ? <StatusBadge status={selected.status} /> : <span className="text-xs text-muted-foreground">Select a job first</span>}</div></section>

    <div className="flex flex-col gap-2 border-t pt-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Auto refresh every 3 seconds</span><span>Last synchronized {formatTime(lastUpdated.toISOString())}</span></div>
  </div>
}
