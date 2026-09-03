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
    setMessage('Validating source connectivity and schema…')
    try {
      const response = await fetch('/api/datasets/source/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceId }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Source validation failed.')
      if (payload.operational) setMessage('Source validated and is operational.')
      else setMessage(payload.validation?.errors?.join(' ') || 'Source is saved but not operational yet.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Source validation failed.')
      router.refresh()
    } finally { setBusy(false) }
  }

  const configured = String(status).toUpperCase() === 'CONFIGURED'
  return <div className="mt-3 flex flex-wrap items-center gap-3">
    <button type="button" onClick={() => void validate()} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Validating…' : configured ? 'Validate & activate' : 'Revalidate'}</button>
    {message ? <span className="text-xs text-muted-foreground" role="status">{message}</span> : null}
  </div>
}
