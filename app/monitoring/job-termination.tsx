'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MonitoringAgent, MonitoringDataset, MonitoringRun } from './job-monitor'

const ACTIVE = new Set(['CREATED', 'RUNNING', 'QUEUED', 'WAITING', 'PENDING'])
const LONG_RUNNING_MS = 60 * 60 * 1000

function elapsed(run: MonitoringRun, now: number) {
  const start = new Date(run.started_at ?? run.created_at).getTime()
  const seconds = Math.max(0, Math.floor((now - start) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`
}

export function JobTermination({ initialRuns, initialAgents, initialDatasets }: { initialRuns: MonitoringRun[]; initialAgents: MonitoringAgent[]; initialDatasets: MonitoringDataset[] }) {
  const [runs, setRuns] = useState(initialRuns)
  const [now, setNow] = useState(() => Date.now())
  const [terminating, setTerminating] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const agents = useMemo(() => new Map(initialAgents.map((agent) => [agent.id, agent])), [initialAgents])
  const datasets = useMemo(() => new Map(initialDatasets.map((dataset) => [dataset.id, dataset])), [initialDatasets])

  const refreshRuns = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.schema('agent').from('agent_runs').select('id, agent_definition_id, project_id, dataset_id, dataset_version_id, status, created_at, started_at, completed_at, error_code, error_message').order('created_at', { ascending: false }).limit(50)
    if (!error && data) setRuns(data as MonitoringRun[])
  }, [])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    const refresh = window.setInterval(refreshRuns, 3000)
    return () => { window.clearInterval(clock); window.clearInterval(refresh) }
  }, [refreshRuns])

  const activeRuns = runs.filter((run) => ACTIVE.has(run.status)).sort((a, b) => {
    const aStart = new Date(a.started_at ?? a.created_at).getTime()
    const bStart = new Date(b.started_at ?? b.created_at).getTime()
    return aStart - bStart
  })
  const longRunning = activeRuns.filter((run) => now - new Date(run.started_at ?? run.created_at).getTime() >= LONG_RUNNING_MS)

  async function terminate(run: MonitoringRun) {
    const agent = agents.get(run.agent_definition_id)
    const dataset = run.dataset_id ? datasets.get(run.dataset_id) : null
    const label = `${agent?.name ?? 'Agent run'}${dataset ? ` on ${dataset.name}` : ''}`
    if (!window.confirm(`Terminate ${label}?\n\nThis will mark the agent run CANCELLED and update its active steps and profiling run in the database.`)) return

    setTerminating(run.id)
    setMessage(null)
    try {
      const response = await fetch(`/api/agents/runs/${run.id}/terminate`, { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to terminate job.')
      setRuns((current) => current.map((item) => item.id === run.id ? { ...item, status: 'CANCELLED', completed_at: payload.terminatedAt ?? new Date().toISOString(), error_code: 'TERMINATED_BY_USER', error_message: 'Terminated from Job Monitor.' } : item))
      setMessage('Job terminated. Run, steps, and profiling lifecycle state were persisted.')
      await refreshRuns()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to terminate job.')
    } finally {
      setTerminating(null)
    }
  }

  if (!activeRuns.length) return null

  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Active executions</h2>
            {longRunning.length > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{longRunning.length} long-running</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Terminate a job when it has stalled or exceeded an acceptable runtime.</p>
        </div>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </div>
      <div className="divide-y">
        {activeRuns.map((run) => {
          const agent = agents.get(run.agent_definition_id)
          const dataset = run.dataset_id ? datasets.get(run.dataset_id) : null
          const isLong = longRunning.some((item) => item.id === run.id)
          return (
            <div key={run.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{agent ? `${agent.name} v${agent.version}` : 'Agent execution'}</p>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{run.status}</span>
                  {isLong && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Over 1 hour</span>}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{dataset?.name ?? 'Dataset unavailable'} · Running {elapsed(run, now)}</p>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{run.id}</p>
              </div>
              <button type="button" onClick={() => terminate(run)} disabled={terminating !== null} className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                {terminating === run.id ? 'Terminating…' : 'Terminate job'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
