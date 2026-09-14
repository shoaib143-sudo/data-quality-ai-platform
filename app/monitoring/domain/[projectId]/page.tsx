import Link from 'next/link'
import { ArrowLeft, BrainCircuit, CircleCheck, CirclePause, Database, GitBranch, Layers3, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { filterAuthorizedExecutionRuns } from '@/lib/governance/resource-authorization'
import { GovernedDomainContext } from '../../governed-domain-context'
import type { MonitoringAgent, MonitoringDataset, MonitoringProject, MonitoringRun, MonitoringStep } from '../../job-monitor'

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
  { edge: '#22d3ee', secondary: '#3b82f6', glow: 'rgba(34,211,238,.28)' },
  { edge: '#34d399', secondary: '#10b981', glow: 'rgba(52,211,153,.28)' },
  { edge: '#a78bfa', secondary: '#7c3aed', glow: 'rgba(167,139,250,.28)' },
  { edge: '#f59e0b', secondary: '#f97316', glow: 'rgba(245,158,11,.28)' },
  { edge: '#f472b6', secondary: '#d946ef', glow: 'rgba(244,114,182,.28)' },
  { edge: '#60a5fa', secondary: '#06b6d4', glow: 'rgba(96,165,250,.28)' },
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

function stepProgress(steps: MonitoringStep[]) {
  if (!steps.length) return 0
  const complete = steps.filter((step) => ['SUCCEEDED', 'COMPLETED'].includes(step.status)).length
  return Math.round((complete / steps.length) * 100)
}

export default async function DomainDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ domain?: string; feature?: string }>
}) {
  const user = await requireUser()
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
  const overallProgress = features.length ? Math.round((completeCount / features.length) * 100) : 0
  const domainDatasets = [...new Map(domainRuns.flatMap((run) => {
    if (!run.dataset_id) return []
    const dataset = datasetMap.get(run.dataset_id)
    return dataset ? [[run.dataset_id, dataset] as const] : []
  })).values()]
  const latestRun = domainRuns[0] ?? null
  const selectedFeature = requestedFeatureId ? features.find((item) => item.agent.id === requestedFeatureId) ?? null : null
  const palette = paletteFor(`${projectId}::${domainName}`)

  return <main className="min-h-screen bg-[#020b17] text-slate-100">
    <div className="mx-auto max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/monitoring" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200/70 hover:text-cyan-100"><ArrowLeft className="h-4 w-4" />Back to Job Monitor</Link>
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/55">Data Domain drilldown</p>
          <h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">{domainName}</h1>
          <p className="mt-1 text-sm text-slate-500">{project.name} · governed execution and evidence detail</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/agents" className="rounded-xl border border-cyan-300/35 bg-cyan-300/8 px-4 py-2.5 text-sm font-bold text-cyan-100 hover:bg-cyan-300/12">Run governed feature</Link>
          {latestRun ? <Link href={`/agents/runs/${encodeURIComponent(latestRun.id)}`} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/[0.06]">Latest output/results</Link> : null}
        </div>
      </div>

      <section className="relative overflow-hidden rounded-3xl border p-6 sm:p-8" style={{
        borderColor: palette.edge,
        background: `radial-gradient(circle at 16% 12%, ${palette.glow}, transparent 28%), radial-gradient(circle at 84% 70%, ${palette.secondary}33, transparent 34%), linear-gradient(145deg, #061526, #020b17)`,
        boxShadow: `0 0 8px ${palette.edge}, 0 0 46px ${palette.glow}, inset 0 0 70px ${palette.glow}`,
      }}>
        <div className="relative z-10 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-[44%_56%_52%_48%/47%_46%_54%_53%] border bg-black/25 p-7 text-center backdrop-blur" style={{ borderColor: palette.edge, boxShadow: `0 0 32px ${palette.glow}, inset 0 0 44px ${palette.glow}` }}>
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-full border border-cyan-200/30 bg-[#051421] shadow-[0_0_35px_rgba(34,211,238,.3)]">
              <BrainCircuit className="h-11 w-11 text-cyan-200" />
            </div>
            <h2 className="mt-4 text-xl font-black text-white">Supervisor / Orchestrator</h2>
            <p className="mt-1 text-xs text-cyan-100/65">Coordinates · Monitors · Routes · Evidences</p>
            <div className="mt-5 text-4xl font-black text-white">{overallProgress}%</div>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Domain feature completion</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10"><div className="h-full rounded-full" style={{ width: `${overallProgress}%`, background: `linear-gradient(90deg, ${palette.edge}, ${palette.secondary})`, boxShadow: `0 0 16px ${palette.edge}` }} /></div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {[
                ['Features', features.length, 'text-cyan-200'],
                ['Complete', completeCount, 'text-emerald-300'],
                ['Running', runningCount, 'text-cyan-300'],
                ['Waiting', waitingCount, 'text-amber-300'],
                ['Failed', failedCount, 'text-rose-300'],
                ['Datasets', domainDatasets.length, 'text-violet-300'],
              ].map(([label, value, tone]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className={`text-2xl font-black ${tone}`}>{value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              </div>)}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" /><div><p className="font-bold text-slate-200">Governed domain scope</p><p className="mt-1 text-xs leading-5 text-slate-500">{project.description || 'This view is derived from authorized persisted execution, catalog, governance, lineage, and evidence state for the selected Data Domain.'}</p></div></div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(380px,.6fr)]">
        <section className="rounded-3xl border border-white/10 bg-[#061426] p-5 sm:p-6">
          <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">DG / AI feature network</p><h2 className="mt-1 text-xl font-black text-white">What this domain can do</h2><p className="mt-1 text-xs text-slate-500">Completed and active capabilities are illuminated from durable execution state. Never-executed capabilities remain grey.</p></div>
            <span className="text-xs text-slate-500">{completeCount}/{features.length} completed</span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {features.map(({ agent, feature, run, status, progress, dataset }) => {
              const executed = Boolean(run)
              const selected = selectedFeature?.agent.id === agent.id
              const Icon = status === 'COMPLETE' ? CircleCheck : status === 'FAILED' ? TriangleAlert : status === 'RUNNING' ? Sparkles : status === 'WAITING' || status === 'QUEUED' ? CirclePause : Layers3
              const body = <div className={`h-full rounded-2xl border p-4 transition ${executed ? statusTone(status) : 'border-slate-800 bg-slate-950/45 text-slate-500'} ${selected ? 'ring-2 ring-cyan-200/60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><span className="rounded-full border border-current/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide opacity-75">{feature.category}</span><h3 className="mt-2 font-black">{feature.label}</h3></div>
                  <Icon className="h-5 w-5 shrink-0" />
                </div>
                <p className="mt-2 text-xs leading-5 opacity-70">{feature.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{feature.activities.map((activity) => <span key={activity} className="rounded-full border border-current/15 bg-black/15 px-2 py-1 text-[9px] font-bold opacity-75">{activity}</span>)}</div>
                <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide"><span>{executed ? status : 'Not executed'}</span><span>{executed ? `${progress}% steps` : 'No run'}</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-current transition-[width]" style={{ width: `${executed ? progress : 0}%` }} /></div>
                {dataset ? <p className="mt-3 truncate text-[10px] opacity-60">Dataset: {dataset.name}</p> : null}
              </div>
              return run
                ? <Link key={agent.id} href={`/agents/runs/${encodeURIComponent(run.id)}`} className="block min-h-[220px]">{body}</Link>
                : <div key={agent.id} className="min-h-[220px]">{body}</div>
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#061426] p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3 border-b border-white/10 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">Recent executions</p><h2 className="mt-1 text-xl font-black text-white">Domain jobs</h2></div><span className="text-xs text-slate-500">{domainRuns.length} recorded</span></div>
          <div className="mt-4 max-h-[670px] space-y-2 overflow-auto pr-1">
            {domainRuns.slice(0, 30).map((run) => {
              const agent = agents.find((item) => item.id === run.agent_definition_id)
              const feature = agent ? featureFor(agent) : null
              const dataset = run.dataset_id ? datasetMap.get(run.dataset_id) : null
              const state = normalizedStatus(run.status)
              return <Link key={run.id} href={`/agents/runs/${encodeURIComponent(run.id)}`} className="block rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-200">{feature?.label ?? 'Governed execution'}</p><p className="mt-1 truncate text-[11px] text-slate-500">{dataset?.name ?? 'No dataset'} · {new Date(run.created_at).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusTone(state)}`}>{state}</span></div>
              </Link>
            })}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-[#061426] p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3 border-b border-white/10 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">Governed assets</p><h2 className="mt-1 text-xl font-black text-white">Datasets in this domain</h2></div><Database className="h-5 w-5 text-cyan-300" /></div>
          <div className="mt-4 space-y-2">
            {domainDatasets.map((dataset) => {
              const runs = domainRuns.filter((run) => run.dataset_id === dataset.id)
              const latest = runs[0] ?? null
              return <div key={dataset.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-200">{dataset.name}</p><p className="mt-1 text-[11px] text-slate-500">{runs.length} recorded execution(s) · {dataset.business_domain || 'Unassigned Data Domain'}</p></div>{latest ? <Link href={`/agents/runs/${encodeURIComponent(latest.id)}`} className="text-xs font-bold text-cyan-200 hover:text-cyan-100">Latest result →</Link> : null}</div>
              </div>
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#061426] p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3 border-b border-white/10 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/55">Relationships and evidence</p><h2 className="mt-1 text-xl font-black text-white">Lineage, impact, governance</h2></div><GitBranch className="h-5 w-5 text-violet-300" /></div>
          {latestRun ? <GovernedDomainContext projectId={projectId} runId={latestRun.id} datasetId={latestRun.dataset_id} domainName={domainName} /> : <p className="mt-4 text-sm text-slate-500">No recorded execution is available for governed context.</p>}
        </section>
      </div>
    </div>
  </main>
}
