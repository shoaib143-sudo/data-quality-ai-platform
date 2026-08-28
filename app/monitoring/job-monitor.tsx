'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type MonitoringRun = {
  id: string
  agent_definition_id: string
  project_id: string
  dataset_id: string | null
  dataset_version_id: string | null
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
}

export type MonitoringStep = {
  id: string
  agent_run_id: string
  step_name: string
  step_order: number
  status: string
  attempt: number
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
}

export type MonitoringAgent = {
  id: string
  name: string
  version: string
  agent_key: string
}

export type MonitoringDataset = {
  id: string
  name: string
}

type Props = {
  initialRuns: MonitoringRun[]
  initialAgents: MonitoringAgent[]
  initialDatasets: MonitoringDataset[]
  initialSteps: MonitoringStep[]
  userId: string
}

const ACTIVE_STATUSES = new Set(['RUNNING', 'QUEUED', 'PENDING'])

function statusClass(status: string) {
  if (status === 'SUCCEEDED' || status === 'COMPLETED') return 'border-green-300 text-green-700'
  if (status === 'FAILED') return 'border-red-300 text-red-700'
  if (ACTIVE_STATUSES.has(status)) return 'border-blue-300 text-blue-700'
  return 'border-gray-300 text-gray-700'
}

function duration(run: MonitoringRun) {
  const start = run.started_at ?? run.created_at
  const end = run.completed_at ?? new Date().toISOString()
  const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`
}

function progress(steps: MonitoringStep[]) {
  if (!steps.length) return { label: 'Starting', percent: 0 }
  const completed = steps.filter((step) => ['SUCCEEDED', 'COMPLETED'].includes(step.status)).length
  const failed = steps.some((step) => step.status === 'FAILED')
  const running = steps.some((step) => ACTIVE_STATUSES.has(step.status))
  const percent = Math.round((completed / steps.length) * 100)
  if (failed) return { label: 'Failed', percent }
  if (running) return { label: `${completed}/${steps.length} steps complete`, percent: Math.max(percent, 5) }
  return { label: `${completed}/${steps.length} steps complete`, percent: 100 }
}

export function JobMonitor({ initialRuns, initialAgents, initialDatasets, initialSteps, userId }: Props) {
  const [runs, setRuns] = useState(initialRuns)
  const [steps, setSteps] = useState(initialSteps)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRuns[0]?.id ?? null)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)

  const agentsById = useMemo(() => new Map(initialAgents.map((agent) => [agent.id, agent])), [initialAgents])
  const datasetsById = useMemo(() => new Map(initialDatasets.map((dataset) => [dataset.id, dataset])), [initialDatasets])
  const stepsByRun = useMemo(() => {
    const map = new Map<string, MonitoringStep[]>()
    for (const step of steps) map.set(step.agent_run_id, [...(map.get(step.agent_run_id) ?? []), step])
    for (const value of map.values()) value.sort((a, b) => a.step_order - b.step_order)
    return map
  }, [steps])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const supabase = createClient()
    const { data: nextRuns, error: runsError } = await supabase
      .schema('agent')
      .from('agent_runs')
      .select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!runsError && nextRuns) {
      const typedRuns = nextRuns as MonitoringRun[]
      setRuns(typedRuns)
      const runIds = typedRuns.map((run) => run.id)
      if (runIds.length) {
        const { data: nextSteps, error: stepsError } = await supabase
          .schema('agent')
          .from('agent_run_steps')
          .select('id, agent_run_id, step_name, step_order, status, attempt, started_at, completed_at, error_code, error_message')
          .in('agent_run_id', runIds)
          .order('step_order')
        if (!stepsError && nextSteps) setSteps(nextSteps as MonitoringStep[])
      } else {
        setSteps([])
      }
      setLastUpdated(new Date())
    }
    setRefreshing(false)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(refresh, 3000)
    return () => window.clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    if (selectedRunId && runs.some((run) => run.id === selectedRunId)) return
    setSelectedRunId(runs[0]?.id ?? null)
  }, [runs, selectedRunId])

  const filteredRuns = useMemo(() => statusFilter === 'ALL' ? runs : runs.filter((run) => run.status === statusFilter), [runs, statusFilter])
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null
  const selectedSteps = selectedRun ? stepsByRun.get(selectedRun.id) ?? [] : []
  const selectedProgress = progress(selectedSteps)
  const activeCount = runs.filter((run) => ACTIVE_STATUSES.has(run.status)).length
  const succeededCount = runs.filter((run) => ['SUCCEEDED', 'COMPLETED'].includes(run.status)).length
  const failedCount = runs.filter((run) => run.status === 'FAILED').length

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-4">
        {[
          ['Active', activeCount],
          ['Completed', succeededCount],
          ['Failed', failedCount],
          ['Showing', filteredRuns.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <label className="text-sm font-medium" htmlFor="status-filter">Status</label>
        <select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="ALL">All</option>
          <option value="RUNNING">Running</option>
          <option value="QUEUED">Queued</option>
          <option value="SUCCEEDED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>
        <button type="button" onClick={refresh} disabled={refreshing} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
        <span className="ml-auto text-xs text-muted-foreground">Auto refresh: 3s · Updated {lastUpdated.toLocaleTimeString()}</span>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-xl border">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Jobs</h2>
            <p className="mt-1 text-xs text-muted-foreground">Authenticated runs visible to your project memberships.</p>
          </div>
          {filteredRuns.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No jobs match the selected filter.</p>
          ) : (
            <div className="divide-y">
              {filteredRuns.map((run) => {
                const agent = agentsById.get(run.agent_definition_id)
                const dataset = run.dataset_id ? datasetsById.get(run.dataset_id) : undefined
                const runProgress = progress(stepsByRun.get(run.id) ?? [])
                const selected = run.id === selectedRunId
                return (
                  <button key={run.id} type="button" onClick={() => setSelectedRunId(run.id)} className={`block w-full p-5 text-left hover:bg-muted/40 ${selected ? 'bg-muted/30' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{agent ? `${agent.name} v${agent.version}` : 'Agent run'}</p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{dataset?.name ?? 'Dataset unavailable'}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-xs ${statusClass(run.status)}`}>{run.status}</span>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${runProgress.percent}%` }} /></div>
                      <span className="w-28 text-right text-xs text-muted-foreground">{runProgress.label}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{duration(run)}</span>
                      <span>{new Date(run.created_at).toLocaleString()}</span>
                      <span className="font-mono">{run.id.slice(0, 8)}…</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border">
          {!selectedRun ? (
            <div className="p-6 text-sm text-muted-foreground">Select a job to inspect its execution details.</div>
          ) : (
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Job detail</p>
                  <h2 className="mt-1 font-semibold">{agentsById.get(selectedRun.agent_definition_id)?.name ?? 'Agent run'}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Run {selectedRun.id}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-xs ${statusClass(selectedRun.status)}`}>{selectedRun.status}</span>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Execution progress</span>
                  <span className="text-muted-foreground">{selectedProgress.label}</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${selectedProgress.percent}%` }} /></div>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-muted-foreground">Dataset</dt><dd className="mt-1">{selectedRun.dataset_id ? datasetsById.get(selectedRun.dataset_id)?.name ?? selectedRun.dataset_id : 'Unavailable'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Duration</dt><dd className="mt-1">{duration(selectedRun)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Started</dt><dd className="mt-1">{selectedRun.started_at ? new Date(selectedRun.started_at).toLocaleString() : 'Not started'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Correlation</dt><dd className="mt-1 font-mono text-xs">{selectedRun.id.slice(0, 12)}…</dd></div>
              </dl>

              {selectedRun.error_message && (
                <div className="mt-6 rounded-lg border border-red-300 p-4 text-sm">
                  <p className="font-medium text-red-700">Execution error</p>
                  <p className="mt-1 text-muted-foreground">{selectedRun.error_message}</p>
                  {selectedRun.error_code && <p className="mt-2 text-xs text-muted-foreground">Code: {selectedRun.error_code}</p>}
                </div>
              )}

              <div className="mt-7">
                <h3 className="text-sm font-medium">Execution steps</h3>
                {selectedSteps.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No execution steps recorded yet.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {selectedSteps.map((step) => (
                      <li key={step.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">{step.step_order}.</span>
                            <span className="truncate text-sm font-medium">{step.step_name}</span>
                          </div>
                          <span className={`rounded-full border px-2 py-1 text-xs ${statusClass(step.status)}`}>{step.status}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>Attempt {step.attempt}</span>
                          {step.started_at && <span>Started {new Date(step.started_at).toLocaleTimeString()}</span>}
                          {step.completed_at && <span>Completed {new Date(step.completed_at).toLocaleTimeString()}</span>}
                        </div>
                        {step.error_message && <p className="mt-2 text-xs text-red-700">{step.error_message}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">Monitoring is scoped by the same authenticated project membership policies used by agent execution. Browser access uses the publishable Supabase client only.</p>
    </div>
  )
}
