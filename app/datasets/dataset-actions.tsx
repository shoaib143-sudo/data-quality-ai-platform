'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function DatasetActions({ projectId, datasetVersionId, agentDefinitionId, ready }: { projectId: string; datasetVersionId: string; agentDefinitionId: string | null; ready: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function runProfiling() {
    if (!ready || !agentDefinitionId || busy) return
    setBusy(true)
    setMessage('Running profiling, metrics, findings, and quality scoring…')
    try {
      const response = await fetch('/api/agents/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, datasetVersionId, agentDefinitionId }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Profiling execution failed.')
      const score = payload.result?.metrics?.score?.overall_score
      setMessage(`Profiling completed${typeof score === 'number' ? ` · quality score ${(score * 100).toFixed(1)}%` : ''}.`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Profiling execution failed.')
      router.refresh()
    } finally { setBusy(false) }
  }

  return <div className="mt-4 flex flex-wrap items-center gap-3">
    {ready && agentDefinitionId ? <button type="button" onClick={() => void runProfiling()} disabled={busy} className="rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Profiling…' : 'Run profiling'}</button> : null}
    {message ? <span className="text-xs text-muted-foreground" role="status">{message}</span> : null}
  </div>
}
