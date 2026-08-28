'use client'

import { useMemo } from 'react'

type Run = {
  id: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
}

type Step = {
  agent_run_id: string
  status: string
  started_at: string | null
  completed_at: string | null
}

const ACTIVE = new Set(['RUNNING', 'QUEUED', 'PENDING', 'WAITING', 'CREATED'])
const COMPLETE = new Set(['SUCCEEDED', 'COMPLETED'])
const STALE_MS = 60 * 60 * 1000

function ageMs(run: Run, now: number) {
  return Math.max(0, now - new Date(run.started_at ?? run.created_at).getTime())
}

function formatAge(ms: number) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export function JobHealth({ runs, steps }: { runs: Run[]; steps: Step[] }) {
  const attention = useMemo(() => {
    const now = Date.now()
    const stepsByRun = new Map<string, Step[]>()
    for (const step of steps) stepsByRun.set(step.agent_run_id, [...(stepsByRun.get(step.agent_run_id) ?? []), step])

    return runs.flatMap((run) => {
      if (!ACTIVE.has(run.status)) return []
      const runSteps = stepsByRun.get(run.id) ?? []
      const completed = runSteps.filter((step) => COMPLETE.has(step.status)).length
      const allStepsComplete = runSteps.length > 0 && completed === runSteps.length
      const age = ageMs(run, now)
      if (allStepsComplete) return [{ run, severity: 'critical', title: 'Completion transition appears stuck', detail: 'All persisted steps are complete, but the agent run is still active.' }]
      if (age >= STALE_MS) return [{ run, severity: 'warning', title: 'Long running execution', detail: `This job has been active for ${formatAge(age)}.` }]
      return []
    })
  }, [runs, steps])

  if (!attention.length) return null

  return <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-sm dark:bg-amber-900/40">!</span><h2 className="font-semibold">Attention required</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">The monitor detected executions that may need investigation.</p>
      </div>
      <span className="rounded-full border border-amber-300 px-2.5 py-1 text-xs font-medium">{attention.length} flagged</span>
    </div>
    <div className="mt-4 grid gap-3">
      {attention.map(({ run, severity, title, detail }) => <div key={run.id} className="flex flex-col gap-3 rounded-xl border bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} /><p className="font-medium">{title}</p></div><p className="mt-1 text-xs text-muted-foreground">{detail}</p><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">Run {run.id}</p></div>
        <a href={`/monitoring?run=${encodeURIComponent(run.id)}#job-logs`} className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">Inspect diagnostics</a>
      </div>)}
    </div>
  </section>
}
