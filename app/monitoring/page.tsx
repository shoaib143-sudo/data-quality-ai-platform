import Link from 'next/link'

import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { filterAuthorizedExecutionRuns } from '@/lib/governance/resource-authorization'
import { MONITORING_RUN_WINDOW } from '@/lib/monitoring/run-window'
import { JobMonitor, type MonitoringAgent, type MonitoringDataset, type MonitoringProject, type MonitoringRun, type MonitoringStep } from './job-monitor'
import { JobHealth } from './job-health'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import styles from './organic-domain-cells.module.css'

export default async function MonitoringPage({ searchParams }: { searchParams: Promise<{ run?: string; agent?: string; domain?: string }> }) {
  const user = await requireUser()
  const [{ run: requestedRunId, agent: requestedAgentId, domain: requestedDomainKey }, landing] = await Promise.all([
    searchParams,
    resolveLandingAccess(user.id),
  ])
  const admin = createAdminClient()
  const { data: runs, error: runsError } = await admin
    .schema('agent')
    .from('agent_runs')
    .select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message')
    .order('created_at', { ascending: false })
    .limit(MONITORING_RUN_WINDOW)
  if (runsError) throw new Error(`Unable to load agent runs: ${runsError.message}`)

  const typedRuns = await filterAuthorizedExecutionRuns(user.id, (runs ?? []) as MonitoringRun[])
  const selectedRunId = requestedRunId && typedRuns.some((run) => run.id === requestedRunId) ? requestedRunId : null
  const datasetIds = [...new Set(typedRuns.flatMap((run) => run.dataset_id ? [run.dataset_id] : []))]
  const projectIds = [...new Set(typedRuns.map((run) => run.project_id))]
  const runIds = typedRuns.map((run) => run.id)

  const [agentsResult, datasetsResult, projectsResult, stepsResult] = await Promise.all([
    admin.schema('agent').from('agent_definitions').select('id, name, version, agent_key').eq('enabled', true).order('name'),
    datasetIds.length ? admin.schema('catalog').from('datasets').select('id, project_id, name, business_domain').in('id', datasetIds) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? admin.schema('app').from('projects').select('id, name, description').in('id', projectIds) : Promise.resolve({ data: [], error: null }),
    runIds.length ? admin.schema('agent').from('agent_run_steps').select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message').in('agent_run_id', runIds).order('step_order') : Promise.resolve({ data: [], error: null }),
  ])

  if (agentsResult.error) throw new Error(`Unable to load enabled agent definitions: ${agentsResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (projectsResult.error) throw new Error(`Unable to load data-domain scopes: ${projectsResult.error.message}`)
  if (stepsResult.error) throw new Error(`Unable to load agent run steps: ${stepsResult.error.message}`)

  const typedAgents = (agentsResult.data ?? []) as MonitoringAgent[]
  const typedDatasets = (datasetsResult.data ?? []) as MonitoringDataset[]
  const typedProjects = (projectsResult.data ?? []) as MonitoringProject[]
  const typedSteps = (stepsResult.data ?? []) as MonitoringStep[]

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#020b17] text-slate-100">
    <div className="mx-auto max-w-[1760px] px-4 py-5 sm:px-6 lg:px-8">
      <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Job Monitor" contextLabel="Governed execution observability" homeHref="/home" />
      <header className="mb-5 mt-4 flex flex-col gap-4 border-b border-cyan-400/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-serif text-4xl tracking-[0.08em] text-white">JOB MONITOR</h1>
          <p className="mt-1 text-sm text-slate-400">Living Data Domains · governed DG/AI feature execution</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/recovery" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/5">Execution Recovery</Link>
          <Link href="/agents" className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,.12)] transition hover:bg-cyan-400/15">Run governed feature</Link>
        </div>
      </header>

      <JobHealth runs={typedRuns} steps={typedSteps} />
      <div className={`${styles.monitoringStage} mt-5`}>
        <JobMonitor
          initialRuns={typedRuns}
          initialAgents={typedAgents}
          initialDatasets={typedDatasets}
          initialProjects={typedProjects}
          initialNow={new Date().toISOString()}
          initialRunId={selectedRunId}
          initialAgentId={requestedAgentId ?? null}
          initialDomainKey={requestedDomainKey ?? null}
          userId={user.id}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-[#0b1422] px-5 py-4 text-xs text-slate-500">
        <span>Job Monitor is the domain-level execution surface. Select a domain to drill into feature results, datasets, lineage, impact and governed evidence.</span>
        <Link href="/recovery" className="font-bold text-cyan-200/75 hover:text-cyan-100">Open execution recovery →</Link>
      </div>
    </div>
  </main>
}