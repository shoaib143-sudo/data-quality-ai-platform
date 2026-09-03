'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PlayCircle } from 'lucide-react'

export function QualityRunButton({ datasetVersionId, profileRunId }: { datasetVersionId: string; profileRunId?: string | null }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')

  async function run() {
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

  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => void run()} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
      {running ? 'Executing rules…' : 'Run quality rules'}
    </button>
    {message ? <span className="text-xs font-medium text-red-600">{message}</span> : null}
  </div>
}
