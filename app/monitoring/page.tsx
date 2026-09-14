import Link from 'next/link'

import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { JobMonitor, type MonitoringAgent, type MonitoringDataset, type MonitoringProject, type MonitoringRun, type MonitoringStep } from './job-monitor'
import { JobTermination } from './job-termination'
import { JobLogs } from './job-logs'
import { JobHealth } from './job-health'
import styles from './organic-domain-cells.module.css'

export default async function MonitoringPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const user = await requireUser()
  const { run: requestedRunId } = await searchParams
  const supabase = await createClient()
  const { data: runs, error: runsError } = await supabase.schema('agent').from('agent_runs').select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message').order('created_at', { ascending: false }).limit(50)
  if (runsError) throw new Error(`Unable to load agent runs: ${runsError.message}`)

  const typedRuns = (runs ?? []) as MonitoringRun[]
  const selectedRunId = requestedRunId && typedRuns.some((run) => run.id === requestedRunId) ? requestedRunId : null
  const datasetIds = [...new Set(typedRuns.flatMap((run) => run.dataset_id ? [run.dataset_id] : []))]
  const projectIds = [...new Set(typedRuns.map((run) => run.project_id))]
  const runIds = typedRuns.map((run) => run.id)

  const [agentsResult, datasetsResult, projectsResult, stepsResult] = await Promise.all([
    supabase.schema('agent').from('agent_definitions').select('id, name, version, agent_key').eq('enabled', true).order('name'),
    datasetIds.length ? supabase.schema('catalog').from('datasets').select('id, name, business_domain').in('id', datasetIds) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.schema('app').from('projects').select('id, name, description').in('id', projectIds) : Promise.resolve({ data: [], error: null }),
    runIds.length ? supabase.schema('agent').from('agent_run_steps').select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message').in('agent_run_id', runIds).order('step_order') : Promise.resolve({ data: [], error: null }),
  ])

  if (agentsResult.error) throw new Error(`Unable to load enabled agent definitions: ${agentsResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (projectsResult.error) throw new Error(`Unable to load data-domain scopes: ${projectsResult.error.message}`)
  if (stepsResult.error) throw new Error(`Unable to load agent run steps: ${stepsResult.error.message}`)

  const typedAgents = (agentsResult.data ?? []) as MonitoringAgent[]
  const typedDatasets = (datasetsResult.data ?? []) as MonitoringDataset[]
  const typedProjects = (projectsResult.data ?? []) as MonitoringProject[]
  const typedSteps = (stepsResult.data ?? []) as MonitoringStep[]

  return <main className="min-h-screen bg-[#04101f] text-slate-100">
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-4 border-b border-cyan-400/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/home" className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/70 transition hover:text-cyan-200">DataNexus AI</Link>
          <h1 className="mt-2 font-serif text-4xl tracking-[0.08em] text-white">JOB MONITOR</h1>
          <p className="mt-1 text-sm text-slate-400">Domain Cells · live governed execution topology</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/recovery" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/5">Execution Recovery</Link>
          <Link href="/agents" className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,.12)] transition hover:bg-cyan-400/15">Run an agent</Link>
        </div>
      </header>

      <JobHealth runs={typedRuns} steps={typedSteps} />
      <div className={`${styles.monitoringStage} mt-5`}>
        <JobMonitor initialRuns={typedRuns} initialAgents={typedAgents} initialDatasets={typedDatasets} initialProjects={typedProjects} initialSteps={typedSteps} initialNow={new Date().toISOString()} initialRunId={selectedRunId} userId={user.id} />
      </div>

      <section id="job-termination" className="mt-7 scroll-mt-6"><JobTermination initialRuns={typedRuns} initialAgents={typedAgents} initialDatasets={typedDatasets} /></section>
      <section id="job-logs" className="mt-7 scroll-mt-6"><JobLogs initialRuns={typedRuns} initialAgents={typedAgents} initialDatasets={typedDatasets} initialRunId={selectedRunId} /></section>
    </div>
  </main>
}