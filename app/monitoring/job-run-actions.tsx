'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type EffectiveAction = {
  key: 'EXECUTE' | 'RETRY' | 'CANCEL' | 'APPROVE' | 'ADMIN'
  capability: string
  authorized: boolean
  stateEligible: boolean
  available: boolean
  mode: 'MUTATION' | 'NAVIGATION'
  href: string | null
  endpoint: string | null
  reason: string | null
}

export function JobRunActions({ runId, onCancelled }: { runId: string | null; onCancelled?: () => void }) {
  const [actions, setActions] = useState<EffectiveAction[]>([])
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!runId) { setActions([]); return }
    let active = true
    setLoading(true)
    setMessage(null)
    fetch(`/api/monitoring/runs/${encodeURIComponent(runId)}/actions`, { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? 'Unable to resolve run actions.')
        if (active) setActions(payload.actions ?? [])
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Unable to resolve run actions.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [runId])

  async function invoke(action: EffectiveAction) {
    if (!action.available || action.mode !== 'MUTATION' || !action.endpoint) return
    if (action.key === 'CANCEL' && !window.confirm('Cancel this governed execution?')) return
    setMutating(action.key)
    setMessage(null)
    try {
      const response = await fetch(action.endpoint, { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? `Unable to perform ${action.key.toLowerCase()}.`)
      setMessage(`${action.key} completed.`)
      onCancelled?.()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Run action failed.')
    } finally {
      setMutating(null)
    }
  }

  if (!runId) return null
  return <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#061426] p-4" aria-label="Governed run actions">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/55">Deterministic capabilities</p>
        <h3 className="mt-1 text-sm font-bold text-white">Governed run actions</h3>
      </div>
      <span className="text-[10px] text-slate-500">{loading ? 'Resolving current authorization…' : 'Server-authoritative'}</span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map(action => action.mode === 'NAVIGATION' && action.href && action.available
        ? <Link key={action.key} href={action.href} title={action.capability} className="rounded-xl border border-cyan-300/30 bg-cyan-300/8 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-300/12">{action.key}</Link>
        : <button key={action.key} type="button" disabled={!action.available || action.mode !== 'MUTATION' || mutating !== null} onClick={() => invoke(action)} title={action.reason ?? action.capability} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-300 enabled:hover:border-cyan-300/30 enabled:hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40">
            {mutating === action.key ? `${action.key}…` : action.key}
          </button>)}
    </div>
    <p className="mt-3 text-[10px] leading-4 text-slate-500">Availability is recomputed from resource scope, the exact capability and the current durable run state. Navigation actions never execute a mutation by themselves.</p>
    {message ? <p className="mt-2 text-xs text-slate-300">{message}</p> : null}
  </section>
}
