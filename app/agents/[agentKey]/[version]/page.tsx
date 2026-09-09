import Link from 'next/link'
import { notFound } from 'next/navigation'

import { canonicalRoutes } from '@/lib/platform/canonical-routes'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type AgentDefinition = {
  id: string
  agent_key: string
  name: string
  description: string | null
  version: string
  enabled: boolean
  created_at: string
}

type ToolDefinition = {
  id: string
  tool_key: string
  name: string
  description: string | null
  version: string
  enabled: boolean
}

type AgentRun = {
  id: string
  status: string
  created_at: string
  completed_at: string | null
  error_code: string | null
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentKey: string; version: string }>
}) {
  await requireUser()
  const { agentKey, version } = await params
  const supabase = await createClient()

  const { data: agentRow, error: agentError } = await supabase.schema('agent')
    .from('agent_definitions')
    .select('id, agent_key, name, description, version, enabled, created_at')
    .eq('agent_key', agentKey)
    .eq('version', version)
    .maybeSingle()

  if (agentError) throw new Error(`Unable to load agent definition: ${agentError.message}`)
  if (!agentRow) notFound()

  const agent = agentRow as AgentDefinition
  const [toolsResult, runsResult] = await Promise.all([
    supabase.schema('agent').from('tool_definitions')
      .select('id, tool_key, name, description, version, enabled')
      .eq('agent_definition_id', agent.id)
      .eq('enabled', true)
      .order('name'),
    supabase.schema('agent').from('agent_runs')
      .select('id, status, created_at, completed_at, error_code')
      .eq('agent_definition_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (toolsResult.error) throw new Error(`Unable to load agent tools: ${toolsResult.error.message}`)
  if (runsResult.error) throw new Error(`Unable to load agent runs: ${runsResult.error.message}`)

  const tools = (toolsResult.data ?? []) as ToolDefinition[]
  const runs = (runsResult.data ?? []) as AgentRun[]
  const completedRuns = runs.filter((run) => run.status === 'COMPLETED').length
  const failedRuns = runs.filter((run) => run.status === 'FAILED').length

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={canonicalRoutes.agents} className="text-sm font-medium underline underline-offset-4">← Back to AI Agents</Link>
          <div className="flex flex-wrap gap-2">
            <Link href={canonicalRoutes.agents} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100">Run an agent</Link>
            <Link href={canonicalRoutes.monitoring} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100">Open Job Monitor</Link>
          </div>
        </div>

        <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">{agent.name} v{agent.version}</h1>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${agent.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                  {agent.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {agent.description || 'No description is registered for this agent.'}
              </p>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <dt className="font-medium text-slate-500">Registry key</dt>
                  <dd className="mt-1 font-mono text-slate-900">{agent.agent_key}</dd>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <dt className="font-medium text-slate-500">Registered</dt>
                  <dd className="mt-1 text-slate-900">{new Date(agent.created_at).toLocaleString()}</dd>
                </div>
              </dl>
            </div>

            <div className="grid min-w-[220px] grid-cols-3 gap-2 text-center sm:grid-cols-1">
              <div className="rounded-xl border bg-slate-50 px-4 py-3">
                <p className="text-2xl font-bold">{tools.length}</p>
                <p className="text-xs text-slate-500">Enabled tools</p>
              </div>
              <div className="rounded-xl border bg-slate-50 px-4 py-3">
                <p className="text-2xl font-bold">{completedRuns}</p>
                <p className="text-xs text-slate-500">Recent completed</p>
              </div>
              <div className="rounded-xl border bg-slate-50 px-4 py-3">
                <p className="text-2xl font-bold">{failedRuns}</p>
                <p className="text-xs text-slate-500">Recent failed</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">Registered tools</h2>
            <p className="mt-1 text-sm text-slate-500">Capabilities currently enabled for this exact agent version.</p>
          </div>
          {tools.length === 0 ? (
            <p className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">No enabled tools are registered for this agent version.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tools.map((tool) => (
                <article key={tool.id} className="rounded-xl border bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{tool.name}</h3>
                    <span className="shrink-0 rounded-full border bg-white px-2 py-1 text-xs">v{tool.version}</span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-slate-500">{tool.tool_key}</p>
                  {tool.description && <p className="mt-3 text-sm leading-6 text-slate-600">{tool.description}</p>}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">Recent runs</h2>
            <p className="mt-1 text-sm text-slate-500">Persisted execution evidence for this exact registered agent version.</p>
          </div>
          {runs.length === 0 ? (
            <p className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">No runs have been recorded for this agent version.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Run</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b last:border-0">
                      <td className="px-3 py-3">
                        <Link href={canonicalRoutes.agentRun(run.id)} className="font-medium underline underline-offset-4">View run</Link>
                      </td>
                      <td className="px-3 py-3">{run.status}{run.error_code ? ` (${run.error_code})` : ''}</td>
                      <td className="px-3 py-3 text-slate-500">{new Date(run.created_at).toLocaleString()}</td>
                      <td className="px-3 py-3 text-slate-500">{run.completed_at ? new Date(run.completed_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs leading-5 text-slate-500">
          This page is a read-only projection of the live agent registry, registered tools, and persisted run evidence. Agent execution remains server-side and authenticated.
        </p>
      </div>
    </main>
  )
}
