'use client'

import { CheckCircle2, Play, RefreshCw } from 'lucide-react'
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
    } finally {
      setBusy(false)
    }
  }

  if (!ready || !agentDefinitionId) return null

  return <div className="mt-0 flex flex-wrap items-center justify-end gap-3">
    <button type="button" onClick={() => void runProfiling()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
      {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
      {busy ? 'Profiling…' : 'Run profiling'}
    </button>
    {message ? <span className="flex items-center gap-1 text-xs text-slate-500" role="status"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{message}</span> : null}
  </div>
}
