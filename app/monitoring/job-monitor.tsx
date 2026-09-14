'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  initialAgentId?: string | null
  initialDomainKey?: string | null
  userId: string
}

type CellStatus = 'FAILED' | 'RUNNING' | 'WAITING' | 'QUEUED' | 'COMPLETE' | 'IDLE'

type FeaturePresentation = {
  label: string
  category: 'DG' | 'AI' | 'DQ' | 'OPS'
  activities: readonly string[]
  description: string
}

type DomainComponent = { agent: MonitoringAgent; run: MonitoringRun | null; feature: FeaturePresentation }

type DomainCell = {
  key: string
  domainName: string
  project: MonitoringProject
  runs: MonitoringRun[]
  componentRuns: MonitoringRun[]
  components: DomainComponent[]
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

const FEATURE_PRESENTATION: Record<string, FeaturePresentation> = {
  profiling_agent: {
    label: 'Profiling & Discovery',
    category: 'AI',
    activities: ['Discover', 'Profile', 'Metrics', 'Findings'],
    description: 'Discovers schema, profiles governed data, computes metrics, and records findings.',
  },
  data_quality_agent: {
    label: 'Quality Controls',
    category: 'DQ',
    activities: ['Sync rules', 'Execute', 'Validate', 'Publish'],
    description: 'Runs governed quality controls, validates outcomes, and publishes durable evidence.',
  },
  steward_agent: {
    label: 'Stewardship & CDE',
    category: 'DG',
    activities: ['Glossary', 'CDE', 'Classify', 'Steward'],
    description: 'Surfaces glossary, critical-data-element, classification, stewardship, and certification context.',
  },
  governance_analyst_agent: {
    label: 'Policy & Risk',
    category: 'DG',
    activities: ['Policy', 'Controls', 'Risk', 'Contracts'],
    description: 'Evaluates policy, governance controls, risk, contracts, and regulatory context.',
  },
  architect_agent: {
    label: 'Lineage & Architecture',
    category: 'DG',
    activities: ['Catalog', 'Schema', 'Lineage', 'Impact'],
    description: 'Connects catalog, schema, lineage, contracts, and change-impact evidence.',
  },
  investigator_agent: {
    label: 'Investigation',
    category: 'AI',
    activities: ['Issues', 'Anomalies', 'Root cause', 'Remediation'],
    description: 'Investigates quality incidents, anomalies, lineage context, and remediation history.',
  },
  executive_agent: {
    label: 'Trust & Scorecards',
    category: 'DG',
    activities: ['Scorecards', 'Risk', 'Certify', 'Controls'],
    description: 'Summarizes scorecards, risk, certification, issues, and control posture for decision makers.',
  },
  support_agent: {
    label: 'Operations & Recovery',
    category: 'OPS',
    activities: ['Alerts', 'Issues', 'Recovery', 'Support'],
    description: 'Connects operational alerts, issues, recovery history, and lineage for support workflows.',
  },
}

const DOMAIN_PALETTES = [
  { edge: '#22d3ee', glow: 'rgba(34,211,238,.36)', secondary: '#3b82f6' },
  { edge: '#34d399', glow: 'rgba(52,211,153,.34)', secondary: '#14b8a6' },
  { edge: '#a78bfa', glow: 'rgba(167,139,250,.34)', secondary: '#6366f1' },
  { edge: '#f59e0b', glow: 'rgba(245,158,11,.34)', secondary: '#f97316' },
  { edge: '#f472b6', glow: 'rgba(244,114,182,.34)', secondary: '#d946ef' },
  { edge: '#60a5fa', glow: 'rgba(96,165,250,.34)', secondary: '#22d3ee' },
] as const

function featurePresentation(agent: MonitoringAgent): FeaturePresentation {
  return FEATURE_PRESENTATION[agent.agent_key] ?? {
    label: agent.name.replace(/\s+Agent$/i, ''),
    category: 'AI',
    activities: ['Inspect', 'Analyze', 'Evidence', 'Outcome'],
    description: 'Governed AI capability backed by the registered agent definition.',
  }
}

function isSupervisorAgent(agent: MonitoringAgent) {
  return agent.agent_key === 'native_supervisor_agent'
}

function domainPalette(name: string) {
  let hash = 0
  for (const char of name) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return DOMAIN_PALETTES[Math.abs(hash) % DOMAIN_PALETTES.length]
}

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

function RunNode({ run, feature, selected, dense, onSelect }: { run: MonitoringRun; feature: FeaturePresentation; selected: boolean; dense: boolean; onSelect: () => void }) {
  const status = normalizeRunStatus(run.status)
  const meta = statusMeta(status)
  return <button
    type="button"
    onClick={(event) => { event.stopPropagation(); onSelect() }}
    className={`group relative grid place-items-center rounded-[45%_55%_50%_50%/48%_44%_56%_52%] border transition duration-300 hover:scale-105 ${dense ? 'h-12 w-16' : 'h-14 w-20'} ${meta.ring} ${meta.soft} ${selected ? 'scale-110 ring-2 ring-white/70' : ''}`}
    title={`${feature.label} · ${meta.label}`}
    aria-label={`${feature.label}, ${meta.label}`}
  >
    <span className={`absolute inset-1 rounded-[45%_55%_50%_50%/48%_44%_56%_52%] blur-md opacity-70 ${meta.dot}`} />
    <span className="relative z-10 px-1 text-center">
      <span className={`mx-auto block rounded-full ${dense ? 'h-2 w-2' : 'h-2.5 w-2.5'} ${meta.dot} ${status === 'RUNNING' ? 'animate-pulse' : ''}`} />
      <span className="mt-1 block max-w-[78px] truncate text-[9px] font-bold leading-tight text-slate-100">{feature.label}</span>
      <span className="mt-0.5 hidden text-[7px] text-slate-400 sm:block">{feature.activities.slice(0, 2).join(' · ')}</span>
    </span>
  </button>
}

function NotExecutedNode({ feature, dense, selected, onSelect }: { feature: FeaturePresentation; dense: boolean; selected: boolean; onSelect: () => void }) {
  return <button
    type="button"
    onClick={(event) => { event.stopPropagation(); onSelect() }}
    className={`group relative grid place-items-center rounded-[45%_55%_50%_50%/48%_44%_56%_52%] border border-slate-700/60 bg-slate-900/55 opacity-60 transition duration-300 hover:scale-105 hover:opacity-90 ${dense ? 'h-12 w-16' : 'h-14 w-20'} ${selected ? 'scale-110 ring-2 ring-slate-400/70 opacity-100' : ''}`}
    title={`${feature.label} · Not executed`}
    aria-label={`${feature.label}, not executed. Open drilldown.`}
  >
    <span className="relative z-10 px-1 text-center">
      <span className={`mx-auto block rounded-full bg-slate-600 ${dense ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
      <span className="mt-1 block max-w-[78px] truncate text-[9px] font-bold leading-tight text-slate-500">{feature.label}</span>
      <span className="mt-0.5 hidden text-[7px] text-slate-600 sm:block">{feature.activities.slice(0, 2).join(' · ')}</span>
    </span>
  </button>
}

function OrganicDomainCell({
  cell,
  agents,
  selectedRunId,
  selectedAgentId,
  selected,
  onSelectDomain,
  onSelectAgent,
}: {
  cell: DomainCell
  agents: Map<string, MonitoringAgent>
  selectedRunId: string | null
  selectedAgentId: string | null
  selected: boolean
  onSelectDomain: () => void
  onSelectAgent: (agentId: string, runId: string | null) => void
}) {
  const meta = statusMeta(cell.status)
  const palette = domainPalette(cell.domainName)
  const visibleComponents = cell.components
  const denseNodes = visibleComponents.length > 8
  return <article
    onClick={onSelectDomain}
    className={`group relative min-h-[410px] cursor-pointer overflow-hidden rounded-[44%_56%_52%_48%/43%_45%_55%_57%] border bg-[#071a2c]/90 p-5 text-left transition duration-500 hover:-translate-y-1 hover:scale-[1.01] ${meta.ring} ${meta.glow} ${selected ? 'ring-2 ring-cyan-200/55' : ''}`}
  >
    <div className="absolute inset-0 opacity-90" style={{ backgroundImage: `radial-gradient(circle at 32% 25%, ${palette.glow}, transparent 25%), radial-gradient(circle at 72% 70%, ${palette.secondary}22, transparent 34%), radial-gradient(circle at 50% 50%, rgba(255,255,255,.05), transparent 50%)` }} />
    <div className="absolute inset-[5%] rounded-[46%_54%_52%_48%/43%_47%_53%_57%] border opacity-90" style={{ borderColor: palette.edge, boxShadow: `0 0 32px ${palette.glow}, inset 0 0 48px ${palette.glow}` }} />
    <div className="absolute inset-[11%] rounded-full border border-white/[0.08] shadow-[inset_0_0_70px_rgba(34,211,238,.07)]" />
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-30">
      {visibleComponents.map((component, index) => {
        const position = organicNodePosition(index, visibleComponents.length)
        const stroke = component.run ? palette.edge : 'rgba(100,116,139,.28)'
        return <line key={component.agent.id} x1="50%" y1="53%" x2={`${position.left}%`} y2={`${position.top}%`} stroke={stroke} strokeWidth={component.run ? '1.15' : '0.65'} style={{ filter: component.run ? `drop-shadow(0 0 4px ${palette.edge})` : undefined }} />
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

    <button type="button" onClick={onSelectDomain} className="absolute left-1/2 top-[53%] z-10 -translate-x-1/2 -translate-y-1/2" aria-label={`Inspect ${cell.domainName} Data Domain summary`}>
      <div className={`grid h-28 w-28 place-items-center rounded-full border bg-[#071827]/95 ${meta.ring} ${meta.glow}`}>
        <div className="text-center">
          <div className={`mx-auto grid h-11 w-11 place-items-center rounded-full border ${meta.ring} ${meta.soft}`}><BrainCircuit className={`h-6 w-6 ${meta.text}`} /></div>
          <p className="mt-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-200">Supervisor</p>
          <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.11em] text-cyan-200/65">Orchestrator · Monitor</p>
        </div>
      </div>
    </button>

    <div className="absolute inset-[18%] z-20" aria-label={`${cell.componentCount} possible execution components inside ${cell.domainName}`}>
      {visibleComponents.map((component, index) => {
        const position = organicNodePosition(index, visibleComponents.length)
        return <div key={component.agent.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${position.left}%`, top: `${position.top}%` }}>
          {component.run
            ? <RunNode run={component.run} feature={component.feature} selected={selectedRunId === component.run.id} dense={denseNodes} onSelect={() => onSelectAgent(component.agent.id, component.run!.id)} />
            : <NotExecutedNode feature={component.feature} dense={denseNodes} selected={selectedAgentId === component.agent.id} onSelect={() => onSelectAgent(component.agent.id, null)} />}
        </div>
      })}
    </div>

    <div className="absolute bottom-5 left-5 right-5 z-10 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3 text-[11px] text-slate-400">
      <span>{cell.completeCount}/{cell.componentCount} features complete · {cell.activeCount} active · {cell.failedCount} failed</span>
      <button type="button" onClick={onSelectDomain} className="inline-flex items-center gap-1 font-semibold text-cyan-200/70 hover:text-cyan-100">View domain <ChevronRight className="h-3.5 w-3.5" /></button>
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
  initialAgentId = null,
  initialDomainKey = null,
  userId: _userId,
}: Props) {
  const [runs, setRuns] = useState(initialRuns)
  const [steps, setSteps] = useState(initialSteps)
  const initialSelectedRun = initialRunId && initialRuns.some((run) => run.id === initialRunId) ? initialRunId : initialAgentId ? null : initialRuns[0]?.id ?? null
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialSelectedRun)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialAgentId ?? (initialSelectedRun ? initialRuns.find((run) => run.id === initialSelectedRun)?.agent_definition_id ?? null : null))
  const [selectedDomainKey, setSelectedDomainKey] = useState<string | null>(initialDomainKey)
  const inspectorRef = useRef<HTMLElement | null>(null)
  const [statusFilter, setStatusFilter] = useState<CellStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState(() => new Date(initialNow))
  const [refreshing, setRefreshing] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<'OVERVIEW' | 'FEATURES' | 'JOBS' | 'EVIDENCE'>('OVERVIEW')

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
      const latestByAgent = new Map(componentRuns.map((run) => [run.agent_definition_id, run]))
      const components: DomainComponent[] = initialAgents.filter((agent) => !isSupervisorAgent(agent)).map((agent) => ({ agent, run: latestByAgent.get(agent.id) ?? null, feature: featurePresentation(agent) }))
      const status = aggregateStatus(componentRuns)
      cells.push({
        key,
        domainName: group.domainName,
        project,
        runs: projectRuns,
        componentRuns,
        components,
        status,
        activeCount: componentRuns.filter((run) => ACTIVE.has(run.status) || WAITING.has(run.status) || QUEUED.has(run.status)).length,
        failedCount: componentRuns.filter((run) => normalizeRunStatus(run.status) === 'FAILED').length,
        completeCount: componentRuns.filter((run) => normalizeRunStatus(run.status) === 'COMPLETE').length,
        componentCount: components.length,
        datasetCount: new Set(projectRuns.flatMap((run) => run.dataset_id ? [run.dataset_id] : [])).size,
        latestAt: projectRuns[0]?.created_at ?? initialNow,
      })
    }
    return cells.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
  }, [runs, projects, datasets, initialAgents, initialNow])

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
        const agent = agents.get(run.agent_definition_id)
        const feature = agent ? featurePresentation(agent).label : ''
        const dataset = run.dataset_id ? datasets.get(run.dataset_id)?.name ?? '' : ''
        return `${feature} ${agent?.name ?? ''} ${dataset} ${run.id}`.toLowerCase().includes(q)
      })
      return matchesStatus && matchesSearch
    })
  }, [domainCells, statusFilter, search, agents, datasets])

  const selectedCell = domainCells.find((cell) => cell.key === selectedDomainKey) ?? domainCells[0] ?? null
  const selectedAgent = selectedAgentId ? agents.get(selectedAgentId) ?? null : null
  const selectedFeature = selectedAgent ? featurePresentation(selectedAgent) : null
  const selectedRun = selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? null : null
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

  function revealInspector() {
    window.requestAnimationFrame(() => {
      inspectorRef.current?.focus({ preventScroll: true })
      inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    })
  }

  function updateDrilldownUrl(cell: DomainCell, agentId: string | null, runId: string | null) {
    const url = new URL(window.location.href)
    url.searchParams.set('domain', cell.key)
    if (agentId) url.searchParams.set('agent', agentId)
    else url.searchParams.delete('agent')
    if (runId) url.searchParams.set('run', runId)
    else url.searchParams.delete('run')
    window.history.replaceState(window.history.state, '', url)
  }

  function openRunResults(runId: string) {
    window.location.assign(`/agents/runs/${encodeURIComponent(runId)}`)
  }

  function selectDomain(cell: DomainCell) {
    const retainedRun = selectedRunId ? cell.runs.find((run) => run.id === selectedRunId) ?? null : null
    const nextRun = retainedRun ?? cell.componentRuns[0] ?? cell.runs[0] ?? null
    setSelectedDomainKey(cell.key)
    setSelectedRunId(nextRun?.id ?? null)
    setSelectedAgentId(nextRun?.agent_definition_id ?? null)
    setInspectorTab('OVERVIEW')
    updateDrilldownUrl(cell, nextRun?.agent_definition_id ?? null, nextRun?.id ?? null)
    revealInspector()
  }

  function selectAgent(cell: DomainCell, agentId: string, runId: string | null) {
    if (runId) {
      openRunResults(runId)
      return
    }
    setSelectedDomainKey(cell.key)
    setSelectedAgentId(agentId)
    setSelectedRunId(null)
    setInspectorTab('FEATURES')
    updateDrilldownUrl(cell, agentId, null)
    revealInspector()
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search data domains, DG/AI features, datasets, or run IDs…" className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/35" />
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
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Each luminous organic cell is a persisted catalog Data Domain. Each Data Domain is one living cell. The central Supervisor/Orchestrator coordinates the domain, while surrounding DG and AI feature cells show the governed capabilities available to that domain. Recorded feature execution is illuminated; features with no recorded execution remain grey. The selected inspector resolves the broader governed component network from persisted governance, quality, lineage, evidence, and orchestration records.</p>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-slate-500 sm:flex"><GitBranch className="h-4 w-4" /> Execution relationships remain inspectable in run details</div>
        </div>

        {filteredCells.length ? <div className="relative z-10 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredCells.map((cell) => <OrganicDomainCell
            key={cell.key}
            cell={cell}
            agents={agents}
            selectedRunId={selectedRunId}
            selectedAgentId={selectedAgentId}
            selected={selectedCell?.key === cell.key}
            onSelectDomain={() => selectDomain(cell)}
            onSelectAgent={(agentId, runId) => selectAgent(cell, agentId, runId)}
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
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-600" />Not executed</span><span className="ml-auto text-slate-500">Feature cells show delivered DG/AI capability, not internal agent names</span>
        </div>
      </div>

      <aside id="job-monitor-inspector" ref={inspectorRef} tabIndex={-1} className="scroll-mt-6 bg-[#07182a] p-5 outline-none">
        {selectedCell ? <div className="space-y-5">
          <div className="border-b border-white/10 pb-4">
            <p className="text-xs font-semibold text-slate-400">Selected Data Domain</p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl font-bold text-white">{selectedCell.domainName}</h3>
                <p className="mt-1 text-xs text-slate-500">Governed scope · {selectedCell.project.name}</p>
              </div>
              <StatusPill status={selectedCell.status} />
            </div>
            {selectedCell.project.description ? <p className="mt-3 text-xs leading-5 text-slate-500">{selectedCell.project.description}</p> : null}
            <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-xl border border-white/10 bg-black/10 text-[10px] font-bold">
              {(['OVERVIEW','FEATURES','JOBS','EVIDENCE'] as const).map((tab) => <button key={tab} type="button" onClick={() => setInspectorTab(tab)} className={`px-2 py-2.5 transition ${inspectorTab === tab ? 'bg-cyan-300/12 text-cyan-100' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'}`}>{tab === 'FEATURES' ? 'DG / AI Features' : tab === 'JOBS' ? 'Jobs' : tab === 'EVIDENCE' ? 'Evidence' : 'Overview'}</button>)}
            </div>
          </div>

          {inspectorTab === 'OVERVIEW' ? <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xl font-black text-cyan-100">{selectedCell.componentCount}</p><p className="text-[10px] uppercase tracking-wide text-slate-500">DG / AI features</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xl font-black text-sky-200">{selectedCell.datasetCount}</p><p className="text-[10px] uppercase tracking-wide text-slate-500">Datasets</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xl font-black text-emerald-300">{selectedCell.completeCount}</p><p className="text-[10px] uppercase tracking-wide text-slate-500">Features complete</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xl font-black text-rose-300">{selectedCell.failedCount}</p><p className="text-[10px] uppercase tracking-wide text-slate-500">Features failed</p></div>
            </div>
            <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.03] p-4">
              <div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-cyan-300" /><p className="text-sm font-bold text-slate-200">Supervisor / Orchestrator</p></div>
              <p className="mt-2 text-xs leading-5 text-slate-500">Coordinates the domain feature network, reflects durable execution state, and routes you into recorded feature results without replacing governance authorization.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400"><span className="rounded-full border border-white/10 px-2 py-1">Coordinate</span><span className="rounded-full border border-white/10 px-2 py-1">Monitor</span><span className="rounded-full border border-white/10 px-2 py-1">Route</span><span className="rounded-full border border-white/10 px-2 py-1">Evidence</span></div>
            </div>
          </div> : null}

          {inspectorTab === 'FEATURES' ? <div>
            <div className="mb-2 flex items-center justify-between"><h4 className="font-semibold text-slate-200">DG / AI feature components</h4><span className="text-[10px] text-slate-500">{selectedCell.completeCount}/{selectedCell.componentCount} completed · latest recorded state</span></div>
            <div className="max-h-[310px] space-y-2 overflow-auto pr-1">
              {selectedCell.components.map((component) => {
                const run = component.run
                if (!run) return <button key={component.agent.id} type="button" onClick={() => selectAgent(selectedCell, component.agent.id, null)} className={`w-full rounded-xl border p-3 text-left transition ${selectedAgentId === component.agent.id ? 'border-slate-400/60 bg-slate-800/40 opacity-100' : 'border-slate-800/80 bg-slate-950/30 opacity-70 hover:border-slate-600/80 hover:opacity-90'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[8px] font-black text-slate-600">{component.feature.category}</span><p className="truncate text-sm font-semibold text-slate-500">{component.feature.label}</p></div><p className="mt-1 truncate text-[10px] text-slate-600">{component.feature.activities.join(' · ')}</p><p className="mt-0.5 text-[11px] text-slate-600">Not executed</p></div>
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-600" />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.04]" />
                </button>
                const meta = statusMeta(normalizeRunStatus(run.status))
                const dataset = run.dataset_id ? datasets.get(run.dataset_id) : null
                const p = stepProgress(stepsByRun.get(run.id) ?? [])
                return <button key={component.agent.id} type="button" onClick={() => selectAgent(selectedCell, component.agent.id, run.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedRun?.id === run.id ? 'border-cyan-300/35 bg-cyan-300/[0.07]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded-full border border-cyan-300/20 px-1.5 py-0.5 text-[8px] font-black text-cyan-200/70">{component.feature.category}</span><p className="truncate text-sm font-semibold text-slate-200">{component.feature.label}</p></div><p className="mt-1 truncate text-[10px] text-slate-500">{component.feature.activities.join(' · ')}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{dataset?.name ?? 'No dataset'} · {relativeAge(run, lastUpdated)}</p></div>
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-cyan-300/70" style={{ width: `${p.percent}%` }} /></div>
                </button>
              })}
            </div>
          </div> : null}

          {inspectorTab === 'FEATURES' && selectedAgent && !selectedRun ? <div className="border-t border-white/10 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Selected execution path</p>
            <div className="mt-2 rounded-xl border border-slate-700/70 bg-slate-950/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-semibold text-slate-300">{selectedFeature?.label ?? 'Governed feature'}</p><p className="mt-1 text-[11px] text-slate-500">{selectedFeature?.category ?? 'AI'} feature · {selectedFeature?.activities.join(' · ')}</p></div>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Not executed</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">{selectedFeature?.description ?? 'This governed feature is available to the domain.'} No recorded execution exists for this domain yet, so progress, evidence, and diagnostics remain intentionally absent.</p>
              <Link href="/agents" className="mt-4 flex w-full items-center justify-between rounded-xl border border-slate-600/60 bg-slate-800/30 px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-slate-800/50">
                Open governed agent workspace
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div> : null}

          {inspectorTab === 'FEATURES' && selectedRun ? <div className="border-t border-white/10 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/55">Selected execution</p>
                <p className="mt-1 font-semibold text-white">{agents.get(selectedRun.agent_definition_id) ? featurePresentation(agents.get(selectedRun.agent_definition_id)!).label : 'Governed feature execution'}</p>
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
            <Link href={`/agents/runs/${encodeURIComponent(selectedRun.id)}`} className="mt-4 flex w-full items-center justify-between rounded-xl border border-cyan-300/35 bg-cyan-300/[0.07] px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/10">
              Open output / results
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div> : null}

          {inspectorTab === 'JOBS' ? <div>
            <div className="mb-2 flex items-center justify-between"><h4 className="font-semibold text-slate-200">Recent domain executions</h4><span className="text-[10px] text-slate-500">{selectedCell.runs.length} recorded runs</span></div>
            <div className="max-h-[430px] space-y-2 overflow-auto pr-1">
              {selectedCell.runs.slice(0, 20).map((run) => {
                const agent = agents.get(run.agent_definition_id)
                const feature = agent ? featurePresentation(agent) : null
                const meta = statusMeta(normalizeRunStatus(run.status))
                const dataset = run.dataset_id ? datasets.get(run.dataset_id) : null
                return <Link key={run.id} href={`/agents/runs/${encodeURIComponent(run.id)}`} className="block rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-200">{feature?.label ?? 'Governed execution'}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{dataset?.name ?? 'No dataset'} · {DATE_FORMATTER.format(new Date(run.created_at))}</p></div><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} /></div>
                  <div className="mt-2 flex items-center justify-between text-[10px]"><span className={meta.text}>{meta.label}</span><span className="text-cyan-200/65">Open results →</span></div>
                </Link>
              })}
            </div>
          </div> : null}

          {inspectorTab === 'EVIDENCE' && selectedRun ? <GovernedDomainContext
            projectId={selectedRun.project_id}
            runId={selectedRun.id}
            datasetId={selectedRun.dataset_id}
            domainName={selectedCell.domainName}
          /> : null}

          <div className="grid gap-2 border-t border-white/10 pt-4 text-xs">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><Database className="h-4 w-4 text-cyan-300" /><div><p className="font-semibold text-slate-300">Evidence boundary</p><p className="text-[11px] text-slate-500">Recorded context is loaded through authorized server APIs only</p></div></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><ShieldCheck className="h-4 w-4 text-emerald-300" /><div><p className="font-semibold text-slate-300">Governed scope</p><p className="text-[11px] text-slate-500">Project authorization and execution controls remain enforced</p></div></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><BrainCircuit className="h-4 w-4 text-violet-300" /><div><p className="font-semibold text-slate-300">AI execution</p><p className="text-[11px] text-slate-500">Organic cells visualize status, not authority</p></div></div>
          </div>
        </div> : <div className="grid h-full place-items-center text-center"><div><Layers3 className="mx-auto h-10 w-10 text-slate-600" /><p className="mt-3 text-sm font-semibold text-slate-400">No domain selected</p></div></div>}
      </aside>
    </div>
  </section>
}
