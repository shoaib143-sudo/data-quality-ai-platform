'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PersonaConversationDefault } from '@/lib/governance/persona-conversation-defaults'

export type AgentOption = {
  id: string
  agentKey: string
  name: string
  version: string
}

export type ProjectOption = {
  id: string
  name: string
}

export type DatasetVersionOption = {
  id: string
  datasetId: string
  projectId: string
  datasetName: string
  versionNumber: number
}

type ConversationContextPayload = {
  settings: PersonaConversationDefault
  appliedDomain: string | null
  availableDomains: string[]
}

const GOVERNED_READ_AGENT_KEYS = new Set([
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
])

function preferredWorkerIds(agents: AgentOption[], settings: PersonaConversationDefault) {
  const preferred = agents
    .filter(agent => GOVERNED_READ_AGENT_KEYS.has(agent.agentKey) && settings.preferredAgentKeys.includes(agent.agentKey))
    .map(agent => agent.id)
  return preferred.length
    ? preferred.slice(0, 6)
    : agents.filter(agent => GOVERNED_READ_AGENT_KEYS.has(agent.agentKey)).slice(0, 3).map(agent => agent.id)
}

export function RunAgentForm({
  agents,
  projects,
  datasetVersions,
  agentExecuteProjectIds,
  profilingExecuteProjectIds,
  qualityExecuteProjectIds,
  conversationalProjectIds,
  requestableProjectIds,
  conversationDefaults,
}: {
  agents: AgentOption[]
  projects: ProjectOption[]
  datasetVersions: DatasetVersionOption[]
  agentExecuteProjectIds: string[]
  profilingExecuteProjectIds: string[]
  qualityExecuteProjectIds: string[]
  conversationalProjectIds: string[]
  requestableProjectIds: string[]
  conversationDefaults: PersonaConversationDefault
}) {
  const router = useRouter()
  const [agentDefinitionId, setAgentDefinitionId] = useState(agents[0]?.id ?? '')
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [datasetVersionId, setDatasetVersionId] = useState(
    datasetVersions.find((version) => version.projectId === projects[0]?.id)?.id ?? '',
  )
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [conversationDomain, setConversationDomain] = useState('')
  const [availableDomains, setAvailableDomains] = useState<string[]>([])
  const [effectiveConversationDefaults, setEffectiveConversationDefaults] = useState(conversationDefaults)
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>(() => preferredWorkerIds(agents, conversationDefaults))

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === agentDefinitionId) ?? null,
    [agents, agentDefinitionId],
  )
  const governedReadAgent = Boolean(selectedAgent && GOVERNED_READ_AGENT_KEYS.has(selectedAgent.agentKey))
  const nativeSupervisorAgent = selectedAgent?.agentKey === 'native_supervisor_agent'
  const supervisorCandidates = useMemo(
    () => agents.filter(agent => GOVERNED_READ_AGENT_KEYS.has(agent.agentKey)),
    [agents],
  )
  const canConverseProject = conversationalProjectIds.includes(projectId)
  const canExecuteSelectedAgent = selectedAgent?.agentKey === 'profiling_agent'
    ? profilingExecuteProjectIds.includes(projectId)
    : selectedAgent?.agentKey === 'data_quality_agent'
      ? qualityExecuteProjectIds.includes(projectId)
      : agentExecuteProjectIds.includes(projectId)
  const canRequestProject = requestableProjectIds.includes(projectId)
  const requestableOperationalAgent = Boolean(selectedAgent && ['profiling_agent', 'data_quality_agent', 'native_supervisor_agent'].includes(selectedAgent.agentKey))
  const canRequestSelectedAgent = !governedReadAgent && requestableOperationalAgent && canRequestProject && !canExecuteSelectedAgent
  const canSubmitSelectedAgent = governedReadAgent ? canConverseProject : (canExecuteSelectedAgent || canRequestSelectedAgent)
  const projectVersions = useMemo(
    () => datasetVersions.filter((version) => version.projectId === projectId),
    [datasetVersions, projectId],
  )

  useEffect(() => {
    if (!projectId || !canConverseProject) {
      setEffectiveConversationDefaults(conversationDefaults)
      setAvailableDomains([])
      return
    }

    const controller = new AbortController()
    const params = new URLSearchParams({ projectId })
    if (conversationDomain) params.set('domain', conversationDomain)

    void fetch(`/api/agent-preferences/context?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    }).then(async response => {
      const payload = await response.json() as ConversationContextPayload & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to resolve conversational defaults.')
      setEffectiveConversationDefaults(payload.settings)
      setAvailableDomains(payload.availableDomains ?? [])
      setSelectedWorkerIds(preferredWorkerIds(agents, payload.settings))
    }).catch(error => {
      if (controller.signal.aborted) return
      setEffectiveConversationDefaults(conversationDefaults)
      setAvailableDomains([])
      setStatus(error instanceof Error ? error.message : 'Unable to resolve conversational defaults.')
    })

    return () => controller.abort()
  }, [agents, canConverseProject, conversationDefaults, conversationDomain, projectId])

  function handleProjectChange(value: string) {
    setProjectId(value)
    setConversationDomain('')
    setAvailableDomains([])
    const firstVersion = datasetVersions.find((version) => version.projectId === value)
    setDatasetVersionId(firstVersion?.id ?? '')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)

    if (!selectedAgent || !projectId) {
      setStatus('Select an agent and project.')
      return
    }
    if (governedReadAgent && !canConverseProject) {
      setStatus('You are not authorized to use conversational agents in this project.')
      return
    }
    if (!governedReadAgent && !canExecuteSelectedAgent && !canRequestSelectedAgent) {
      setStatus('You can use the Agents workspace for governed read access, but you are not authorized to start or request this operational execution.')
      return
    }
    if (!governedReadAgent && !nativeSupervisorAgent && !datasetVersionId) {
      setStatus('Select a dataset version for this operational agent.')
      return
    }
    if (nativeSupervisorAgent && !question.trim()) {
      setStatus('Enter a supervisor goal.')
      return
    }
    if (nativeSupervisorAgent && selectedWorkerIds.length < 1) {
      setStatus('Select at least one specialist for the supervisor.')
      return
    }

    setRunning(true)

    try {
      if (!governedReadAgent && !canExecuteSelectedAgent && canRequestSelectedAgent) {
        const workers = selectedWorkerIds.map((workerId, index) => ({
          workerId: `worker-${index + 1}`,
          agentDefinitionId: workerId,
          question: question.trim() || null,
          dependsOn: [],
        }))
        const isSupervisor = selectedAgent.agentKey === 'native_supervisor_agent'
        const selectedVersion = isSupervisor ? null : datasetVersions.find(version => version.id === datasetVersionId)
        if (!isSupervisor && !selectedVersion) throw new Error('Select a dataset version before requesting execution.')
        const actionKey = isSupervisor
          ? 'RUN_SUPERVISOR'
          : selectedAgent.agentKey === 'data_quality_agent'
            ? 'RUN_DATA_QUALITY'
            : 'RUN_PROFILING'
        const response = await fetch('/api/agent-approvals/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isSupervisor ? {
            actionKey,
            projectId,
            parameters: { goal: question.trim(), workers },
          } : {
            actionKey,
            datasetId: selectedVersion!.datasetId,
            parameters: {
              agentDefinitionId,
              datasetVersionId,
            },
          }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Unable to request execution approval.')
        router.push('/approvals')
        router.refresh()
        return
      }

      let endpoint: string
      let body: Record<string, unknown>

      if (governedReadAgent) {
        endpoint = '/api/agents/governance/run'
        body = {
          agentDefinitionId,
          projectId,
          question: question.trim() || undefined,
          domain: conversationDomain || undefined,
        }
      } else if (nativeSupervisorAgent) {
        endpoint = '/api/agents/supervisor/run'
        body = {
          projectId,
          goal: question.trim(),
          workers: selectedWorkerIds.map((workerId, index) => ({
            workerId: `worker-${index + 1}`,
            agentDefinitionId: workerId,
            question: question.trim() || null,
            dependsOn: [],
          })),
        }
      } else if (selectedAgent.agentKey === 'data_quality_agent') {
        endpoint = '/api/data-quality/run'
        body = { agentDefinitionId, datasetVersionId }
      } else {
        endpoint = '/api/agents/run'
        body = { agentDefinitionId, projectId, datasetVersionId }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Agent execution failed.')

      const runId = payload.runId ?? payload.agentRunId ?? payload.agent_run_id
      if (typeof runId !== 'string' || runId.length === 0) {
        throw new Error('Agent execution completed without returning a run identifier.')
      }

      if (governedReadAgent) {
        router.push(`/agents/runs/${encodeURIComponent(runId)}`)
      } else {
        router.push(payload.monitorUrl ?? `/monitoring?run=${encodeURIComponent(runId)}`)
      }
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Agent execution failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="rounded-xl border p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Run an operational agent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Profiling and Data Quality agents execute against a dataset version. Governed Steward, Analyst, Architect, Investigator, Executive, and Support agents run read-only against the selected project.
        </p>
      </div>

      {agents.length === 0 || projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">A runnable agent and project are required before execution can start.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Agent</span>
              <select
                value={agentDefinitionId}
                onChange={(event) => setAgentDefinitionId(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
                disabled={running}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name} v{agent.version}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">Project</span>
              <select
                value={projectId}
                onChange={(event) => handleProjectChange(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
                disabled={running}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">Dataset version</span>
              <select
                value={governedReadAgent || nativeSupervisorAgent ? '' : datasetVersionId}
                onChange={(event) => setDatasetVersionId(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
                disabled={running || governedReadAgent || nativeSupervisorAgent || projectVersions.length === 0}
              >
                <option value="">{governedReadAgent || nativeSupervisorAgent ? 'Not required for this agent' : 'Select a version'}</option>
                {!governedReadAgent && !nativeSupervisorAgent && projectVersions.map((version) => (
                  <option key={version.id} value={version.id}>{version.datasetName} v{version.versionNumber}</option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={running || !canSubmitSelectedAgent || !selectedAgent || !projectId || (!governedReadAgent && !nativeSupervisorAgent && !datasetVersionId) || (nativeSupervisorAgent && selectedWorkerIds.length === 0)}
                className="w-full rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running
                  ? (governedReadAgent ? 'Asking…' : canExecuteSelectedAgent ? 'Running…' : 'Requesting…')
                  : governedReadAgent
                    ? (canConverseProject ? 'Ask Agent' : 'Conversation not permitted')
                    : canExecuteSelectedAgent
                      ? 'Run Agent'
                      : canRequestSelectedAgent
                        ? 'Request execution'
                        : 'Execution not permitted'}
              </button>
            </div>
          </div>

          {governedReadAgent && (effectiveConversationDefaults.suggestedPrompts.length > 0 || availableDomains.length > 0) ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Effective conversation defaults</span>
                <span>· {effectiveConversationDefaults.responseDepth.toLowerCase()} responses</span>
                <span>· {effectiveConversationDefaults.evidenceDepth.toLowerCase().replace('_', ' ')} evidence</span>
                <span>· user preference overrides project, domain, and persona UX defaults</span>
              </div>
              {availableDomains.length > 0 ? (
                <label className="mt-3 block max-w-sm space-y-1 text-xs">
                  <span className="font-medium text-foreground">Conversation domain</span>
                  <select
                    value={conversationDomain}
                    onChange={event => setConversationDomain(event.target.value)}
                    disabled={running}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Project-wide</option>
                    {availableDomains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
                  </select>
                  <span className="text-muted-foreground">Only domains from datasets you are currently authorized to view are available.</span>
                </label>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {effectiveConversationDefaults.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setQuestion(prompt)}
                    disabled={running}
                    className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {nativeSupervisorAgent ? (
            <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
              <label className="block space-y-2 text-sm">
                <span className="font-medium">Supervisor goal</span>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value.slice(0, 2000))}
                  rows={4}
                  placeholder="Describe the governed investigation or operational objective."
                  className="w-full rounded-md border bg-background px-3 py-2"
                  disabled={running}
                />
                <span className="text-xs text-muted-foreground">{question.length}/2000 characters</span>
              </label>
              <fieldset>
                <legend className="text-sm font-medium">Specialists</legend>
                <p className="mt-1 text-xs text-muted-foreground">Choose 1 to 6 read-only specialists. Preferred agents are selected by default when available.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {supervisorCandidates.map(agent => {
                    const checked = selectedWorkerIds.includes(agent.id)
                    const limitReached = !checked && selectedWorkerIds.length >= 6
                    return (
                      <label key={agent.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={running || limitReached}
                          onChange={event => setSelectedWorkerIds(current => event.target.checked
                            ? [...current, agent.id].slice(0, 6)
                            : current.filter(id => id !== agent.id))}
                        />
                        <span>{agent.name}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            </div>
          ) : null}

          {governedReadAgent && (
            <label className="block space-y-2 text-sm">
              <span className="font-medium">Question or objective <span className="font-normal text-muted-foreground">(optional)</span></span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value.slice(0, 1000))}
                rows={3}
                placeholder="For example: Summarize the highest-priority governance risks and the evidence behind them."
                className="w-full rounded-md border bg-background px-3 py-2"
                disabled={running}
              />
              <span className="text-xs text-muted-foreground">Read-only authorized evidence only · {question.length}/1000 characters</span>
            </label>
          )}
        </form>
      )}

      {projectId && !canExecuteSelectedAgent ? (
        <p className="mt-4 rounded-md border p-3 text-sm text-muted-foreground">
          You can use governed conversational agents and inspect authorized evidence in this project. Starting, retrying, or cancelling operational executions remains separately authorized.
        </p>
      ) : null}
      {status && <p className="mt-4 rounded-md border p-3 text-sm" role="status">{status}</p>}
    </section>
  )
}
