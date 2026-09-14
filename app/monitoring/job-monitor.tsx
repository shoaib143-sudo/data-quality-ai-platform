'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BrainCircuit,
  ChevronRight,
  CircleCheck,
  CirclePause,
  Clock3,
  Database,
  GitBranch,
  Layers3,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'

import { ExecutionStatusBadge } from '@/components/app-shell/execution-status'
import { createClient } from '@/lib/supabase/client'
import { GovernedDomainContext } from './governed-domain-context'

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
export type MonitoringDataset = { id: string; name: string; business_domain: string | null }
export type MonitoringProject = { id: string; name: string; description: string | null }

type Props = {
  initialRuns: MonitoringRun[]
  initialAgents: MonitoringAgent[]
  initialDatasets: MonitoringDataset[]
  initialProjects: MonitoringProject[]
  initialSteps: MonitoringStep[]
  initialNow: string
  initialRunId?: string | null
  userId: string
}

type CellStatus = 'FAILED' | 'RUNNING' | 'WAITING' | 'QUEUED' | 'COMPLETE' | 'IDLE'

type DomainCell = {
  key: string
  domainName: string
  project: MonitoringProject
  runs: MonitoringRun[]
  componentRuns: MonitoringRun[]
  status: CellStatus
  activeCount: number
  failedCount: number
  completeCount: number
  componentCount: number
  datasetCount: number
  latestAt: string
}

const ACTIVE = new Set(['RUNNING', 'CREATED', 'PENDING'])
const WAITING = new Set(['WAITING'])
const QUEUED = new Set(['QUEUED'])
const COMPLETE = new Set(['SUCCEEDED', 'COMPLETED'])
const DATE_FORMATTER = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' })
const TIME_FORMATTER = new Intl.DateTimeFormat('en-SG', { timeStyle: 'short', timeZone: 'Asia/Singapore' })

function normalizeRunStatus(status: string): CellStatus {
  if (status === 'FAILED' || status === 'DEAD' || status === 'CANCELLED') return 'FAILED'
  if (ACTIVE.has(status)) return 'RUNNING'
  if (WAITING.has(status)) return 'WAITING'
  if (QUEUED.has(status)) return 'QUEUED'
  if (COMPLETE.has(status)) return 'COMPLETE'
  return 'IDLE'
}

function aggregateStatus(runs: MonitoringRun[]): CellStatus {
  const statuses = runs.map((run) => normalizeRunStatus(run.status))
  if (statuses.includes('FAILED')) return 'FAILED'
  if (statuses.includes('RUNNING')) return 'RUNNING'
  if (statuses.includes('WAITING')) return 'WAITING'
  if (statuses.includes('QUEUED')) return 'QUEUED'
  if (statuses.includes('COMPLETE')) return 'COMPLETE'
  return 'IDLE'
}

function dataDomainForRun(run: MonitoringRun, datasets: Map<string, MonitoringDataset>) {
  const domain = run.dataset_id ? datasets.get(run.dataset_id)?.business_domain?.trim() : ''
  return domain || 'Unassigned Data Domain'
}

function latestRunPerComponent(runs: MonitoringRun[]) {
  const latest = new Map<string, MonitoringRun>()
  for (const run of runs) {
    if (!latest.has(run.agent_definition_id)) latest.set(run.agent_definition_id, run)
  }
  return [...latest.values()]
}

function statusMeta(status: CellStatus) {
  if (status === 'FAILED') return { label: 'Failed', dot: 'bg-fuchsia-400', ring: 'border-fuchsia-400/50', glow: 'shadow-[0_0_65px_rgba(217,70,239,.22)]', text: 'text-fuchsia-200', soft: 'bg-fuchsia-400/10' }
  if (status === 'RUNNING') return { label: 'Running', dot: 'bg-cyan-300', ring: 'border-cyan-300/55', glow: 'shadow-[0_0_70px_rgba(34,211,238,.28)]', text: 'text-cyan-100', soft: 'bg-cyan-300/10' }
  if (status === 'WAITING') return { label: 'Waiting', dot: 'bg-amber-300', ring: 'border-amber-300/55', glow: 'shadow-[0_0_65px_rgba(251,191,36,.24)]', text: 'text-amber-100', soft: 'bg-amber-300/10' }
  if (status === 'QUEUED') return { label: 'Queued', dot: 'bg-sky-200', ring: 'border-sky-300/45', glow: 'shadow-[0_0_50px_rgba(125,211,252,.18)]', text: 'text-sky-100', soft: 'bg-sky-300/10' }
  if (status === 'COMPLETE') return { label: 'Complete', dot: 'bg-emerald-300', ring: 'border-emerald-300/55', glow: 'shadow-[0_0_65px_rgba(52,211,153,.22)]', text: 'text-emerald-100', soft: 'bg-emerald-300/10' }
  return { label: 'Idle', dot: 'bg-slate-400', ring: 'border-slate-500/35', glow: 'shadow-none', text: 'text-slate-300', soft: 'bg-slate-400/10' }
}

function relativeAge(run: MonitoringRun, now: Date) {
  const end = run.completed_at ? new Date(run.completed_at) : now
  const start = new Date(run.started_at ?? run.created_at)
  const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

function stepProgress(steps: MonitoringStep[]) {
  if (!steps.length) return { done: 0, total: 0, percent: 0 }
  const done = steps.filter((step) => COMPLETE.has(step.status)).length
  return { done, total: steps.length, percent: Math.round((done / steps.length) * 100) }
}

function StatusPill({ status }: { status: CellStatus }) {
  const meta = statusMeta(status)
  const Icon = status === 'COMPLETE' ? CircleCheck : status === 'FAILED' ? TriangleAlert : status === 'WAITING' ? Clock3 : status === 'QUEUED' ? CirclePause : Sparkles
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.ring} ${meta.soft} ${meta.text}`}>
    <Icon className="h-3.5 w-3.5" />
    {meta.label}
  </span>
}

function organicNodePosition(index: number, total: number) {
  const ringCount = total > 16 ? 3 : total > 8 ? 2 : 1
  const ring = index % ringCount
  const slotIndex = Math.floor(index / ringCount)
  const slotCount = Math.max(1, Math.ceil(total / ringCount))
  const angle = (slotIndex / slotCount) * Math.PI * 2 - Math.PI / 2 + (ring * Math.PI) / Math.max(slotCount, 2)
  const radii = ringCount === 1 ? [39] : ringCount === 2 ? [31, 43] : [27, 36, 45]
  const radius = radii[ring]
  return {
    left: 50 + Math.cos(angle) * radius,
    top: 53 + Math.sin(angle) * radius * 0.82,
  }
}

function RunNode({ run, label, selected, dense, onSelect }: { run: MonitoringRun; label: string; selected: boolean; dense: boolean; onSelect: () => void }) {
  const status = normalizeRunStatus(run.status)
  const meta = statusMeta(status)
  return <button
    type="button"
    onClick={(event) => { event.stopPropagation(); onSelect() }}
    className={`group relative grid place-items-center rounded-full border transition duration-300 hover:scale-110 ${dense ? 'h-8 w-8' : 'h-10 w-10'} ${meta.ring} ${meta.soft} ${selected ? 'scale-110 ring-2 ring-white/70' : ''}`}
    title={`${label} · ${meta.label}`}
    aria-label={`${label}, ${meta.label}`}
  >
    <span className={`absolute inset-1.5 rounded-full blur-md opacity-75 ${meta.dot}`} />
    <span className={`relative rounded-full ${dense ? 'h-2 w-2' : 'h-2.5 w-2.5'} ${meta.dot} ${status === 'RUNNING' ? 'animate-pulse' : ''}`} />
    <span className={`pointer-events-none absolute top-full mt-1 max-w-24 truncate rounded-md border border-white/10 bg-[#061426]/95 px-1.5 py-0.5 text-[9px] font-semibold text-slate-200 shadow-lg ${dense ? 'hidden group-hover:block group-focus-visible:block' : 'block'}`}>{label}</span>
  </button>
}

function OrganicDomainCell({
  cell,
  agents,
  selectedRunId,
  selected,
  onSelectDomain,
  onSelectRun,
}: {
  cell: DomainCell
  agents: Map<string, MonitoringAgent>
  selectedRunId: string | null
  selected: boolean
  onSelectDomain: () => void
  onSelectRun: (id: string) => void
}) {
  const meta = statusMeta(cell.status)
  const visibleRuns = cell.componentRuns
  const denseNodes = visibleRuns.length > 10
  return <article
    className={`group relative min-h-[340px] overflow-hidden rounded-[44%_56%_52%_48%/43%_45%_55%_57%] border bg-[#071a2c]/90 p-5 text-left transition duration-500 hover:-translate-y-1 hover:scale-[1.01] ${meta.ring} ${meta.glow} ${selected ? 'ring-2 ring-cyan-200/55' : ''}`}
  >
    <div className="absolute inset-0 opacity-75" style={{ backgroundImage: 'radial-gradient(circle at 35% 28%, rgba(34,211,238,.16), transparent 28%), radial-gradient(circle at 72% 68%, rgba(59,130,246,.12), transparent 34%), radial-gradient(circle at 50% 50%, rgba(255,255,255,.04), transparent 48%)' }} />
    <div className="absolute inset-[13%] rounded-full border border-cyan-100/[0.06] shadow-[inset_0_0_70px_rgba(34,211,238,.07)]" />
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-30">
      {visibleRuns.map((run, index) => {
        const position = organicNodePosition(index, visibleRuns.length)
        return <line key={run.id} x1="50%" y1="52%" x2={`${position.left}%`} y2={`${position.top}%`} stroke="rgba(103,232,249,.55)" strokeWidth="0.7" />
      })}
    </svg>

    <div className="relative z-10 flex items-start justify-between gap-3">
      <button type="button" onClick={onSelectDomain} className="min-w-0 text-left" aria-label={`Inspect ${cell.domainName} Data Domain`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/55">Data Domain</p>
        <h3 className="mt-1 truncate text-lg font-bold text-white group-hover:text-cyan-50">{cell.domainName}</h3>
        <p className="mt-0.5 truncate text-[10px] text-slate-500">Scope · {cell.project.name}</p>
      </button>
      <StatusPill status={cell.status} />
    </div>

    <button type="button" onClick={onSelectDomain} className="absolute left-1/2 top-[52%] z-10 -translate-x-1/2 -translate-y-1/2" aria-label={`Inspect ${cell.domainName} Data Domain summary`}>
      <div className={`grid h-28 w-28 place-items-center rounded-full border bg-[#071827]/95 ${meta.ring} ${meta.glow}`}>
        <div className="text-center">
          <div className={`mx-auto grid h-11 w-11 place-items-center rounded-full border ${meta.ring} ${meta.soft}`}><Layers3 className={`h-6 w-6 ${meta.text}`} /></div>
          <p className="mt-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">{cell.domainName}</p>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">{cell.componentCount} components</p>
        </div>
      </div>
    </button>

    <div className="absolute inset-[18%] z-20" aria-label={`${cell.componentCount} execution components inside ${cell.domainName}`}>
      {visibleRuns.map((run, index) => {
        const position = organicNodePosition(index, visibleRuns.length)
        const label = agents.get(run.agent_definition_id)?.name ?? 'Execution'
        return <div key={run.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${position.left}%`, top: `${position.top}%` }}>
          <RunNode run={run} label={label} selected={selectedRunId === run.id} dense={denseNodes} onSelect={() => onSelectRun(run.id)} />
        </div>
      })}
    </div>

    <div className="absolute bottom-5 left-5 right-5 z-10 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3 text-[11px] text-slate-400">
      <span>{cell.activeCount} active · {cell.completeCount} complete · {cell.failedCount} failed</span>
      <button type="button" onClick={onSelectDomain} className="inline-flex items-center gap-1 font-semibold text-cyan-200/70 hover:text-cyan-100">Inspect <ChevronRight className="h-3.5 w-3.5" /></button>
    </div>
  </article>
}

export function JobMonitor({
  initialRuns,
  initialAgents,
  initialDatasets,
  initialProjects,
  initialSteps,
  initialNow,
  initialRunId = null,
  userId: _userId,
}: Props) {
  const [runs, setRuns] = useState(initialRuns)
  const [steps, setSteps] = useState(initialSteps)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId && initialRuns.some((run) => run.id === initialRunId) ? initialRunId : initialRuns[0]?.id ?? null)
  const [selectedDomainKey, setSelectedDomainKey] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<CellStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState(() => new Date(initialNow))
  const [refreshing, setRefreshing] = useState(false)

  const agents = useMemo(() => new Map(initialAgents.map((agent) => [agent.id, agent])), [initialAgents])
  const datasets = useMemo(() => new Map(initialDatasets.map((dataset) => [dataset.id, dataset])), [initialDatasets])
  const projects = useMemo(() => new Map(initialProjects.map((project) => [project.id, project])), [initialProjects])
  const stepsByRun = useMemo(() => {
    const map = new Map<string, MonitoringStep[]>()
    for (const step of steps) map.set(step.agent_run_id, [...(map.get(step.agent_run_id) ?? []), step])
    for (const list of map.values()) list.sort((a, b) => a.step_order - b.step_order)
    return map
  }, [steps])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.schema('agent').from('agent_runs').select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message').order('created_at', { ascending: false }).limit(50)
      if (!error && data) {
        const nextRuns = data as MonitoringRun[]
        setRuns(nextRuns)
        const ids = nextRuns.map((run) => run.id)
        if (ids.length) {
          const { data: nextSteps, error: stepError } = await supabase.schema('agent').from('agent_run_steps').select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message').in('agent_run_id', ids).order('step_order')
          if (!stepError && nextSteps) setSteps(nextSteps as MonitoringStep[])
        } else {
          setSteps([])
        }
        setLastUpdated(new Date())
      }
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const domainCells = useMemo(() => {
    const grouped = new Map<string, { projectId: string; domainName: string; runs: MonitoringRun[] }>()
    for (const run of runs) {
      const domainName = dataDomainForRun(run, datasets)
      const key = `${run.project_id}::${domainName}`
      const current = grouped.get(key) ?? { projectId: run.project_id, domainName, runs: [] }
      current.runs.push(run)
      grouped.set(key, current)
    }

    const cells: DomainCell[] = []
    for (const [key, group] of grouped) {
      const projectRuns = group.runs
      const project = projects.get(group.projectId) ?? { id: group.projectId, name: `Scope ${group.projectId.slice(0, 8)}`, description: 'Governed execution scope' }
      const componentRuns = latestRunPerComponent(projectRuns)
      const status = aggregateStatus(componentRuns)
      cells.push({
        key,
        domainName: group.domainName,
        project,
        runs: projectRuns,
        componentRuns,
        status,
        activeCount: componentRuns.filter((run) => ACTIVE.has(run.status) || WAITING.has(run.status) || QUEUED.has(run.status)).length,
        failedCount: componentRuns.filter((run) => normalizeRunStatus(run.status) === 'FAILED').length,
        completeCount: componentRuns.filter((run) => normalizeRunStatus(run.status) === 'COMPLETE').length,
        componentCount: componentRuns.length,
        datasetCount: new Set(projectRuns.flatMap((run) => run.dataset_id ? [run.dataset_id] : [])).size,
        latestAt: projectRuns[0]?.created_at ?? initialNow,
      })
    }
    return cells.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
  }, [runs, projects, datasets, initialNow])

  useEffect(() => {
    if (selectedDomainKey && domainCells.some((cell) => cell.key === selectedDomainKey)) return
    const selected = selectedRunId ? runs.find((run) => run.id === selectedRunId) : null
    const selectedCell = selected ? domainCells.find((cell) => cell.runs.some((run) => run.id === selected.id)) : null
    setSelectedDomainKey(selectedCell?.key ?? domainCells[0]?.key ?? null)
  }, [domainCells, runs, selectedRunId, selectedDomainKey])

  const filteredCells = useMemo(() => {
    const q = search.trim().toLowerCase()
    return domainCells.filter((cell) => {
      const matchesStatus = statusFilter === 'ALL' || cell.status === statusFilter
      const matchesSearch = !q || cell.domainName.toLowerCase().includes(q) || cell.project.name.toLowerCase().includes(q) || cell.runs.some((run) => {
        const agent = agents.get(run.agent_definition_id)?.name ?? ''
        const dataset = run.dataset_id ? datasets.get(run.dataset_id)?.name ?? '' : ''
        return `${agent} ${dataset} ${run.id}`.toLowerCase().includes(q)
      })
      return matchesStatus && matchesSearch
    })
  }, [domainCells, statusFilter, search, agents, datasets])

  const selectedCell = domainCells.find((cell) => cell.key === selectedDomainKey) ?? domainCells[0] ?? null
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? selectedCell?.runs[0] ?? null
  const selectedSteps = selectedRun ? stepsByRun.get(selectedRun.id) ?? [] : []
  const progress = stepProgress(selectedSteps)

  const activeJobs = runs.filter((run) => ACTIVE.has(run.status)).length
  const queuedJobs = runs.filter((run) => WAITING.has(run.status) || QUEUED.has(run.status)).length
  const completed24h = runs.filter((run) => {
    if (!COMPLETE.has(run.status)) return false
    const at = new Date(run.completed_at ?? run.created_at).getTime()
    return lastUpdated.getTime() - at <= 24 * 60 * 60 * 1000
  }).length
  const failed24h = runs.filter((run) => {
    if (normalizeRunStatus(run.status) !== 'FAILED') return false
    const at = new Date(run.completed_at ?? run.created_at).getTime()
    return lastUpdated.getTime() - at <= 24 * 60 * 60 * 1000
  }).length

  function selectDomain(cell: DomainCell) {
    setSelectedDomainKey(cell.key)
    if (!selectedRunId || !cell.runs.some((run) => run.id === selectedRunId)) setSelectedRunId(cell.componentRuns[0]?.id ?? cell.runs[0]?.id ?? null)
  }

  function selectRun(runId: string) {
    const cell = domainCells.find((item) => item.runs.some((run) => run.id === runId))
    if (cell) setSelectedDomainKey(cell.key)
    setSelectedRunId(runId)
  }

  return <section className="overflow-hidden rounded-3xl border border-cyan-300/10 bg-[#061426] shadow-[0_24px_80px_rgba(0,0,0,.35)]">
    <div className="border-b border-white/[0.07] bg-[#07182a]/95 px-5 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Active jobs', activeJobs, 'text-cyan-200'],
            ['Running', runs.filter((run) => ACTIVE.has(run.status)).length, 'text-emerald-300'],
            ['Queued', queuedJobs, 'text-amber-200'],
            ['Completed (24h)', completed24h, 'text-emerald-300'],
            ['Failed (24h)', failed24h, 'text-rose-300'],
          ].map(([label, value, tone]) => <div key={String(label)} className="min-w-[112px] border-l border-white/10 pl-3 first:border-l-0 first:pl-0">
            <p className={`text-2xl font-black ${tone}`}>{value}</p>
            <p className="text-[11px] text-slate-400">{label}</p>
          </div>)}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>Updated {TIME_FORMATTER.format(lastUpdated)}</span>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/5 px-3 py-2 font-semibold text-cyan-100 transition hover:bg-cyan-300/10 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
    </div>

    <div className="border-b border-white/[0.07] bg-[#051220] px-5 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search data domains, components, datasets, or run IDs…" className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/35" />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CellStatus | 'ALL')} className="rounded-xl border border-white/10 bg-[#07182a] px-3 py-2.5 text-sm text-slate-200">
          <option value="ALL">All statuses</option>
          <option value="RUNNING">Running</option>
          <option value="WAITING">Waiting</option>
          <option value="QUEUED">Queued</option>
          <option value="FAILED">Failed</option>
          <option value="COMPLETE">Complete</option>
        </select>
        <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/8 px-3 py-2.5 text-sm font-bold text-cyan-100">Domain Cells</div>
      </div>
    </div>

    <div className="grid min-h-[720px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative overflow-hidden border-r border-white/[0.07] bg-[#03101d] p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-0 opacity-45" style={{ backgroundImage: 'radial-gradient(circle at 50% 45%, rgba(14,165,233,.14), transparent 34%), radial-gradient(circle at 12% 20%, rgba(16,185,129,.06), transparent 20%), radial-gradient(circle at 87% 72%, rgba(139,92,246,.08), transparent 22%)' }} />
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)', backgroundSize: '42px 42px' }} />

        <div className="relative z-10 mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/55">Governed topology</p>
            <h2 className="mt-1 text-xl font-bold text-white">Luminous Data Domain cells</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Each luminous organic cell is a persisted catalog Data Domain. Every execution component appears inside its domain membrane as a live status organelle, while the selected inspector resolves the broader governed component network from persisted governance, quality, lineage, evidence, and durable orchestration records. Unassigned executions remain explicit instead of being guessed into a domain.</p>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-slate-500 sm:flex"><GitBranch className="h-4 w-4" /> Execution relationships remain inspectable in run details</div>
        </div>

        {filteredCells.length ? <div className="relative z-10 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredCells.map((cell) => <OrganicDomainCell
            key={cell.key}
            cell={cell}
            agents={agents}
            selectedRunId={selectedRunId}
            selected={selectedCell?.key === cell.key}
            onSelectDomain={() => selectDomain(cell)}
            onSelectRun={selectRun}
          />)}
        </div> : <div className="relative z-10 grid min-h-[480px] place-items-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02]">
          <div className="text-center">
            <BrainCircuit className="mx-auto h-10 w-10 text-cyan-200/45" />
            <p className="mt-3 font-semibold text-slate-300">No matching domain cells</p>
            <p className="mt-1 text-xs text-slate-500">Adjust the status filter or search criteria.</p>
          </div>
        </div>}

        <div className="relative z-10 mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] pt-4 text-[11px] text-slate-400">
          {(['RUNNING', 'COMPLETE', 'WAITING', 'FAILED', 'QUEUED'] as CellStatus[]).map((status) => {
            const meta = statusMeta(status)
            return <span key={status} className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />{meta.label}</span>
          })}
          <span className="ml-auto text-slate-500">Cells show execution state · selected inspector resolves governed components and evidence</span>
        </div>
      </div>

      <aside className="bg-[#07182a] p-5">
        {selectedCell ? <div className="space-y-5">
          <div className="border-b border-white/10 pb-4">
            <p className="text-xs font-semibold text-slate-400">Selected Data Domain</p>
            <h3 className="mt-2 text-2xl font-bold text-white">{selectedCell.domainName}</h3>
            <p className="mt-1 text-xs text-slate-500">Governed scope · {selectedCell.project.name}</p>
            <div className="mt-3"><StatusPill status={selectedCell.status} /></div>
            {selectedCell.project.description ? <p className="mt-3 text-xs leading-5 text-slate-500">{selectedCell.project.description}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xl font-black text-cyan-100">{selectedCell.componentCount}</p><p className="text-[10px] uppercase tracking-wide text-slate-500">Components</p></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xl font-black text-sky-200">{selectedCell.datasetCount}</p><p className="text-[10px] uppercase tracking-wide text-slate-500">Datasets</p></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xl font-black text-emerald-300">{selectedCell.completeCount}</p><p className="text-[10px] uppercase tracking-wide text-slate-500">Complete</p></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xl font-black text-rose-300">{selectedCell.failedCount}</p><p className="text-[10px] uppercase tracking-wide text-slate-500">Failed</p></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between"><h4 className="font-semibold text-slate-200">Execution components</h4><span className="text-[10px] text-slate-500">{selectedCell.runs.length} recent runs · latest state per component</span></div>
            <div className="max-h-[310px] space-y-2 overflow-auto pr-1">
              {selectedCell.componentRuns.map((run) => {
                const meta = statusMeta(normalizeRunStatus(run.status))
                const agent = agents.get(run.agent_definition_id)
                const dataset = run.dataset_id ? datasets.get(run.dataset_id) : null
                const p = stepProgress(stepsByRun.get(run.id) ?? [])
                return <button key={run.id} type="button" onClick={() => selectRun(run.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedRun?.id === run.id ? 'border-cyan-300/35 bg-cyan-300/[0.07]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-200">{agent?.name ?? 'Execution component'}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{dataset?.name ?? 'No dataset'} · {relativeAge(run, lastUpdated)}</p></div>
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-cyan-300/70" style={{ width: `${p.percent}%` }} /></div>
                </button>
              })}
            </div>
          </div>

          {selectedRun ? <div className="border-t border-white/10 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/55">Selected execution</p>
                <p className="mt-1 font-semibold text-white">{agents.get(selectedRun.agent_definition_id)?.name ?? 'Agent execution'}</p>
              </div>
              <ExecutionStatusBadge status={selectedRun.status} />
            </div>
            <div className="mt-3 space-y-2">
              {selectedSteps.length ? selectedSteps.slice(0, 6).map((step) => {
                const status = normalizeRunStatus(step.status)
                const meta = statusMeta(status)
                const Icon = status === 'COMPLETE' ? CircleCheck : status === 'FAILED' ? TriangleAlert : status === 'RUNNING' ? Sparkles : CirclePause
                return <div key={step.id} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs">
                  <Icon className={`h-4 w-4 ${meta.text}`} />
                  <span className="min-w-0 flex-1 truncate text-slate-300">{step.step_name}</span>
                  <span className={meta.text}>{meta.label}</span>
                </div>
              }) : <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">Execution steps are not yet recorded.</div>}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500"><span>{progress.done}/{progress.total} steps complete</span><span>{DATE_FORMATTER.format(new Date(selectedRun.created_at))}</span></div>
            <Link href={`/monitoring?run=${encodeURIComponent(selectedRun.id)}#job-logs`} className="mt-4 flex w-full items-center justify-between rounded-xl border border-cyan-300/35 bg-cyan-300/[0.07] px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/10">
              View execution details
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div> : null}

          {selectedRun ? <GovernedDomainContext
            projectId={selectedRun.project_id}
            runId={selectedRun.id}
            datasetId={selectedRun.dataset_id}
            domainName={selectedCell.domainName}
          /> : null}

          <div className="grid gap-2 border-t border-white/10 pt-4 text-xs">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><Database className="h-4 w-4 text-cyan-300" /><div><p className="font-semibold text-slate-300">Evidence boundary</p><p className="text-[11px] text-slate-500">Recorded context is loaded through authorized server APIs only</p></div></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><ShieldCheck className="h-4 w-4 text-emerald-300" /><div><p className="font-semibold text-slate-300">Governed scope</p><p className="text-[11px] text-slate-500">Project authorization and existing execution controls remain enforced</p></div></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><BrainCircuit className="h-4 w-4 text-violet-300" /><div><p className="font-semibold text-slate-300">AI execution</p><p className="text-[11px] text-slate-500">Organic cells visualize recorded state, not authority</p></div></div>
          </div>
        </div> : <div className="grid h-full place-items-center text-center"><div><Layers3 className="mx-auto h-10 w-10 text-slate-600" /><p className="mt-3 text-sm font-semibold text-slate-400">No domain selected</p></div></div>}
      </aside>
    </div>
  </section>
}
