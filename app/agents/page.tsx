import Link from 'next/link'
import { Activity, Bot, CheckCircle2, Sparkles, Wrench } from 'lucide-react'

import { RunAgentForm, type AgentOption, type DatasetVersionOption, type ProjectOption } from './run-agent-form'
import { canonicalRoutes } from '@/lib/platform/canonical-routes'
import { requireUser } from '@/lib/supabase/auth'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { isDataGovernanceSuperAdmin } from '@/lib/auth/data-governance-super-admin'
import { loadPositiveLearningCaseAdminInbox } from '@/lib/agents/proactive-governed-case-learning-admin'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { resolveConversationPolicy } from '@/lib/governance/conversation-policy'
import { canViewDatasetResource, filterAuthorizedExecutionRuns } from '@/lib/governance/resource-authorization'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { createClient } from '@/lib/supabase/server'

type AgentDefinition = AgentOption & {
  agent_key: string
  description: string | null
  enabled: boolean
  created_at: string
}

type ToolDefinition = {
  id: string
  agent_definition_id: string
  tool_key: string
  name: string
  description: string | null
  version: string
  enabled: boolean
}

type DatasetRow = {
  id: string
  project_id: string
  name: string
}

type DatasetVersionRow = {
  id: string
  dataset_id: string
  version_number: number
}

type AgentRun = {
  id: string
  agent_definition_id: string
  project_id: string
  dataset_id: string | null
  dataset_version_id: string | null
  status: string
  created_at: string
  completed_at: string | null
  error_code: string | null
}

export default async function AgentsPage() {
  const user = await requireUser()
  const accessContext = await resolveLandingAccess(user.id)
  const conversationDefaults = await resolveConversationPolicy({
    organizationId: accessContext.organizationId,
    userId: user.id,
    persona: accessContext.persona,
  })
  const supabase = await createClient()
  const governanceSuperAdmin = await isDataGovernanceSuperAdmin(user.id)
  const canMonitoring = canAccessWorkspace(accessContext.persona, 'monitoring', accessContext.organizationRole)
  const pendingLearningCases = governanceSuperAdmin
    ? (await loadPositiveLearningCaseAdminInbox(user.id)).length
    : 0

  const [agentsResult, projectsResult, datasetsResult, versionsResult, runsResult] = await Promise.all([
    supabase.schema('agent').from('agent_definitions')
      .select('id, agent_key, name, description, version, enabled, created_at')
      .eq('enabled', true).order('agent_key').order('version', { ascending: false }),
    supabase.schema('app').from('projects').select('id, name').order('name'),
    supabase.schema('catalog').from('datasets').select('id, project_id, name').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id, dataset_id, version_number').order('version_number', { ascending: false }),
    supabase.schema('agent').from('agent_runs')
      .select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, completed_at, error_code')
      .order('created_at', { ascending: false }).limit(10),
  ])

  const agentsError = agentsResult.error
  const enabledAgents = (agentsResult.data ?? []) as AgentDefinition[]
  const projects = (projectsResult.data ?? []) as ProjectOption[]
  const candidateDatasets = (datasetsResult.data ?? []) as DatasetRow[]
  const datasetVisibility = await Promise.all(candidateDatasets.map(async dataset => ({
    dataset,
    allowed: await canViewDatasetResource(user.id, dataset.id),
  })))
  const datasets = datasetVisibility.filter(item => item.allowed).map(item => item.dataset)
  const visibleDatasetIds = new Set(datasets.map(dataset => dataset.id))
  const versions = ((versionsResult.data ?? []) as DatasetVersionRow[]).filter(version => visibleDatasetIds.has(version.dataset_id))
  const runs = await filterAuthorizedExecutionRuns(user.id, (runsResult.data ?? []) as AgentRun[])

  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load dataset versions: ${versionsResult.error.message}`)
  if (runsResult.error) throw new Error(`Unable to load agent runs: ${runsResult.error.message}`)

  const datasetsById = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  const versionsById = new Map(versions.map((version) => [version.id, version]))
  const agentsById = new Map(enabledAgents.map((agent) => [agent.id, agent]))

  const datasetVersions: DatasetVersionOption[] = versions.flatMap((version) => {
    const dataset = datasetsById.get(version.dataset_id)
    if (!dataset) return []
    return [{
      id: version.id,
      datasetId: dataset.id,
      projectId: dataset.project_id,
      datasetName: dataset.name,
      versionNumber: version.version_number,
    }]
  })

  const [
    agentExecuteProjectIds,
    profilingExecuteProjectIds,
    qualityExecuteProjectIds,
    conversationalProjectIds,
    requestableProjectIds,
  ] = await Promise.all([
    Promise.all(projects.map(async (project) =>
      (await hasProjectCapability(user.id, project.id, 'agent.execute')) ? project.id : null,
    )).then(values => values.filter((projectId): projectId is string => Boolean(projectId))),
    Promise.all(projects.map(async (project) =>
      (await hasProjectCapability(user.id, project.id, 'profiling.execute')) ? project.id : null,
    )).then(values => values.filter((projectId): projectId is string => Boolean(projectId))),
    Promise.all(projects.map(async (project) =>
      (await hasProjectCapability(user.id, project.id, 'quality.execute')) ? project.id : null,
    )).then(values => values.filter((projectId): projectId is string => Boolean(projectId))),
    Promise.all(projects.map(async (project) =>
      (await hasProjectCapability(user.id, project.id, 'agent.converse')) ? project.id : null,
    )).then(values => values.filter((projectId): projectId is string => Boolean(projectId))),
    Promise.all(projects.map(async (project) =>
      (await hasProjectCapability(user.id, project.id, 'agent.recommend')) ? project.id : null,
    )).then(values => values.filter((projectId): projectId is string => Boolean(projectId))),
  ])

  const agentOptions: AgentOption[] = enabledAgents.map((agent) => ({
    id: agent.id,
    agentKey: agent.agent_key,
    name: agent.name,
    version: agent.version,
  }))

  const agentIds = enabledAgents.map((agent) => agent.id)
  let tools: ToolDefinition[] = []

  if (agentIds.length > 0) {
    const { data: toolRows, error: toolError } = await supabase.schema('agent')
      .from('tool_definitions')
      .select('id, agent_definition_id, tool_key, name, description, version, enabled')
      .in('agent_definition_id', agentIds).eq('enabled', true).order('name')
    if (toolError) throw new Error(`Unable to load agent tools: ${toolError.message}`)
    tools = (toolRows ?? []) as ToolDefinition[]
  }

  const toolsByAgent = new Map<string, ToolDefinition[]>()
  for (const tool of tools) {
    const existing = toolsByAgent.get(tool.agent_definition_id) ?? []
    existing.push(tool)
    toolsByAgent.set(tool.agent_definition_id, existing)
  }
  const enabledToolCount = tools.filter(tool => tool.enabled).length
  const successfulRuns = runs.filter(run => ['SUCCEEDED','COMPLETED'].includes(String(run.status).toUpperCase())).length
  const runsByAgent = new Map<string,AgentRun[]>()
  for (const run of runs) runsByAgent.set(run.agent_definition_id,[...(runsByAgent.get(run.agent_definition_id)??[]),run])

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <GlobalUtilityBar persona={accessContext.persona} organizationRole={accessContext.organizationRole} roleLabel="AI Agents" contextLabel="Governed automation and execution" homeHref="/home" />
        <nav aria-label="Agent workspace" className="flex items-center justify-between gap-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#102036] px-4 py-3 shadow-sm">
          <span className="shrink-0 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Agent workspace</span>
          <div className="flex shrink-0 gap-2">
            <Link href="/agents" aria-current="page" className="rounded-xl bg-violet-500/15 px-3 py-2 text-sm font-semibold text-violet-200 ring-1 ring-violet-400/20">Agents</Link>
            {canMonitoring ? <Link href={canonicalRoutes.monitoring} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Job Monitor</Link> : null}
            {governanceSuperAdmin ? <Link href="/admin/learning-cases" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Review learning cases{pendingLearningCases ? ` (${pendingLearningCases})` : ''}</Link> : null}
          </div>
        </nav>

        <header className="rounded-[22px] border border-white/10 bg-[#102036] p-6 shadow-[10px_10px_28px_rgba(0,0,0,.24)] sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-violet-400/10 px-3 py-1.5 text-xs font-bold text-violet-300"><Sparkles className="h-3.5 w-3.5" />Governed AI operations</div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white">AI Agents</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Choose a governed agent, run approved automation, inspect registered tools, and follow execution evidence without leaving the control plane.</p>
            </div>
            {canMonitoring ? <Link href={canonicalRoutes.monitoring} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-500">Open live execution <Activity className="ml-1 inline h-4 w-4" /></Link> : null}
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[22px] border border-white/10 bg-[#102036] p-5"><Bot className="h-5 w-5 text-violet-300" /><p className="mt-3 text-3xl font-black text-white">{enabledAgents.length}</p><p className="mt-1 text-sm font-bold text-slate-200">Enabled agents</p><p className="mt-1 text-xs text-slate-500">Governed capabilities available in this workspace</p></div>
          <div className="rounded-[22px] border border-white/10 bg-[#102036] p-5"><Wrench className="h-5 w-5 text-cyan-300" /><p className="mt-3 text-3xl font-black text-white">{enabledToolCount}</p><p className="mt-1 text-sm font-bold text-slate-200">Registered tools</p><p className="mt-1 text-xs text-slate-500">Enabled tools bound to active agents</p></div>
          <div className="rounded-[22px] border border-white/10 bg-[#102036] p-5"><Activity className="h-5 w-5 text-blue-300" /><p className="mt-3 text-3xl font-black text-white">{runs.length}</p><p className="mt-1 text-sm font-bold text-slate-200">Recent runs</p><p className="mt-1 text-xs text-slate-500">Authorized execution history in view</p></div>
          <div className="rounded-[22px] border border-white/10 bg-[#102036] p-5"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><p className="mt-3 text-3xl font-black text-white">{successfulRuns}</p><p className="mt-1 text-sm font-bold text-slate-200">Successful recent runs</p><p className="mt-1 text-xs text-slate-500">Completed or succeeded visible executions</p></div>
        </section>

        <RunAgentForm
          agents={agentOptions}
          projects={projects}
          datasetVersions={datasetVersions}
          agentExecuteProjectIds={agentExecuteProjectIds}
          profilingExecuteProjectIds={profilingExecuteProjectIds}
          qualityExecuteProjectIds={qualityExecuteProjectIds}
          conversationalProjectIds={conversationalProjectIds}
          requestableProjectIds={requestableProjectIds}
          conversationDefaults={conversationDefaults}
        />

        {agentsError ? (
          <section className="rounded-xl border border-red-200 p-6">
            <h2 className="font-medium">Unable to load agents</h2>
            <p className="mt-2 text-sm text-muted-foreground">The agent registry could not be loaded.</p>
          </section>
        ) : enabledAgents.length === 0 ? (
          <section className="rounded-xl border p-6 text-sm text-muted-foreground">No enabled agents are currently registered.</section>
        ) : (
          <div className="space-y-6">
            {enabledAgents.map((agent) => {
              const agentTools = toolsByAgent.get(agent.id) ?? []
              const agentRuns = runsByAgent.get(agent.id) ?? []
              const touchedDatasets = new Set(agentRuns.flatMap(run => run.dataset_id ? [run.dataset_id] : [])).size
              const detailHref = canonicalRoutes.agent(agent.agent_key, agent.version)
              return (
                <section key={agent.id} className="space-y-5 rounded-[22px] border border-white/10 bg-[#102036] p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">
                          <Link href={detailHref} className="underline-offset-4 hover:underline">{agent.name}</Link>
                        </h2>
                        <span className="rounded-full border px-2 py-1 text-xs">v{agent.version}</span>
                        <span className="rounded-full border px-2 py-1 text-xs">Enabled</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{agent.description || 'No description is registered for this agent.'}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Key: {agent.agent_key}</p>
                      <Link href={detailHref} className="mt-3 inline-block text-sm font-medium underline underline-offset-4">View agent details →</Link>
                    </div>
                    <div className="grid shrink-0 grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl border border-white/[0.07] bg-[#0d1c30] px-3 py-2"><p className="text-lg font-black text-white">{agentTools.length}</p><p className="text-slate-500">tools</p></div><div className="rounded-xl border border-white/[0.07] bg-[#0d1c30] px-3 py-2"><p className="text-lg font-black text-white">{agentRuns.length}</p><p className="text-slate-500">runs</p></div><div className="rounded-xl border border-white/[0.07] bg-[#0d1c30] px-3 py-2"><p className="text-lg font-black text-white">{touchedDatasets}</p><p className="text-slate-500">datasets</p></div></div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium">Registered tools</h3>
                    {agentTools.length === 0 ? (
                      <p className="mt-3 text-sm text-muted-foreground">No enabled tools are registered for this agent.</p>
                    ) : (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {agentTools.map((tool) => (
                          <div key={tool.id} className="rounded-2xl border border-white/[0.07] bg-[#0d1c30] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="font-medium">{tool.name}</h4>
                              <span className="text-xs text-muted-foreground">v{tool.version}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{tool.tool_key}</p>
                            {tool.description && <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        <section className="rounded-xl border p-6">
          <h2 className="text-lg font-semibold">Recent agent runs</h2>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No agent runs have been recorded.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr><th className="px-3 py-2">Agent</th><th className="px-3 py-2">Dataset</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Created</th></tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const agent = agentsById.get(run.agent_definition_id)
                    const version = run.dataset_version_id ? versionsById.get(run.dataset_version_id) : undefined
                    const dataset = version ? datasetsById.get(version.dataset_id) : undefined
                    return (
                      <tr key={run.id} className="border-b last:border-0">
                        <td className="px-3 py-3">
                          <Link href={canonicalRoutes.agentRun(run.id)} className="font-medium underline underline-offset-2">
                            {agent ? `${agent.name} v${agent.version}` : 'Registered agent'}
                          </Link>
                        </td>
                        <td className="px-3 py-3">{dataset ? `${dataset.name} v${version?.version_number}` : 'Unknown dataset version'}</td>
                        <td className="px-3 py-3">{run.status}{run.error_code ? ` (${run.error_code})` : ''}</td>
                        <td className="px-3 py-3 text-muted-foreground">{new Date(run.created_at).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs text-muted-foreground">
          Execution is server-side and authenticated. Agent runs, steps, and profiling results are persisted through the trusted executor path.
        </p>
      </div>
    </main>
  )
}