'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

export type AgentOption = {
  id: string
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
  const [status, setStatus] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

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

    if (!agentDefinitionId || !projectId || !datasetVersionId) {
      setStatus('Select an agent, project and dataset version.')
      return
    }

    setRunning(true)

    try {
      const response = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentDefinitionId,
          projectId,
          datasetVersionId,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? 'Agent execution failed.')
      }

      const runId = payload.agentRunId ?? payload.agent_run_id
      if (typeof runId !== 'string' || runId.length === 0) {
        throw new Error('Agent execution completed without returning a run identifier.')
      }

      router.push(`/agents/runs/${runId}`)
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
        <h2 className="text-lg font-semibold">Run Profiling Agent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the exact registered agent version and a project dataset version.
        </p>
      </div>

      {agents.length === 0 || projects.length === 0 || datasetVersions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A runnable agent, project, and dataset version are required before execution can start.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Agent</span>
            <select
              value={agentDefinitionId}
              onChange={(event) => setAgentDefinitionId(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
              disabled={running}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} v{agent.version}
                </option>
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
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Dataset version</span>
            <select
              value={datasetVersionId}
              onChange={(event) => setDatasetVersionId(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
              disabled={running || projectVersions.length === 0}
            >
              <option value="">Select a version</option>
              {projectVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.datasetName} v{version.versionNumber}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={running || !datasetVersionId}
              className="w-full rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? 'Running…' : 'Run Agent'}
            </button>
          </div>
        </form>
      )}

      {status && (
        <p className="mt-4 rounded-md border p-3 text-sm" role="status">
          {status}
        </p>
      )}
    </section>
  )
}
