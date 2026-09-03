'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SourceActions({ projectId, sourceId, status }: { projectId: string; sourceId: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function validate() {
    if (busy) return
    setBusy(true)
    setMessage('Checking connection and source availability…')
    try {
      const response = await fetch('/api/datasets/source/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceId }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Connection check failed.')
      setMessage(payload.operational ? 'Connection is ready.' : payload.validation?.errors?.join(' ') || 'Connection needs setup.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection check failed.')
      router.refresh()
    } finally { setBusy(false) }
  }

  const ready = String(status).toUpperCase() === 'ACTIVE'
  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" onClick={() => void validate()} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Checking…' : ready ? 'Check' : 'Make ready'}</button>
    {message ? <span className="text-xs text-muted-foreground" role="status">{message}</span> : null}
  </div>
}
