'use client'

import { CheckCircle2, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SourceActions({ projectId, sourceId, status }: { projectId: string; sourceId: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function validate() {
    if (busy) return
    setBusy(true)
    setMessage('Checking connection…')
    try {
      const response = await fetch('/api/datasets/source/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceId }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Connection check failed.')
      setMessage(payload.operational ? 'Connection is ready.' : payload.validation?.errors?.join(' ') || 'Connection needs setup.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection check failed.')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const ready = String(status).toUpperCase() === 'ACTIVE'
  return <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
    <button type="button" onClick={() => void validate()} disabled={busy} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${ready ? 'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
      {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      {busy ? 'Checking…' : ready ? 'Check connection' : 'Make ready'}
    </button>
    {message ? <span className="text-xs text-slate-500" role="status">{message}</span> : null}
  </div>
}
