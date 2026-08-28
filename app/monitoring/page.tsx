import Link from 'next/link'

import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { JobMonitor, type MonitoringAgent, type MonitoringDataset, type MonitoringRun, type MonitoringStep } from './job-monitor'
import { JobTermination } from './job-termination'

export default async function MonitoringPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: runs, error: runsError } = await supabase
    .schema('agent')
    .from('agent_runs')
    .select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message')
    .order('created_at', { ascending: false })
    .limit(50)

  if (runsError) throw new Error(`Unable to load agent runs: ${runsError.message}`)

  const typedRuns = (runs ?? []) as MonitoringRun[]
  const agentIds = [...new Set(typedRuns.map((run) => run.agent_definition_id))]
  const datasetIds = [...new Set(typedRuns.flatMap((run) => run.dataset_id ? [run.dataset_id] : []))]
  const runIds = typedRuns.map((run) => run.id)

  const [agentsResult, datasetsResult, stepsResult] = await Promise.all([
    agentIds.length
      ? supabase.schema('agent').from('agent_definitions').select('id, name, version, agent_key').in('id', agentIds)
      : Promise.resolve({ data: [], error: null }),
    datasetIds.length
      ? supabase.schema('catalog').from('datasets').select('id, name').in('id', datasetIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? supabase.schema('agent').from('agent_run_steps').select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message').in('agent_run_id', runIds).order('step_order')
      : Promise.resolve({ data: [], error: null }),
  ])

  if (agentsResult.error) throw new Error(`Unable to load agent definitions: ${agentsResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (stepsResult.error) throw new Error(`Unable to load agent run steps: ${stepsResult.error.message}`)

  const typedAgents = (agentsResult.data ?? []) as MonitoringAgent[]
  const typedDatasets = (datasetsResult.data ?? []) as MonitoringDataset[]

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm underline">← Back to dashboard</Link>
            <h1 className="mt-3 text-3xl font-semibold">Job Monitor</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Live operational view of authenticated agent jobs, execution steps, failures, completion state, and manual termination.
            </p>
          </div>
          <Link href="/agents" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
            Run an agent
          </Link>
        </div>

        <JobMonitor
          initialRuns={typedRuns}
          initialAgents={typedAgents}
          initialDatasets={typedDatasets}
          initialSteps={(stepsResult.data ?? []) as MonitoringStep[]}
          initialNow={new Date().toISOString()}
          userId={user.id}
        />

        <JobTermination
          initialRuns={typedRuns}
          initialAgents={typedAgents}
          initialDatasets={typedDatasets}
        />
      </div>
    </main>
  )
}
