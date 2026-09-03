'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react'

type Requirement = { key: string; label: string; description: string; source: 'user' | 'server' }
type Props = { connectionKind: string }

type Payload = {
  label: string
  requirements: Requirement[]
  checks: { bridgeConfigured: boolean; credentialConfigured: boolean }
  fetchedAt: string
}

export function ConnectionPrerequisites({ connectionKind }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/datasets/source/prerequisites?connectionKind=${encodeURIComponent(connectionKind)}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error ?? 'Unable to load prerequisites.')
        return body as Payload
      })
      .then(next => { if (!cancelled) setPayload(next) })
      .catch(nextError => { if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'Unable to load prerequisites.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [connectionKind])

  if (loading) return <div className="md:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-slate-600"><div className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin text-blue-600" />Loading prerequisites for this connection type…</div></div>
  if (error) return <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex items-center gap-2 font-semibold"><CircleAlert className="h-4 w-4" />Prerequisites unavailable</div><p className="mt-1 text-xs">{error}</p></div>
  if (!payload) return null

  const serverChecks = payload.requirements.filter(item => item.source === 'server')
  const userChecks = payload.requirements.filter(item => item.source === 'user')
  const serverReady = serverChecks.every(item => item.key === 'bridge' ? payload.checks.bridgeConfigured : item.key === 'credential_ref' ? payload.checks.credentialConfigured : true)

  return <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div><h3 className="text-sm font-semibold text-slate-900">Prerequisites for {payload.label}</h3><p className="mt-1 text-xs text-slate-500">These requirements update automatically when the connection type changes. Server checks are read live and never expose credentials.</p></div>
      <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${serverReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{serverReady ? 'Server setup ready' : 'Server setup required'}</span>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {[...serverChecks, ...userChecks].map(item => {
        const configured = item.key === 'bridge' ? payload.checks.bridgeConfigured : item.key === 'credential_ref' ? payload.checks.credentialConfigured : false
        return <div key={item.key} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <span className={`mt-0.5 shrink-0 ${item.source === 'server' && configured ? 'text-emerald-600' : item.source === 'server' ? 'text-amber-600' : 'text-blue-600'}`}>
            {item.source === 'server' && configured ? <CheckCircle2 className="h-4 w-4" /> : item.source === 'server' ? <CircleAlert className="h-4 w-4" /> : <span className="grid h-4 w-4 place-items-center rounded-full border border-blue-300 text-[9px] font-bold">•</span>}
          </span>
          <div className="min-w-0"><div className="text-xs font-semibold text-slate-800">{item.label} <span className="ml-1 font-normal text-slate-400">{item.source === 'server' ? 'server' : 'you'}</span></div><p className="mt-0.5 text-[11px] leading-5 text-slate-500">{item.description}</p></div>
        </div>
      })}
    </div>
  </div>
}
