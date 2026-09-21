import type { CSSProperties } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  BrainCircuit,
  CircleCheck,
  CirclePause,
  Clock3,
  Database,
  GitBranch,
  Layers3,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { filterAuthorizedExecutionRuns } from '@/lib/governance/resource-authorization'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { GovernedDomainContext } from '../../governed-domain-context'
import type { MonitoringAgent, MonitoringDataset, MonitoringProject, MonitoringRun, MonitoringStep } from '../../job-monitor'
import styles from './domain-neural-topology.module.css'

type FeaturePresentation = {
  label: string
  category: 'DG' | 'AI' | 'DQ' | 'OPS'
  activities: readonly string[]
  description: string
}

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
    description: 'Summarizes scorecards, risk, certification, issues, and control posture.',
  },
  support_agent: {
    label: 'Operations & Recovery',
    category: 'OPS',
    activities: ['Alerts', 'Issues', 'Recovery', 'Support'],
    description: 'Connects operational alerts, issues, recovery history, and lineage for support workflows.',
  },
}

const PALETTES = [
  { edge: '#22d3ee', secondary: '#7c3aed', glow: 'rgba(34,211,238,.34)' },
  { edge: '#34d399', secondary: '#06b6d4', glow: 'rgba(52,211,153,.32)' },
  { edge: '#a78bfa', secondary: '#3b82f6', glow: 'rgba(167,139,250,.34)' },
  { edge: '#f59e0b', secondary: '#f97316', glow: 'rgba(245,158,11,.32)' },
  { edge: '#f472b6', secondary: '#8b5cf6', glow: 'rgba(244,114,182,.32)' },
  { edge: '#60a5fa', secondary: '#22d3ee', glow: 'rgba(96,165,250,.32)' },
] as const

function paletteFor(key: string) {
  let hash = 0
  for (const char of key) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return PALETTES[Math.abs(hash) % PALETTES.length]
}

function featureFor(agent: MonitoringAgent): FeaturePresentation {
  return FEATURE_PRESENTATION[agent.agent_key] ?? {
    label: agent.name.replace(/\s+Agent$/i, ''),
    category: 'AI',
    activities: ['Inspect', 'Analyze', 'Evidence', 'Outcome'],
    description: 'Governed AI capability backed by the registered agent definition.',
  }
}

function domainForRun(run: MonitoringRun, datasets: Map<string, MonitoringDataset>) {
  const domain = run.dataset_id ? datasets.get(run.dataset_id)?.business_domain?.trim() : ''
  return domain || 'Unassigned Data Domain'
}

function normalizedStatus(status: string) {
  if (['FAILED', 'DEAD', 'CANCELLED'].includes(status)) return 'FAILED'
  if (['RUNNING', 'CREATED', 'PENDING'].includes(status)) return 'RUNNING'
  if (status === 'WAITING') return 'WAITING'
  if (status === 'QUEUED') return 'QUEUED'
  if (['SUCCEEDED', 'COMPLETED'].includes(status)) return 'COMPLETE'
  return 'IDLE'
}

function statusTone(status: string) {
  if (status === 'FAILED') return 'border-rose-400/35 bg-rose-400/10 text-rose-200'
  if (status === 'RUNNING') return 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100'
  if (status === 'WAITING') return 'border-amber-300/35 bg-amber-300/10 text-amber-100'
  if (status === 'QUEUED') return 'border-sky-300/35 bg-sky-300/10 text-sky-100'
  if (status === 'COMPLETE') return 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100'
  return 'border-slate-600/50 bg-slate-800/40 text-slate-400'
}

function statusColor(status: string) {
  if (status === 'FAILED') return '#fb7185'
  if (status === 'RUNNING') return '#22d3ee'
  if (status === 'WAITING' || status === 'QUEUED') return '#fbbf24'
  if (status === 'COMPLETE') return '#34d399'
  return '#64748b'
}

function statusClass(status: string) {
  if (status === 'FAILED') return styles.statusFailed
  if (status === 'RUNNING') return styles.statusRunning
  if (status === 'WAITING' || status === 'QUEUED') return styles.statusWaiting
  if (status === 'COMPLETE') return styles.statusComplete
  return styles.statusIdle
}

function stepProgress(steps: MonitoringStep[]) {
  if (!steps.length) return 0
  const complete = steps.filter((step) => ['SUCCEEDED', 'COMPLETED'].includes(step.status)).length
  return Math.round((complete / steps.length) * 100)
}

function featurePosition(index: number, total: number) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
  const radiusX = total > 7 ? 35 : 33
  const radiusY = total > 7 ? 36 : 34
  return {
    left: 50 + Math.cos(angle) * radiusX,
    top: 50 + Math.sin(angle) * radiusY,
  }
}

function durationLabel(run: MonitoringRun | null) {
  if (!run?.started_at || !run.completed_at) return 'Not recorded'
  const ms = Math.max(0, new Date(run.completed_at).getTime() - new Date(run.started_at).getTime())
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`
}

export default async function DomainDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ domain?: string; feature?: string }>
}) {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const canAgents = canAccessWorkspace(landing.persona, 'agents', landing.organizationRole)
  const { projectId } = await params
  const { domain: requestedDomain, feature: requestedFeatureId } = await searchParams
  const domainName = requestedDomain?.trim() || 'Unassigned Data Domain'
  const supabase = await createClient()

  const { data: rawRuns, error: runsError } = await supabase
    .schema('agent')
    .from('agent_runs')
    .select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(250)
  if (runsError) throw new Error(`Unable to load domain executions: ${runsError.message}`)

  const authorizedRuns = await filterAuthorizedExecutionRuns(user.id, (rawRuns ?? []) as MonitoringRun[])
  if (!authorizedRuns.length) notFound()

  const datasetIds = [...new Set(authorizedRuns.flatMap((run) => run.dataset_id ? [run.dataset_id] : []))]
  const runIds = authorizedRuns.map((run) => run.id)

  const [agentsResult, datasetsResult, projectResult, stepsResult] = await Promise.all([
    supabase.schema('agent').from('agent_definitions').select('id, name, version, agent_key').eq('enabled', true).order('name'),
    datasetIds.length
      ? supabase.schema('catalog').from('datasets').select('id, name, business_domain').in('id', datasetIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.schema('app').from('projects').select('id, name, description').eq('id', projectId).maybeSingle(),
    runIds.length
      ? supabase.schema('agent').from('agent_run_steps').select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message').in('agent_run_id', runIds).order('step_order')
      : Promise.resolve({ data: [], error: null }),
  ])

  if (agentsResult.error) throw new Error(`Unable to load feature registry: ${agentsResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load domain datasets: ${datasetsResult.error.message}`)
  if (projectResult.error) throw new Error(`Unable to load governed scope: ${projectResult.error.message}`)
  if (stepsResult.error) throw new Error(`Unable to load execution steps: ${stepsResult.error.message}`)

  const agents = (agentsResult.data ?? []) as MonitoringAgent[]
  const datasets = (datasetsResult.data ?? []) as MonitoringDataset[]
  const project = (projectResult.data ?? { id: projectId, name: `Scope ${projectId.slice(0, 8)}`, description: null }) as MonitoringProject
  const steps = (stepsResult.data ?? []) as MonitoringStep[]
  const datasetMap = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  const domainRuns = authorizedRuns.filter((run) => domainForRun(run, datasetMap) === domainName)
  if (!domainRuns.length) notFound()

  const stepsByRun = new Map<string, MonitoringStep[]>()
  for (const step of steps) stepsByRun.set(step.agent_run_id, [...(stepsByRun.get(step.agent_run_id) ?? []), step])

  const latestByAgent = new Map<string, MonitoringRun>()
  for (const run of domainRuns) if (!latestByAgent.has(run.agent_definition_id)) latestByAgent.set(run.agent_definition_id, run)

  const featureAgents = agents.filter((agent) => agent.agent_key !== 'native_supervisor_agent')
  const features = featureAgents.map((agent) => {
    const run = latestByAgent.get(agent.id) ?? null
    const status = run ? normalizedStatus(run.status) : 'NOT_EXECUTED'
    return {
      agent,
      feature: featureFor(agent),
      run,
      status,
      progress: run ? stepProgress(stepsByRun.get(run.id) ?? []) : 0,
      dataset: run?.dataset_id ? datasetMap.get(run.dataset_id) ?? null : null,
    }
  })

  const completeCount = features.filter((item) => item.status === 'COMPLETE').length
  const runningCount = features.filter((item) => item.status === 'RUNNING').length
  const waitingCount = features.filter((item) => ['WAITING', 'QUEUED'].includes(item.status)).length
  const failedCount = features.filter((item) => item.status === 'FAILED').length
  const notExecutedCount = features.filter((item) => item.status === 'NOT_EXECUTED').length
  const overallProgress = features.length ? Math.round((completeCount / features.length) * 100) : 0
  const domainDatasets = [...new Map(domainRuns.flatMap((run) => {
    if (!run.dataset_id) return []
    const dataset = datasetMap.get(run.dataset_id)
    return dataset ? [[run.dataset_id, dataset] as const] : []
  })).values()]
  const latestRun = domainRuns[0] ?? null
  const selectedFeature = requestedFeatureId ? features.find((item) => item.agent.id === requestedFeatureId) ?? null : null
  const palette = paletteFor(`${projectId}::${domainName}`)
  const domainState = failedCount ? 'FAILED' : runningCount ? 'RUNNING' : waitingCount ? 'WAITING' : completeCount ? 'COMPLETE' : 'IDLE'
  const latestAt = latestRun ? new Date(latestRun.created_at).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) : 'No recorded execution'
  const topologyStyle = {
    '--neural-edge': palette.edge,
    '--neural-secondary': palette.secondary,
    '--neural-glow': palette.glow,
  } as CSSProperties

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#020b17] text-slate-100">
    <div className="mx-auto max-w-[1760px] px-4 py-5 sm:px-6 lg:px-8">
      <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Domain Monitoring" contextLabel={domainName} homeHref="/home" />
      <div className="mb-5 mt-4 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/monitoring" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200/70 hover:text-cyan-100"><ArrowLeft className="h-4 w-4" />Back to Job Monitor</Link>
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/55">Data Domain drilldown</p>
          <h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">{domainName}</h1>
          <p className="mt-1 text-sm text-slate-500">{project.name} · governed feature execution, datasets, lineage and evidence</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAgents ? <Link href="/agents" className="rounded-xl border border-cyan-300/35 bg-cyan-300/8 px-4 py-2.5 text-sm font-bold text-cyan-100 hover:bg-cyan-300/12">Run governed feature</Link> : null}
          {canAgents && latestRun ? <Link href={`/agents/runs/${encodeURIComponent(latestRun.id)}`} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/[0.06]">Latest output/results</Link> : null}
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_290px]">
        <aside className={`${styles.neuralPanel} rounded-3xl p-5`}>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">Domain completion</p>
          <div className="mt-3 text-5xl font-black text-white">{overallProgress}%</div>
          <p className="mt-1 text-xs text-slate-500">{completeCount} of {features.length} features complete</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-950 ring-1 ring-white/10"><div className="h-full rounded-full" style={{ width: `${overallProgress}%`, background: `linear-gradient(90deg, ${palette.edge}, ${palette.secondary})`, boxShadow: `0 0 16px ${palette.edge}` }} /></div>

          <div className="mt-5 space-y-2 text-sm">
            {[
              ['Total features', features.length, 'text-cyan-200'],
              ['Completed', completeCount, 'text-emerald-300'],
              ['Running', runningCount, 'text-cyan-300'],
              ['Waiting', waitingCount, 'text-amber-300'],
              ['Failed', failedCount, 'text-rose-300'],
              ['Not executed', notExecutedCount, 'text-slate-400'],
              ['Datasets', domainDatasets.length, 'text-violet-300'],
            ].map(([label, value, tone]) => <div key={String(label)} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5"><span className="text-slate-500">{label}</span><span className={`font-black ${tone}`}>{value}</span></div>)}
          </div>

          <div className="mt-5 border-t border-white/10 pt-4 text-xs text-slate-500">
            <p>Last execution</p>
            <p className="mt-1 font-semibold text-slate-300">{latestAt}</p>
            <p className="mt-4">Latest runtime</p>
            <p className="mt-1 font-semibold text-slate-300">{durationLabel(latestRun)}</p>
          </div>
        </aside>

        <div className={styles.heroNetwork} style={topologyStyle}>
          <svg aria-hidden="true" className={styles.connectionLayer} viewBox="0 0 100 100" preserveAspectRatio="none">
            {features.map((item, index) => {
              const position = featurePosition(index, features.length)
              return <line key={item.agent.id} x1="50" y1="50" x2={position.left} y2={position.top} stroke={statusColor(item.status)} strokeWidth={item.status === 'NOT_EXECUTED' ? '.18' : '.35'} opacity={item.status === 'NOT_EXECUTED' ? '.28' : '.9'} />
            })}
          </svg>

          <div className={styles.centerCell}>
            <div>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-cyan-200/35 bg-[#061426] shadow-[0_0_28px_rgba(34,211,238,.28)]"><BrainCircuit className="h-9 w-9 text-cyan-100" /></div>
              <p className="mt-3 text-lg font-black text-white">Supervisor /<br />Orchestrator</p>
              <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${statusTone(domainState)}`}>{domainState}</span>
            </div>
          </div>

          {features.map((item, index) => {
            const position = featurePosition(index, features.length)
            const Icon = item.status === 'COMPLETE' ? CircleCheck : item.status === 'FAILED' ? TriangleAlert : item.status === 'RUNNING' ? Sparkles : item.status === 'WAITING' || item.status === 'QUEUED' ? CirclePause : Layers3
            const cellStyle = { left: `${position.left}%`, top: `${position.top}%` } as CSSProperties
            const body = <div className={`${styles.featureCell} ${statusClass(item.status)} ${selectedFeature?.agent.id === item.agent.id ? 'ring-2 ring-white/70' : ''}`} style={cellStyle}>
              <Icon className="h-5 w-5 text-current" />
              <p className="mt-2 text-[11px] font-black leading-tight text-white">{item.feature.label}</p>
              <p className="mt-1 text-[8px] leading-tight text-slate-400">{item.feature.activities.slice(0, 2).join(' · ')}</p>
            </div>
            return item.run && canAgents
              ? <Link key={item.agent.id} href={`/agents/runs/${encodeURIComponent(item.run.id)}`} aria-label={`Open ${item.feature.label} results`}>{body}</Link>
              : <div key={item.agent.id}>{body}</div>
          })}

          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-wrap justify-center gap-3 rounded-full border border-white/10 bg-[#020b17]/80 px-4 py-2 text-[9px] font-bold text-slate-400 backdrop-blur">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-300" />Completed</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-300" />Running</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-300" />Waiting</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-300" />Failed</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" />Not executed</span>
          </div>
        </div>

        <aside className={`${styles.neuralPanel} rounded-3xl p-5`}>
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-300" /><h2 className="font-black text-white">Domain information</h2></div>
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-2"><span className="text-slate-500">Governed scope</span><span className="text-right font-semibold text-slate-300">{project.name}</span></div>
            <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-2"><span className="text-slate-500">Domain</span><span className="text-right font-semibold text-slate-300">{domainName}</span></div>
            <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-2"><span className="text-slate-500">Status</span><span className={`rounded-full border px-2 py-0.5 font-black ${statusTone(domainState)}`}>{domainState}</span></div>
            <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-2"><span className="text-slate-500">Datasets</span><span className="font-semibold text-slate-300">{domainDatasets.length}</span></div>
            <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-2"><span className="text-slate-500">Recorded jobs</span><span className="font-semibold text-slate-300">{domainRuns.length}</span></div>
            <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-2"><span className="text-slate-500">Latest run</span><span className="max-w-[140px] truncate font-mono text-[10px] text-cyan-200">{latestRun?.id ?? 'None'}</span></div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/55">Execution context</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">This view is derived from authorized persisted execution, catalog, governance, lineage, and evidence state for this Data Domain.</p>
            {canAgents && latestRun ? <Link href={`/agents/runs/${encodeURIComponent(latestRun.id)}`} className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-300/8 px-3 py-2.5 text-xs font-black text-cyan-100 hover:bg-cyan-300/12">View latest execution details</Link> : null}
          </div>
        </aside>
      </section>

      <section className={`${styles.neuralPanel} mt-6 rounded-3xl p-5 sm:p-6`}>
        <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">DG / AI feature breakdown</p><h2 className="mt-1 text-xl font-black text-white">Feature execution and outcomes</h2><p className="mt-1 text-xs text-slate-500">Each feature stays tied to governed agents, recorded steps, durable outputs, and evidence.</p></div>
          <span className="text-xs text-slate-500">{completeCount}/{features.length} completed</span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {features.map(({ agent, feature, run, status, progress, dataset }) => {
            const Icon = status === 'COMPLETE' ? CircleCheck : status === 'FAILED' ? TriangleAlert : status === 'RUNNING' ? Sparkles : status === 'WAITING' || status === 'QUEUED' ? Clock3 : Layers3
            const body = <div className={`h-full rounded-2xl border p-4 transition ${run ? statusTone(status) : 'border-slate-800 bg-slate-950/45 text-slate-500'} ${selectedFeature?.agent.id === agent.id ? 'ring-2 ring-cyan-200/60' : ''}`}>
              <div className="flex items-start justify-between gap-3"><div><span className="rounded-full border border-current/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide opacity-75">{feature.category}</span><h3 className="mt-2 font-black">{feature.label}</h3></div><Icon className="h-5 w-5 shrink-0" /></div>
              <p className="mt-2 text-xs leading-5 opacity-70">{feature.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{feature.activities.map((activity) => <span key={activity} className="rounded-full border border-current/15 bg-black/15 px-2 py-1 text-[9px] font-bold opacity-75">{activity}</span>)}</div>
              <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide"><span>{run ? status : 'Not executed'}</span><span>{run ? `${progress}% steps` : 'No run'}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-current transition-[width]" style={{ width: `${run ? progress : 0}%` }} /></div>
              {dataset ? <p className="mt-3 truncate text-[10px] opacity-60">Dataset: {dataset.name}</p> : null}
              {run ? <p className="mt-3 text-right text-[10px] font-bold text-cyan-100/75">View results →</p> : null}
            </div>
            return run && canAgents ? <Link key={agent.id} href={`/agents/runs/${encodeURIComponent(run.id)}`} className="block min-h-[220px]">{body}</Link> : <div key={agent.id} className="min-h-[220px]">{body}</div>
          })}
        </div>
      </section>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,.9fr)]">
        <section className={`${styles.neuralPanel} rounded-3xl p-5 sm:p-6`}>
          <div className="flex items-end justify-between gap-3 border-b border-white/10 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">Recent executions</p><h2 className="mt-1 text-xl font-black text-white">Domain jobs</h2></div><span className="text-xs text-slate-500">{domainRuns.length} recorded</span></div>
          <div className="mt-4 max-h-[560px] space-y-2 overflow-auto pr-1">
            {domainRuns.slice(0, 30).map((run) => {
              const agent = agents.find((item) => item.id === run.agent_definition_id)
              const feature = agent ? featureFor(agent) : null
              const dataset = run.dataset_id ? datasetMap.get(run.dataset_id) : null
              const state = normalizedStatus(run.status)
              return canAgents ? <Link key={run.id} href={`/agents/runs/${encodeURIComponent(run.id)}`} className="block rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-200">{feature?.label ?? 'Governed execution'}</p><p className="mt-1 truncate text-[11px] text-slate-500">{dataset?.name ?? 'No dataset'} · {new Date(run.created_at).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusTone(state)}`}>{state}</span></div>
              </Link> : <div key={run.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-200">{feature?.label ?? 'Governed execution'}</p><p className="mt-1 truncate text-[11px] text-slate-500">{dataset?.name ?? 'No dataset'} · {new Date(run.created_at).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusTone(state)}`}>{state}</span></div></div>
            })}
          </div>
        </section>

        <section className={`${styles.neuralPanel} rounded-3xl p-5 sm:p-6`}>
          <div className="flex items-end justify-between gap-3 border-b border-white/10 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">Governed assets</p><h2 className="mt-1 text-xl font-black text-white">Datasets in this domain</h2></div><Database className="h-5 w-5 text-cyan-300" /></div>
          <div className="mt-4 space-y-2">
            {domainDatasets.length ? domainDatasets.map((dataset) => {
              const runs = domainRuns.filter((run) => run.dataset_id === dataset.id)
              const latest = runs[0] ?? null
              return <div key={dataset.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-200">{dataset.name}</p><p className="mt-1 text-[11px] text-slate-500">{runs.length} recorded execution(s) · {dataset.business_domain || 'Unassigned Data Domain'}</p></div>{canAgents && latest ? <Link href={`/agents/runs/${encodeURIComponent(latest.id)}`} className="text-xs font-bold text-cyan-200 hover:text-cyan-100">Latest result →</Link> : null}</div></div>
            }) : <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">No dataset has a recorded execution in this domain yet.</div>}
          </div>
        </section>
      </div>

      <section className={`${styles.neuralPanel} mt-6 rounded-3xl p-5 sm:p-6`}>
        <div className="flex items-end justify-between gap-3 border-b border-white/10 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">Relationships and evidence</p><h2 className="mt-1 text-xl font-black text-white">Lineage, impact, governance and execution evidence</h2></div><GitBranch className="h-5 w-5 text-violet-300" /></div>
        {latestRun ? <div className="mt-4"><GovernedDomainContext projectId={projectId} runId={latestRun.id} datasetId={latestRun.dataset_id} domainName={domainName} /></div> : <p className="mt-4 text-sm text-slate-500">No recorded execution is available for governed context.</p>}
      </section>
    </div>
  </main>
}