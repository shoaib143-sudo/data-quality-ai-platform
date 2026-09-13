'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PlayCircle, ShieldAlert } from 'lucide-react'

type Availability = 'checking' | 'ready' | 'empty' | 'error'

export function QualityRunButton({ datasetVersionId, profileRunId }: { datasetVersionId: string; profileRunId?: string | null }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [availability, setAvailability] = useState<Availability>('checking')
  const [enabledRuleCount, setEnabledRuleCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function checkAvailability() {
      setAvailability('checking')
      setMessage('')
      try {
        const response = await fetch(`/api/data-quality/run?datasetVersionId=${encodeURIComponent(datasetVersionId)}`, {
          method: 'GET',
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? 'Unable to verify executable quality controls.')
        if (cancelled) return
        const count = Number(payload.enabledRuleCount ?? 0)
        setEnabledRuleCount(Number.isFinite(count) ? count : 0)
        setAvailability(payload.executable === true && count > 0 ? 'ready' : 'empty')
      } catch (error) {
        if (cancelled) return
        setAvailability('error')
        setMessage(error instanceof Error ? error.message : 'Unable to verify executable quality controls.')
      }
    }
    void checkAvailability()
    return () => { cancelled = true }
  }, [datasetVersionId])

  async function run() {
    if (availability !== 'ready') return
    setRunning(true)
    setMessage('')
    try {
      const idempotencyKey = crypto.randomUUID()
      const response = await fetch('/api/data-quality/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ datasetVersionId, profileRunId, idempotencyKey }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Data quality automation failed.')
      if (!payload.agentRunId) throw new Error('Data quality automation completed without a job identifier.')
      router.push(`/monitoring?run=${encodeURIComponent(payload.agentRunId)}#job-logs`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Data quality automation failed.')
    } finally {
      setRunning(false)
    }
  }

  const disabled = running || availability !== 'ready'
  const label = running
    ? 'Executing rules…'
    : availability === 'checking'
      ? 'Checking controls…'
      : availability === 'empty'
        ? 'No enabled controls'
        : availability === 'error'
          ? 'Controls unavailable'
          : `Run ${enabledRuleCount ?? ''} quality rule${enabledRuleCount === 1 ? '' : 's'}`

  return <div className="flex flex-wrap items-center gap-2">
    <button
      type="button"
      onClick={() => void run()}
      disabled={disabled}
      aria-disabled={disabled}
      title={availability === 'empty' ? 'No enabled quality rules apply to this dataset version.' : undefined}
      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300 disabled:opacity-80"
    >
      {running || availability === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : availability === 'ready' ? <PlayCircle className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
      {label}
    </button>
    {message ? <span className="max-w-sm text-xs font-medium text-rose-300">{message}</span> : null}
  </div>
}
