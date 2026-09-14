import type { MonitoringAgent, MonitoringDataset, MonitoringProject, MonitoringRun } from './job-monitor'

type Props = {
  runs: MonitoringRun[]
  agents: MonitoringAgent[]
  datasets: MonitoringDataset[]
  projects: MonitoringProject[]
}

type DisplayStatus = 'RUNNING' | 'QUEUED' | 'WAITING' | 'FAILED' | 'COMPLETE' | 'NOT_EXECUTED'

const ACTIVE = new Set(['RUNNING', 'CREATED', 'PENDING'])
const COMPLETE = new Set(['SUCCEEDED', 'COMPLETED'])

function statusOf(run: MonitoringRun | undefined): DisplayStatus {
  if (!run) return 'NOT_EXECUTED'
  if (run.status === 'FAILED' || run.status === 'DEAD' || run.status === 'CANCELLED') return 'FAILED'
  if (ACTIVE.has(run.status)) return 'RUNNING'
  if (run.status === 'WAITING') return 'WAITING'
  if (run.status === 'QUEUED') return 'QUEUED'
  if (COMPLETE.has(run.status)) return 'COMPLETE'
  return 'NOT_EXECUTED'
}

function presentation(status: DisplayStatus) {
  if (status === 'RUNNING') return { label: 'Running', dot: 'bg-cyan-300', ring: 'border-cyan-300/50', text: 'text-cyan-100', glow: 'shadow-[0_0_18px_rgba(34,211,238,.28)]' }
  if (status === 'QUEUED') return { label: 'Queued', dot: 'bg-sky-200', ring: 'border-sky-300/40', text: 'text-sky-100', glow: 'shadow-[0_0_14px_rgba(125,211,252,.18)]' }
  if (status === 'WAITING') return { label: 'Waiting', dot: 'bg-amber-300', ring: 'border-amber-300/45', text: 'text-amber-100', glow: 'shadow-[0_0_14px_rgba(251,191,36,.18)]' }
  if (status === 'FAILED') return { label: 'Failed', dot: 'bg-fuchsia-400', ring: 'border-fuchsia-400/45', text: 'text-fuchsia-100', glow: 'shadow-[0_0_14px_rgba(217,70,239,.20)]' }
  if (status === 'COMPLETE') return { label: 'Complete', dot: 'bg-emerald-300', ring: 'border-emerald-300/45', text: 'text-emerald-100', glow: 'shadow-[0_0_14px_rgba(52,211,153,.20)]' }
  return { label: 'Not executed', dot: 'bg-slate-600', ring: 'border-slate-700/70', text: 'text-slate-500', glow: 'shadow-none' }
}

function domainForRun(run: MonitoringRun, datasets: Map<string, MonitoringDataset>) {
  const domain = run.dataset_id ? datasets.get(run.dataset_id)?.business_domain?.trim() : ''
  return domain || 'Unassigned Data Domain'
}

export function ExecutionPathOverview({ runs, agents, datasets: datasetRows, projects: projectRows }: Props) {
  const datasets = new Map(datasetRows.map((dataset) => [dataset.id, dataset]))
  const projects = new Map(projectRows.map((project) => [project.id, project]))
  const grouped = new Map<string, { projectId: string; domainName: string; runs: MonitoringRun[] }>()

  for (const run of runs) {
    const domainName = domainForRun(run, datasets)
    const key = `${run.project_id}::${domainName}`
    const current = grouped.get(key) ?? { projectId: run.project_id, domainName, runs: [] }
    current.runs.push(run)
    grouped.set(key, current)
  }

  const cells = [...grouped.entries()].map(([key, group]) => {
    const latestByAgent = new Map<string, MonitoringRun>()
    for (const run of group.runs) if (!latestByAgent.has(run.agent_definition_id)) latestByAgent.set(run.agent_definition_id, run)
    return {
      key,
      domainName: group.domainName,
      projectName: projects.get(group.projectId)?.name ?? `Scope ${group.projectId.slice(0, 8)}`,
      latestByAgent,
      latestAt: group.runs[0]?.created_at ?? '',
    }
  }).sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())

  if (!cells.length || !agents.length) return null

  return <section className="mb-5 rounded-3xl border border-cyan-300/10 bg-[#061426] p-5 shadow-[0_18px_60px_rgba(0,0,0,.28)]">
    <div className="flex flex-col gap-2 border-b border-white/[0.07] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/55">Execution repertoire</p>
        <h2 className="mt-1 text-lg font-bold text-white">All possible governed agent paths</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Every enabled production agent is shown by default for each recorded Data Domain. Executed paths use their latest persisted state. Paths with no recorded execution remain visible and greyed out; grey does not imply authorization or readiness.</p>
      </div>
      <div className="text-[11px] text-slate-500">{agents.length} enabled agent types</div>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {cells.map((cell) => <article key={cell.key} className="rounded-2xl border border-white/[0.08] bg-[#04111f] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-200/45">Data Domain</p>
            <h3 className="mt-1 truncate font-semibold text-slate-100">{cell.domainName}</h3>
            <p className="mt-0.5 truncate text-[10px] text-slate-600">Scope · {cell.projectName}</p>
          </div>
          <span className="rounded-full border border-slate-700/70 bg-slate-800/35 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Full path</span>
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {agents.map((agent, index) => {
            const run = cell.latestByAgent.get(agent.id)
            const status = statusOf(run)
            const meta = presentation(status)
            return <div key={agent.id} className={`relative rounded-xl border px-3 py-3 ${meta.ring} ${meta.glow} ${status === 'NOT_EXECUTED' ? 'bg-slate-900/30 opacity-65' : 'bg-white/[0.025]'}`}>
              {index < agents.length - 1 ? <span aria-hidden="true" className="pointer-events-none absolute left-[calc(100%+1px)] top-1/2 hidden h-px w-2 -translate-y-1/2 bg-slate-700/60 lg:block" /> : null}
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot} ${status === 'RUNNING' ? 'animate-pulse' : ''}`} />
                <p className={`min-w-0 truncate text-[11px] font-semibold ${status === 'NOT_EXECUTED' ? 'text-slate-500' : 'text-slate-200'}`}>{agent.name}</p>
              </div>
              <p className={`mt-2 text-[9px] font-bold uppercase tracking-wide ${meta.text}`}>{meta.label}</p>
              <p className="mt-0.5 text-[9px] text-slate-600">v{agent.version}</p>
            </div>
          })}
        </div>
      </article>)}
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.07] pt-3 text-[10px] text-slate-500">
      {(['RUNNING','COMPLETE','WAITING','QUEUED','FAILED','NOT_EXECUTED'] as DisplayStatus[]).map((status) => {
        const meta = presentation(status)
        return <span key={status} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${meta.dot}`} />{meta.label}</span>
      })}
      <span className="ml-auto">Not executed remains visible by design</span>
    </div>
  </section>
}
