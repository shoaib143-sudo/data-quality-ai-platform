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
  initialNow: string
  userId: string
}

const ACTIVE_STATUSES = new Set(['RUNNING', 'QUEUED', 'PENDING'])
const COMPLETED_STATUSES = new Set(['SUCCEEDED', 'COMPLETED'])

const DATE_FORMATTER = new Intl.DateTimeFormat('en-SG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Singapore',
})

const TIME_FORMATTER = new Intl.DateTimeFormat('en-SG', {
  timeStyle: 'medium',
  timeZone: 'Asia/Singapore',
})

function formatDate(value: string) {
  return DATE_FORMATTER.format(new Date(value))
}

function formatTime(value: string) {
  return TIME_FORMATTER.format(new Date(value))
}

function statusTone(status: string) {
  if (COMPLETED_STATUSES.has(status)) return 'success'
  if (status === 'FAILED') return 'danger'
  if (ACTIVE_STATUSES.has(status)) return 'active'
  return 'neutral'
}

function statusLabel(status: string) {
  if (status === 'SUCCEEDED') return 'Completed'
  if (status === 'RUNNING') return 'Running'
  if (status === 'QUEUED') return 'Queued'
  if (status === 'PENDING') return 'Pending'
  return status.charAt(0) + status.slice(1).toLowerCase()
}

function duration(run: MonitoringRun, now: Date) {
  const start = run.started_at ?? run.created_at
  const end = run.completed_at ? new Date(run.completed_at) : now
  const seconds = Math.max(0, Math.floor((end.getTime() - new Date(start).getTime()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${remaining}s`
  return `${remaining}s`
}

function progress(steps: MonitoringStep[]) {
  if (!steps.length) return { label: 'Initializing', percent: 0 }
  const completed = steps.filter((step) => COMPLETED_STATUSES.has(step.status)).length
  const failed = steps.some((step) => step.status === 'FAILED')
  const running = steps.some((step) => ACTIVE_STATUSES.has(step.status))
  const percent = Math.round((completed / steps.length) * 100)
  if (failed) return { label: 'Execution failed', percent }
  if (running) return { label: `${completed} of ${steps.length} steps`, percent: Math.max(percent, 5) }
  return { label: `${completed} of ${steps.length} steps`, percent: 100 }
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status)
  const classes = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400',
    danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400',
    active: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-400',
    neutral: 'border-border bg-muted/50 text-muted-foreground',
  }[tone]

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === 'success' ? 'bg-emerald-500' : tone === 'danger' ? 'bg-red-500' : tone === 'active' ? 'bg-blue-500' : 'bg-muted-foreground'}`} />
      {statusLabel(status)}
    </span>
  )
}

function MetricCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: 'active' | 'success' | 'danger' | 'neutral' }) {
  const dot = {
    active: 'bg-blue-500',
    success: 'bg-emerald-500',
    danger: 'bg-red-500',
    neutral: 'bg-muted-foreground',
  }[tone]

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

export function JobMonitor({ initialRuns, initialAgents, initialDatasets, initialSteps, initialNow, userId }: Props) {
  const [runs, setRuns] = useState(initialRuns)
  const [steps, setSteps] = useState(initialSteps)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRuns[0]?.id ?? null)
  const [lastUpdated, setLastUpdated] = useState(() => new Date(initialNow))
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
  const activeRuns = runs.filter((run) => ACTIVE_STATUSES.has(run.status))
  const activeCount = activeRuns.length
  const succeededCount = runs.filter((run) => COMPLETED_STATUSES.has(run.status)).length
  const failedCount = runs.filter((run) => run.status === 'FAILED').length
  const queuedCount = runs.filter((run) => run.status === 'QUEUED' || run.status === 'PENDING').length

  const activeRun = activeRuns[0]
  const activeSteps = activeRun ? stepsByRun.get(activeRun.id) ?? [] : []
  const activeProgress = activeRun ? progress(activeSteps) : null
  const activeAgent = activeRun ? agentsById.get(activeRun.agent_definition_id) : null
  const activeDataset = activeRun?.dataset_id ? datasetsById.get(activeRun.dataset_id) : null

  return (
    <div className="space-y-7">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active jobs" value={activeCount} detail={activeCount ? 'Execution in progress' : 'Nothing running right now'} tone="active" />
        <MetricCard label="Queued" value={queuedCount} detail="Waiting to execute" tone="neutral" />
        <MetricCard label="Completed" value={succeededCount} detail="Successful executions" tone="success" />
        <MetricCard label="Failed" value={failedCount} detail="Requires attention" tone="danger" />
      </section>

      {activeRun && activeProgress && (
        <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-blue-500" />
          <div className="p-6 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" /></span>
                  Active execution
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold tracking-tight">{activeAgent ? `${activeAgent.name} v${activeAgent.version}` : 'Agent execution'}</h2>
                  <StatusBadge status={activeRun.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{activeDataset?.name ?? 'Dataset unavailable'}</p>
              </div>
              <div className="text-left lg:text-right">
                <p className="text-3xl font-semibold tracking-tight">{activeProgress.percent}%</p>
                <p className="text-xs text-muted-foreground">{activeProgress.label}</p>
              </div>
            </div>

            <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${activeProgress.percent}%` }} />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              {activeSteps.length ? activeSteps.map((step) => {
                const complete = COMPLETED_STATUSES.has(step.status)
                const running = ACTIVE_STATUSES.has(step.status)
                return (
                  <div key={step.id} className="flex items-center gap-2 text-sm">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${complete ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : running ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' : 'bg-muted text-muted-foreground'}`}>
                      {complete ? '✓' : running ? '•' : '○'}
                    </span>
                    <span className={running ? 'font-medium' : 'text-muted-foreground'}>{step.step_name}</span>
                  </div>
                )
              }) : <span className="text-sm text-muted-foreground">Preparing execution steps…</span>}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
              <span>Running for {duration(activeRun, lastUpdated)}</span>
              <span>Started {activeRun.started_at ? formatTime(activeRun.started_at) : 'Not started'}</span>
              <button type="button" onClick={() => setSelectedRunId(activeRun.id)} className="font-medium text-foreground underline underline-offset-4">View execution details</button>
            </div>
          </div>
        </section>
      )}

      {!activeRun && (
        <section className="rounded-2xl border border-dashed bg-card p-7 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-lg">✓</div>
            <div>
              <h2 className="font-semibold">All clear</h2>
              <p className="mt-1 text-sm text-muted-foreground">There are no active executions right now.</p>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Recent activity</h2>
            <p className="mt-1 text-xs text-muted-foreground">Authenticated jobs visible to your project memberships.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="ALL">All statuses</option>
              <option value="RUNNING">Running</option>
              <option value="QUEUED">Queued</option>
              <option value="SUCCEEDED">Completed</option>
              <option value="FAILED">Failed</option>
            </select>
            <button type="button" onClick={refresh} disabled={refreshing} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <span className="text-xs text-muted-foreground">Updated {formatTime(lastUpdated.toISOString())}</span>
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium">No jobs found</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another status filter or start an agent run.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredRuns.map((run) => {
              const agent = agentsById.get(run.agent_definition_id)
              const dataset = run.dataset_id ? datasetsById.get(run.dataset_id) : undefined
              const runProgress = progress(stepsByRun.get(run.id) ?? [])
              const selected = run.id === selectedRunId
              return (
                <button key={run.id} type="button" onClick={() => setSelectedRunId(run.id)} className={`group block w-full p-5 text-left transition hover:bg-muted/40 ${selected ? 'bg-muted/30' : ''}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{agent ? `${agent.name} v${agent.version}` : 'Agent run'}</p>
                        <StatusBadge status={run.status} />
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{dataset?.name ?? 'Dataset unavailable'}</p>
                    </div>
                    <div className="w-full lg:w-56">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{runProgress.label}</span>
                        <span>{runProgress.percent}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${runProgress.percent}%` }} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground lg:w-48 lg:justify-end">
                      <span>{duration(run, lastUpdated)}</span>
                      <span>{formatDate(run.created_at)}</span>
                      <span className="font-mono">{run.id.slice(0, 8)}…</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {selectedRun && (
        <section className="rounded-2xl border bg-card shadow-sm">
          <div className="border-b p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Execution details</p>
                <h2 className="mt-2 text-xl font-semibold">{agentsById.get(selectedRun.agent_definition_id)?.name ?? 'Agent run'}</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{selectedRun.id}</p>
              </div>
              <StatusBadge status={selectedRun.status} />
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-sm font-medium">Run summary</p>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-muted-foreground">Dataset</dt><dd className="mt-1 font-medium">{selectedRun.dataset_id ? datasetsById.get(selectedRun.dataset_id)?.name ?? 'Unavailable' : 'Unavailable'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Duration</dt><dd className="mt-1 font-medium">{duration(selectedRun, lastUpdated)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Started</dt><dd className="mt-1 font-medium">{selectedRun.started_at ? formatDate(selectedRun.started_at) : 'Not started'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Steps</dt><dd className="mt-1 font-medium">{selectedSteps.length}</dd></div>
              </dl>

              {selectedRun.error_message && (
                <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900/50 dark:bg-red-950/20">
                  <p className="font-medium text-red-700 dark:text-red-400">Execution error</p>
                  <p className="mt-1 text-muted-foreground">{selectedRun.error_message}</p>
                  {selectedRun.error_code && <p className="mt-2 text-xs text-muted-foreground">Code: {selectedRun.error_code}</p>}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Execution timeline</p>
                <span className="text-xs text-muted-foreground">{selectedProgress.percent}%</span>
              </div>
              <div className="mt-4 space-y-1">
                {selectedSteps.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No execution steps recorded yet.</div>
                ) : selectedSteps.map((step, index) => {
                  const complete = COMPLETED_STATUSES.has(step.status)
                  const running = ACTIVE_STATUSES.has(step.status)
                  const failed = step.status === 'FAILED'
                  return (
                    <div key={step.id} className="flex gap-4">
                      <div className="flex w-7 flex-col items-center">
                        <span className={`z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400' : failed ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400' : running ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400' : 'bg-muted text-muted-foreground'}`}>{complete ? '✓' : failed ? '!' : index + 1}</span>
                        {index < selectedSteps.length - 1 && <span className="w-px flex-1 bg-border" />}
                      </div>
                      <div className="mb-3 min-w-0 flex-1 rounded-xl border p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium">{step.step_name}</p>
                          <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(step.status)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>Attempt {step.attempt}</span>
                          {step.started_at && <span>Started {formatTime(step.started_at)}</span>}
                          {step.completed_at && <span>Completed {formatTime(step.completed_at)}</span>}
                        </div>
                        {step.error_message && <p className="mt-2 text-xs text-red-700 dark:text-red-400">{step.error_message}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">Monitoring is scoped by authenticated project membership policies. Browser access uses the publishable Supabase client only.</p>
      <span className="sr-only">User {userId}</span>
    </div>
  )
}
