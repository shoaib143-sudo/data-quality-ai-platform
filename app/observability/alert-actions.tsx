'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

export function AlertActions({ alertId, currentStatus }: { alertId: string; currentStatus: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function update(status: 'ACKNOWLEDGED' | 'RESOLVED') {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/observability/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to update alert.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update alert.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    {currentStatus === 'OPEN' && <button type="button" onClick={() => void update('ACKNOWLEDGED')} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Acknowledge</button>}
    {currentStatus !== 'RESOLVED' && <button type="button" onClick={() => void update('RESOLVED')} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Resolve</button>}
    {error ? <span className="text-xs text-red-600">{error}</span> : null}
  </div>
}
