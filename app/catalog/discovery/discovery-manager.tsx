'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  DatabaseZap,
  FileSearch,
  GitBranch,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  ServerCog,
  SlidersHorizontal,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { discoveryJobHealth } from './job-health'

type Source = { id: string; project_id: string; name: string; source_type: string; status: string }
type Run = {
  id: string
  project_id: string
  source_id: string
  status: string
  assets_discovered: number
  objects_observed: number
  objects_added: number
  objects_changed: number
  objects_removed: number
  objects_missing: number
  objects_unchanged: number
  catalog_revision_id: string | null
  scope_version_id: string | null
  consistency_mode: string | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}
type Job = { id: string; project_id: string; entity_id: string | null; status: string; attempts: number; max_attempts: number; priority: number; lease_owner: string | null; lease_expires_at: string | null; last_error: string | null; created_at: string; started_at: string | null; completed_at: string | null; updated_at: string }
type PollTarget = { sourceId: string; queuedAt: number }
type SortKey = 'LATEST' | 'SOURCE' | 'ASSETS' | 'STATUS'
type SortDirection = 'ASC' | 'DESC'

const ACTIVE_JOB_STATUSES = new Set(['QUEUED', 'RUNNING'])
function upper(value: string | null | undefined) { return String(value ?? '').toUpperCase() }
function isActiveJob(job: Job) { return ACTIVE_JOB_STATUSES.has(upper(job.status)) }
function isActiveRun(run: Run) { return upper(run.status) === 'RUNNING' }
function formatDate(value: string | null | undefined) { return value ? new Date(value).toLocaleString() : '—' }
function shortId(value: string) { return value.slice(0, 8) }
function observed(run: Run) { return Number(run.objects_observed || run.assets_discovered || 0) }
function duration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return completedAt ? '—' : 'In progress'
  const seconds = Math.round(Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
function statusTone(status: string) {
  const value = upper(status)
  if (value === 'SUCCEEDED' || value === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (value === 'FAILED' || value === 'DEAD') return 'border-red-200 bg-red-50 text-red-700'
  if (value === 'INCOMPLETE' || value === 'QUEUED') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (value === 'RUNNING') return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}
function StatusBadge({ status }: { status: string }) {
  const running = upper(status) === 'RUNNING'
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black tracking-wide ${statusTone(status)}`}>
    {running ? <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" /><span className="relative inline-flex h-2 w-2 rounded-full bg-current" /></span> : <CircleDot className="h-3 w-3" />}
    {upper(status) || 'UNKNOWN'}
  </span>
}
function healthTone(severity: 'info' | 'warning' | 'error' | 'success') {
  if (severity === 'error') return 'border-red-200 bg-red-50 text-red-800'
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (severity === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return 'border-blue-100 bg-blue-50 text-blue-800'
}
function changeSummary(run: Run) {
  if (!run.catalog_revision_id) return null
  return `${run.objects_added} added · ${run.objects_changed} changed · ${run.objects_missing} missing · ${run.objects_removed} removed · ${run.objects_unchanged} unchanged`
}

export function DiscoveryManager({ sources, runs, jobs, currentAssetCounts }: { sources: Source[]; runs: Run[]; jobs: Job[]; currentAssetCounts: Record<string, number> }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [pollTarget, setPollTarget] = useState<PollTarget | null>(null)
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('LATEST')
  const [sortDirection, setSortDirection] = useState<SortDirection>('DESC')
  const [expandedSources, setExpandedSources] = useState<Set<string>>(() => new Set(jobs.filter(isActiveJob).map(job => job.entity_id).filter((value): value is string => Boolean(value))))

  const runsBySource = useMemo(() => {
    const result = new Map<string, Run[]>()
    for (const run of runs) result.set(run.source_id, [...(result.get(run.source_id) ?? []), run])
    return result
  }, [runs])
  const jobsBySource = useMemo(() => {
    const result = new Map<string, Job[]>()
    for (const job of jobs) if (job.entity_id) result.set(job.entity_id, [...(result.get(job.entity_id) ?? []), job])
    return result
  }, [jobs])
  const latestBySource = useMemo(() => {
    const latest = new Map<string, Run>()
    for (const run of runs) if (!latest.has(run.source_id)) latest.set(run.source_id, run)
    return latest
  }, [runs])
  const hasActiveJobs = jobs.some(isActiveJob)

  useEffect(() => {
    if (!hasActiveJobs && !pollTarget) return
    const interval = window.setInterval(() => router.refresh(), 5000)
    return () => window.clearInterval(interval)
  }, [hasActiveJobs, pollTarget, router])

  useEffect(() => {
    if (!pollTarget) return
    const matchingRun = runs.find(run => run.source_id === pollTarget.sourceId && Date.parse(run.started_at) >= pollTarget.queuedAt - 5000)
    if (matchingRun && (matchingRun.completed_at || matchingRun.error_message)) {
      setPollTarget(null)
      if (upper(matchingRun.status) === 'INCOMPLETE') {
        setMessage(`Metadata discovery was incomplete. ${matchingRun.error_message ?? 'The last known-good catalog revision remains published.'}`)
      } else if (matchingRun.error_message) {
        setMessage(`Metadata discovery failed: ${matchingRun.error_message}`)
      } else {
        const changes = changeSummary(matchingRun)
        setMessage(`Metadata discovery completed. ${observed(matchingRun)} objects observed${changes ? `; ${changes}.` : '.'}`)
      }
    }
  }, [pollTarget, runs])

  async function discover(sourceId: string) {
    setBusy(sourceId)
    setMessage('')
    try {
      const idempotencyKey = crypto.randomUUID()
      const queuedAt = Date.now()
      const response = await fetch('/api/catalog/discovery', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ sourceId, idempotencyKey }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to queue discovery.')
      setExpandedSources(current => new Set(current).add(sourceId))
      setPollTarget({ sourceId, queuedAt })
      setMessage(payload.alreadyActive ? 'A metadata discovery job is already active for this source. Monitoring the existing durable worker job.' : 'Metadata discovery queued. The last known-good catalog stays published until the full scoped reconciliation succeeds atomically.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to queue discovery.')
    } finally {
      setBusy(null)
    }
  }

  function toggleSource(sourceId: string) {
    setExpandedSources(current => {
      const next = new Set(current)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  const statusOptions = useMemo(() => [...new Set([...runs.map(run => upper(run.status)), ...jobs.map(job => upper(job.status))].filter(Boolean))].sort(), [runs, jobs])
  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const direction = sortDirection === 'ASC' ? 1 : -1
    const rows = sources.flatMap(source => {
      const allRuns = [...(runsBySource.get(source.id) ?? [])].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
      const allJobs = [...(jobsBySource.get(source.id) ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      const filteredRuns = statusFilter === 'ALL' ? allRuns : allRuns.filter(run => upper(run.status) === statusFilter)
      const filteredJobs = statusFilter === 'ALL' ? allJobs : allJobs.filter(job => upper(job.status) === statusFilter)
      const searchable = [source.name, source.source_type, ...allRuns.flatMap(run => [run.id, run.catalog_revision_id ?? '', run.scope_version_id ?? '', run.error_message ?? '']), ...allJobs.flatMap(job => [job.id, job.last_error ?? '', job.lease_owner ?? '', discoveryJobHealth(job).title, discoveryJobHealth(job).message])].join(' ').toLowerCase()
      if (sourceFilter !== 'ALL' && source.id !== sourceFilter) return []
      if (normalizedQuery && !searchable.includes(normalizedQuery)) return []
      if (statusFilter !== 'ALL' && !filteredRuns.length && !filteredJobs.length) return []
      const latest = Math.max(0, ...allRuns.map(run => Date.parse(run.started_at) || 0), ...allJobs.map(job => Date.parse(job.updated_at) || 0))
      const currentAssets = Number(currentAssetCounts[source.id] ?? 0)
      const completedScans = allRuns.filter(run => ['COMPLETED', 'SUCCEEDED'].includes(upper(run.status))).length
      return [{ source, runs: filteredRuns, jobs: filteredJobs, allRuns, allJobs, latest, currentAssets, completedScans, latestStatus: upper(allJobs[0]?.status ?? allRuns[0]?.status ?? source.status) }]
    })
    rows.sort((a, b) => sortKey === 'SOURCE' ? direction * a.source.name.localeCompare(b.source.name) : sortKey === 'ASSETS' ? direction * (a.currentAssets - b.currentAssets) : sortKey === 'STATUS' ? direction * a.latestStatus.localeCompare(b.latestStatus) : direction * (a.latest - b.latest))
    return rows
  }, [currentAssetCounts, jobsBySource, query, runsBySource, sortDirection, sortKey, sourceFilter, sources, statusFilter])

  const activeJobCount = jobs.filter(isActiveJob).length
  const completedRunCount = runs.filter(run => ['COMPLETED', 'SUCCEEDED'].includes(upper(run.status))).length
  const attentionJobCount = jobs.filter(job => ['warning', 'error'].includes(discoveryJobHealth(job).severity)).length + runs.filter(run => upper(run.status) === 'INCOMPLETE').length
  const totalCurrentAssets = Object.values(currentAssetCounts).reduce((total, count) => total + Number(count || 0), 0)

  return <div className="mt-6 space-y-6">
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sources.map(source => {
      const run = latestBySource.get(source.id)
      const sourceJobs = jobsBySource.get(source.id) ?? []
      const sourceRuns = runsBySource.get(source.id) ?? []
      const activeJob = sourceJobs.find(isActiveJob)
      const latestJob = sourceJobs[0]
      const health = latestJob ? discoveryJobHealth(latestJob) : null
      const active = Boolean(activeJob || sourceRuns.some(isActiveRun) || pollTarget?.sourceId === source.id)
      const currentAssets = Number(currentAssetCounts[source.id] ?? 0)
      return <article key={source.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600">{source.source_type === 'JDBC' ? <DatabaseZap className="h-5 w-5" /> : <FileSearch className="h-5 w-5" />}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${source.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{source.status}</span></div>
        <h3 className="mt-4 font-bold">{source.name}</h3><p className="mt-1 text-xs text-slate-500">{source.source_type}</p>
        {run ? <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600"><div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status={activeJob?.status ?? run.status} /><span className="font-semibold">{currentAssets} current assets</span></div><div className="mt-2 flex items-center gap-1.5 text-slate-500"><Clock3 className="h-3.5 w-3.5" />{formatDate(run.started_at)}</div><div className="mt-1 text-slate-500">Latest scan observed {observed(run)} objects</div>{run.catalog_revision_id ? <div className="mt-1 font-medium text-emerald-700">Published revision {shortId(run.catalog_revision_id)} · +{run.objects_added} ~{run.objects_changed} ?{run.objects_missing} -{run.objects_removed}</div> : upper(run.status) === 'INCOMPLETE' ? <div className="mt-1 font-medium text-amber-700">No catalog revision published</div> : null}{activeJob ? <div className="mt-1 text-slate-500">Worker attempt {activeJob.attempts}/{activeJob.max_attempts}</div> : null}</div> : <p className="mt-4 text-xs text-slate-400">{active ? 'Waiting for durable discovery worker…' : 'No discovery run yet.'}</p>}
        {health && (health.severity === 'warning' || health.severity === 'error') ? <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${healthTone(health.severity)}`}><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-black">{health.title}</p><p className="mt-1 leading-5">{health.message}</p></div></div></div> : null}
        <button onClick={() => void discover(source.id)} disabled={busy === source.id || active} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300">{busy === source.id || active ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}{active ? 'Discovery running' : 'Discover metadata'}</button>
      </article>
    })}</section>

    {message ? <p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">{message}</p> : null}

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-blue-50 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><RefreshCw className={`h-5 w-5 text-violet-600 ${hasActiveJobs ? 'animate-spin' : ''}`} /><h2 className="text-2xl font-black">Discovery activity</h2></div><p className="mt-1 text-sm text-slate-500">Current catalog state is separated from scan execution. Only a complete full-scope reconciliation can publish the next catalog revision.</p></div><div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm"><span className={`h-2 w-2 rounded-full ${hasActiveJobs ? 'animate-pulse bg-blue-500' : 'bg-emerald-500'}`} />{hasActiveJobs ? 'Auto-refreshing every 5s' : 'No active worker jobs'}</div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-blue-100 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Active jobs</p><p className="mt-1 text-2xl font-black text-blue-700">{activeJobCount}</p></div><div className="rounded-2xl border border-emerald-100 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Published scans</p><p className="mt-1 text-2xl font-black text-emerald-700">{completedRunCount}</p></div><div className="rounded-2xl border border-violet-100 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Current assets</p><p className="mt-1 text-2xl font-black text-violet-700">{totalCurrentAssets}</p></div><div className="rounded-2xl border border-amber-100 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Needs attention</p><p className="mt-1 text-2xl font-black text-amber-700">{attentionJobCount}</p></div></div>
      </div>

      <div className="border-b border-slate-100 px-6 py-4"><div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400"><SlidersHorizontal className="h-4 w-4" />Filter & sort</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_minmax(170px,1fr)_minmax(150px,0.8fr)_minmax(170px,0.9fr)_auto]"><label className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search source, run ID, revision, job, worker or error…" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label><select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="ALL">All sources</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="ALL">All statuses</option>{statusOptions.map(status => <option key={status} value={status}>{status}</option>)}</select><select value={sortKey} onChange={event => setSortKey(event.target.value as SortKey)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="LATEST">Latest activity</option><option value="SOURCE">Source name</option><option value="ASSETS">Current assets</option><option value="STATUS">Status</option></select><button type="button" onClick={() => setSortDirection(current => current === 'ASC' ? 'DESC' : 'ASC')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><ArrowUpDown className="h-4 w-4" />{sortDirection === 'ASC' ? 'Ascending' : 'Descending'}</button></div></div>

      <div className="divide-y divide-slate-100">{groups.length ? groups.map(group => {
        const open = expandedSources.has(group.source.id)
        const activeJobs = group.allJobs.filter(isActiveJob)
        const latestStatus = activeJobs[0]?.status ?? group.allRuns[0]?.status ?? group.source.status
        return <article key={group.source.id} className="bg-white"><button type="button" onClick={() => toggleSource(group.source.id)} className="flex w-full items-center gap-4 px-6 py-5 text-left transition hover:bg-slate-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">{open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}</span><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">{group.source.source_type === 'JDBC' ? <DatabaseZap className="h-5 w-5" /> : <FileSearch className="h-5 w-5" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-base font-black text-slate-900">{group.source.name}</span><span className="mt-0.5 block text-xs text-slate-500">{group.source.source_type} · {group.completedScans} published scans · {group.allJobs.length} worker jobs</span></span><span className="hidden text-right sm:block"><span className="block text-sm font-black text-slate-800">{group.currentAssets} current assets</span><span className="text-xs text-slate-400">latest {group.latest ? formatDate(new Date(group.latest).toISOString()) : '—'}</span></span><StatusBadge status={latestStatus} /></button>
        {open ? <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-6"><div className="ml-4 border-l-2 border-violet-100 pl-6"><div className="grid gap-6 xl:grid-cols-2">
          <section><div className="mb-3 flex items-center gap-2"><GitBranch className="h-4 w-4 text-violet-600" /><h3 className="text-sm font-black text-slate-800">Discovery scans</h3><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">{group.runs.length}</span></div><div className="space-y-3">{group.runs.length ? group.runs.map(run => <div key={run.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><StatusBadge status={run.status} /><span className="font-mono text-[11px] text-slate-400">run {shortId(run.id)}</span></div><span className="inline-flex items-center gap-1 text-sm font-black text-slate-800"><Boxes className="h-4 w-4 text-violet-500" />{observed(run)} objects observed</span></div>{run.catalog_revision_id ? <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><p className="font-black">Published catalog revision {shortId(run.catalog_revision_id)}</p><p className="mt-1">{run.objects_added} added · {run.objects_changed} changed · {run.objects_missing} missing · {run.objects_removed} removed · {run.objects_unchanged} unchanged</p></div> : upper(run.status) === 'INCOMPLETE' ? <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800"><p className="font-black">No catalog revision published</p><p className="mt-1">The previous last known-good revision remains current.</p></div> : null}<dl className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2"><div><dt className="font-bold text-slate-400">Started</dt><dd className="mt-0.5">{formatDate(run.started_at)}</dd></div><div><dt className="font-bold text-slate-400">Completed / duration</dt><dd className="mt-0.5">{run.completed_at ? `${formatDate(run.completed_at)} · ${duration(run.started_at, run.completed_at)}` : 'In progress'}</dd></div><div><dt className="font-bold text-slate-400">Consistency</dt><dd className="mt-0.5">{run.consistency_mode ?? '—'}</dd></div><div><dt className="font-bold text-slate-400">Scope version</dt><dd className="mt-0.5 font-mono text-[11px]">{run.scope_version_id ? shortId(run.scope_version_id) : 'legacy'}</dd></div></dl>{run.error_message ? <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{run.error_message}</div> : null}</div>) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-400">No discovery scans match the current filters.</div>}</div></section>
          <section><div className="mb-3 flex items-center gap-2"><ServerCog className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-black text-slate-800">Durable worker execution</h3><span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">{group.jobs.length}</span></div><div className="space-y-3">{group.jobs.length ? group.jobs.map(job => { const health = discoveryJobHealth(job); return <div key={job.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><StatusBadge status={job.status} /><span className="font-mono text-[11px] text-slate-400">job {shortId(job.id)}</span></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">attempt {job.attempts}/{job.max_attempts}</span></div><div className={`mt-3 rounded-xl border px-3 py-3 text-xs ${healthTone(health.severity)}`}><p className="font-black">{health.title}</p><p className="mt-1 leading-5">{health.message}</p>{health.rawError && health.rawError !== health.message ? <details className="mt-2"><summary className="cursor-pointer font-bold opacity-80">Technical detail</summary><p className="mt-1 font-mono text-[11px] opacity-80">{health.rawError}</p></details> : null}</div><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="font-bold text-slate-400">Queued</dt><dd className="mt-0.5 text-slate-600">{formatDate(job.created_at)}</dd></div><div><dt className="font-bold text-slate-400">Started</dt><dd className="mt-0.5 text-slate-600">{formatDate(job.started_at)}</dd></div><div><dt className="font-bold text-slate-400">Worker</dt><dd className="mt-0.5 truncate font-mono text-[11px] text-slate-600" title={job.lease_owner ?? undefined}>{job.lease_owner ?? 'Not claimed'}</dd></div><div><dt className="font-bold text-slate-400">Lease expires</dt><dd className="mt-0.5 text-slate-600">{formatDate(job.lease_expires_at)}</dd></div><div><dt className="font-bold text-slate-400">Last update</dt><dd className="mt-0.5 text-slate-600">{formatDate(job.updated_at)}</dd></div><div><dt className="font-bold text-slate-400">Completed</dt><dd className="mt-0.5 text-slate-600">{formatDate(job.completed_at)}</dd></div></dl></div> }) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-400">No durable worker jobs match the current filters.</div>}</div></section>
        </div></div></div> : null}</article>
      }) : <div className="p-10 text-center"><Search className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">No discovery activity matches these filters.</p><button type="button" onClick={() => { setQuery(''); setSourceFilter('ALL'); setStatusFilter('ALL') }} className="mt-3 text-sm font-bold text-blue-600">Clear filters</button></div>}</div>
    </section>
  </div>
}
