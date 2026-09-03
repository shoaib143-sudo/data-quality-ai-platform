'use client'

import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type ValidationPayload = {
  errors?: string[]
  warnings?: string[]
}

function readinessMessage(payload: { error?: string; validation?: ValidationPayload; code?: string }) {
  const errors = payload.validation?.errors ?? []
  if (payload.code === 'JDBC_CREDENTIAL_REF_MISSING' || errors.some(error => error.includes('credential_ref'))) {
    return 'This saved connection needs its credentials configured. Reopen the connection setup, enter the credentials for this connection type, test the connection, and save it again.'
  }
  if (errors.some(error => error.includes('table name'))) {
    return 'Choose a schema and table for this connection, then check the connection again.'
  }
  if (errors.some(error => error.includes('source identifier'))) {
    return 'Choose a source target before making this connection ready.'
  }
  return errors.join(' ') || payload.error || 'Connection needs setup.'
}

export function SourceActions({ projectId, sourceId, status }: { projectId: string; sourceId: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)

  async function validate() {
    if (busy) return
    setBusy(true)
    setMessage('Checking connection…')
    setSetupRequired(false)
    try {
      const response = await fetch('/api/datasets/source/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceId }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const friendly = readinessMessage(payload)
        setSetupRequired(payload.code === 'JDBC_CREDENTIAL_REF_MISSING' || Boolean(payload.validation?.errors?.some((error: string) => error.includes('credential_ref'))))
        throw new Error(friendly)
      }
      const errors = payload.validation?.errors ?? []
      const needsSetup = !payload.operational || errors.length > 0
      setSetupRequired(needsSetup)
      setMessage(payload.operational ? 'Connection is ready and can be used for datasets and profiling.' : readinessMessage(payload))
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
    <div className="flex max-w-xl flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={() => void validate()} disabled={busy} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${ready ? 'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {busy ? 'Checking…' : ready ? 'Check connection' : 'Make ready'}
      </button>
      {message ? <span className={`inline-flex items-center gap-1.5 text-xs ${setupRequired ? 'text-amber-700' : 'text-slate-500'}`} role="status">{setupRequired ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : null}{message}</span> : null}
    </div>
  </div>
}
