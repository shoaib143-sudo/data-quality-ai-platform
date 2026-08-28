import Link from 'next/link'

import { RunAgentForm, type AgentOption, type DatasetVersionOption, type ProjectOption } from './run-agent-form'
import { requireUser } from '@/lib/supabase/auth'
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
  dataset_version_id: string | null
  status: string
  created_at: string
  completed_at: string | null
  error_code: string | null
}

export default async function AgentsPage() {
  await requireUser()
  const supabase = await createClient()

  const [agentsResult, projectsResult, datasetsResult, versionsResult, runsResult] = await Promise.all([
    supabase.schema('agent').from('agent_definitions')
      .select('id, agent_key, name, description, version, enabled, created_at')
      .eq('enabled', true).order('agent_key').order('version', { ascending: false }),
    supabase.schema('app').from('projects').select('id, name').order('name'),
    supabase.schema('catalog').from('datasets').select('id, project_id, name').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id, dataset_id, version_number').order('version_number', { ascending: false }),
    supabase.schema('agent').from('agent_runs')
      .select('id, agent_definition_id, dataset_version_id, status, created_at, completed_at, error_code')
      .order('created_at', { ascending: false }).limit(10),
  ])

  const agentsError = agentsResult.error
  const enabledAgents = (agentsResult.data ?? []) as AgentDefinition[]
  const projects = (projectsResult.data ?? []) as ProjectOption[]
  const datasets = (datasetsResult.data ?? []) as DatasetRow[]
  const versions = (versionsResult.data ?? []) as DatasetVersionRow[]
  const runs = (runsResult.data ?? []) as AgentRun[]

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

  const agentOptions: AgentOption[] = enabledAgents.map((agent) => ({
    id: agent.id,
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

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <Link href="/dashboard" className="text-sm underline">← Back to dashboard</Link>

        <header>
          <h1 className="text-3xl font-semibold">AI Agents</h1>
          <p className="mt-2 text-muted-foreground">
            Live agent registry, registered tools, authenticated execution, and recent run history.
          </p>
        </header>

        <RunAgentForm agents={agentOptions} projects={projects} datasetVersions={datasetVersions} />

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
              return (
                <section key={agent.id} className="space-y-5 rounded-xl border p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">{agent.name}</h2>
                        <span className="rounded-full border px-2 py-1 text-xs">v{agent.version}</span>
                        <span className="rounded-full border px-2 py-1 text-xs">Enabled</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{agent.description || 'No description is registered for this agent.'}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Key: {agent.agent_key}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">{agentTools.length} {agentTools.length === 1 ? 'tool' : 'tools'}</div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium">Registered tools</h3>
                    {agentTools.length === 0 ? (
                      <p className="mt-3 text-sm text-muted-foreground">No enabled tools are registered for this agent.</p>
                    ) : (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {agentTools.map((tool) => (
                          <div key={tool.id} className="rounded-lg border p-4">
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
                        <td className="px-3 py-3">{agent ? `${agent.name} v${agent.version}` : 'Registered agent'}</td>
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
