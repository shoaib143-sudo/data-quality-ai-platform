import Link from 'next/link'

import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { JobMonitor, type MonitoringAgent, type MonitoringDataset, type MonitoringRun, type MonitoringStep } from './job-monitor'
import { JobTermination } from './job-termination'
import { JobLogs } from './job-logs'
import { JobHealth } from './job-health'

export default async function MonitoringPage() {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: runs, error: runsError } = await supabase.schema('agent').from('agent_runs').select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message').order('created_at', { ascending: false }).limit(50)
  if (runsError) throw new Error(`Unable to load agent runs: ${runsError.message}`)
  const typedRuns = (runs ?? []) as MonitoringRun[]
  const agentIds = [...new Set(typedRuns.map((run) => run.agent_definition_id))]
  const datasetIds = [...new Set(typedRuns.flatMap((run) => run.dataset_id ? [run.dataset_id] : []))]
  const runIds = typedRuns.map((run) => run.id)
  const [agentsResult, datasetsResult, stepsResult] = await Promise.all([
    agentIds.length ? supabase.schema('agent').from('agent_definitions').select('id, name, version, agent_key').in('id', agentIds) : Promise.resolve({ data: [], error: null }),
    datasetIds.length ? supabase.schema('catalog').from('datasets').select('id, name').in('id', datasetIds) : Promise.resolve({ data: [], error: null }),
    runIds.length ? supabase.schema('agent').from('agent_run_steps').select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message').in('agent_run_id', runIds).order('step_order') : Promise.resolve({ data: [], error: null }),
  ])
  if (agentsResult.error) throw new Error(`Unable to load agent definitions: ${agentsResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (stepsResult.error) throw new Error(`Unable to load agent run steps: ${stepsResult.error.message}`)
  const typedAgents = (agentsResult.data ?? []) as MonitoringAgent[]
  const typedDatasets = (datasetsResult.data ?? []) as MonitoringDataset[]
  const typedSteps = (stepsResult.data ?? []) as MonitoringStep[]
  return <main className="min-h-screen bg-gradient-to-br from-slate-50 via-background to-blue-50/40 p-5 sm:p-8 dark:from-slate-950 dark:via-background dark:to-blue-950/20"><div className="mx-auto max-w-7xl space-y-8">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/dashboard" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">← Dashboard</Link><div className="mt-3 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-lg text-white shadow-lg">◈</span><div><h1 className="text-3xl font-bold tracking-tight">Job Monitor</h1><p className="mt-1 text-sm text-muted-foreground">Operations center for agent execution health, progress, diagnostics, and lifecycle control.</p></div></div></div><Link href="/agents" className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm transition hover:opacity-90">Run an agent</Link></header>
    <JobHealth runs={typedRuns} steps={typedSteps} />
    <JobMonitor initialRuns={typedRuns} initialAgents={typedAgents} initialDatasets={typedDatasets} initialSteps={typedSteps} initialNow={new Date().toISOString()} userId={user.id} />
    <section id="job-termination" className="scroll-mt-6"><JobTermination initialRuns={typedRuns} initialAgents={typedAgents} initialDatasets={typedDatasets} /></section>
    <section id="job-logs" className="scroll-mt-6"><JobLogs initialRuns={typedRuns} initialAgents={typedAgents} initialDatasets={typedDatasets} /></section>
  </div></main>
}
