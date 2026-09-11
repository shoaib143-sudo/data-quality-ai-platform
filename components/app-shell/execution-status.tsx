import type { ReactNode } from 'react'

const ACTIVE = new Set(['RUNNING', 'QUEUED', 'PENDING', 'WAITING', 'CREATED'])
const COMPLETE = new Set(['SUCCEEDED', 'COMPLETED', 'PASSED', 'RESOLVED'])
const FAILED = new Set(['FAILED', 'ERROR', 'CANCELLED', 'TERMINATED'])

export function executionStatusLabel(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === 'SUCCEEDED') return 'Completed'
  if (normalized === 'IN_PROGRESS') return 'In progress'
  return normalized.charAt(0) + normalized.slice(1).toLowerCase().replaceAll('_', ' ')
}

export function ExecutionStatusBadge({
  status,
  detail,
}: {
  status: string
  detail?: ReactNode
}) {
  const normalized = status.toUpperCase()
  const complete = COMPLETE.has(normalized)
  const failed = FAILED.has(normalized)
  const active = ACTIVE.has(normalized) || normalized === 'IN_PROGRESS'
  const classes = complete
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400'
    : failed
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400'
      : active
        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-400'
        : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300'
  const dot = complete ? 'bg-emerald-500' : failed ? 'bg-rose-500' : active ? 'bg-blue-500' : 'bg-slate-400'

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot} ${active ? 'animate-pulse motion-reduce:animate-none' : ''}`} aria-hidden="true" />
        {executionStatusLabel(normalized)}
      </span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </span>
  )
}
