import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type AgentDefinition = {
  id: string
  agent_key: string
  name: string
  description: string | null
  version: string
  enabled: boolean
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

export default async function AgentsPage() {
  await requireUser()

  const supabase = await createClient()

  const { data: agentRows, error: agentError } = await supabase
    .schema('agent')
    .from('agent_definitions')
    .select(
      'id, agent_key, name, description, version, enabled'
    )
    .eq('enabled', true)
    .order('agent_key')
    .order('version', { ascending: false })

  if (agentError) {
    throw new Error(`Unable to load agent definitions: ${agentError.message}`)
  }

  const agents = (agentRows ?? []).reduce<AgentDefinition[]>(
    (selected, agent) => {
      const existing = selected.find(
        (item) => item.agent_key === agent.agent_key
      )

      if (!existing) {
        selected.push(agent)
      }

      return selected
    },
    []
  )

  const agentIds = agents.map((agent) => agent.id)

  let tools: ToolDefinition[] = []

  if (agentIds.length > 0) {
    const { data: toolRows, error: toolError } = await supabase
      .schema('agent')
      .from('tool_definitions')
      .select(
        'id, agent_definition_id, tool_key, name, description, version, enabled'
      )
      .eq('enabled', true)
      .in('agent_definition_id', agentIds)
      .order('name')

    if (toolError) {
      throw new Error(`Unable to load agent tools: ${toolError.message}`)
    }

    tools = toolRows ?? []
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold">AI Agents</h1>

      <p className="mt-2 text-muted-foreground">
        Manage and run AI-powered data quality agents.
      </p>

      <section className="mt-8 space-y-6">
        {agents.length === 0 ? (
          <div className="rounded-xl border p-6">
            <h2 className="text-xl font-semibold">No enabled agents</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              There are currently no enabled agents available to this user.
            </p>
          </div>
        ) : (
          agents.map((agent) => {
            const agentTools = tools.filter(
              (tool) => tool.agent_definition_id === agent.id
            )

            return (
              <section
                key={agent.id}
                className="rounded-xl border p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {agent.name}
                    </h2>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {agent.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-full border px-3 py-1 text-sm">
                      Enabled
                    </span>

                    <span className="text-sm text-muted-foreground">
                      Version {agent.version}
                    </span>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold">
                    Tools ({agentTools.length})
                  </h3>

                  {agentTools.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No enabled tools are currently registered.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {agentTools.map((tool) => (
                        <div
                          key={tool.id}
                          className="rounded-lg border p-4"
                        >
                          <h4 className="font-medium">{tool.name}</h4>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {tool.description}
                          </p>

                          <p className="mt-3 text-xs text-muted-foreground">
                            v{tool.version}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )
          })
        )}
      </section>
    </main>
  )
}