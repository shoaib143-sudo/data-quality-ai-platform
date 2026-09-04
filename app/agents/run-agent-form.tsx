'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

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

const GOVERNED_READ_AGENT_KEYS = new Set([
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
])

export function RunAgentForm({
  agents,
  projects,
  datasetVersions,
}: {
  agents: AgentOption[]
  projects: ProjectOption[]
  datasetVersions: DatasetVersionOption[]
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

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === agentDefinitionId) ?? null,
    [agents, agentDefinitionId],
  )
  const governedReadAgent = Boolean(selectedAgent && GOVERNED_READ_AGENT_KEYS.has(selectedAgent.agentKey))
  const projectVersions = useMemo(
    () => datasetVersions.filter((version) => version.projectId === projectId),
    [datasetVersions, projectId],
  )

  function handleProjectChange(value: string) {
    setProjectId(value)
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
    if (!governedReadAgent && !datasetVersionId) {
      setStatus('Select a dataset version for this operational agent.')
      return
    }

    setRunning(true)

    try {
      let endpoint: string
      let body: Record<string, unknown>

      if (governedReadAgent) {
        endpoint = '/api/agents/governance/run'
        body = { agentDefinitionId, projectId, question: question.trim() || undefined }
      } else if (selectedAgent.agentKey === 'data_quality_agent') {
        endpoint = '/api/data-quality/run'
        body = { datasetVersionId }
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
                value={governedReadAgent ? '' : datasetVersionId}
                onChange={(event) => setDatasetVersionId(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
                disabled={running || governedReadAgent || projectVersions.length === 0}
              >
                <option value="">{governedReadAgent ? 'Not required for this agent' : 'Select a version'}</option>
                {!governedReadAgent && projectVersions.map((version) => (
                  <option key={version.id} value={version.id}>{version.datasetName} v{version.versionNumber}</option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={running || !selectedAgent || !projectId || (!governedReadAgent && !datasetVersionId)}
                className="w-full rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? 'Running…' : 'Run Agent'}
              </button>
            </div>
          </div>

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
              <span className="text-xs text-muted-foreground">Read-only project evidence only · {question.length}/1000 characters</span>
            </label>
          )}
        </form>
      )}

      {status && <p className="mt-4 rounded-md border p-3 text-sm" role="status">{status}</p>}
    </section>
  )
}
