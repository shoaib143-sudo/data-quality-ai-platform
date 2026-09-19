'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ApprovalInboxItem } from '@/lib/governance/approval-inbox'

function value(record: Record<string, unknown>, key: string) {
  const raw = record[key]
  return raw === null || raw === undefined ? '' : String(raw)
}

export function ApprovalInbox({ items }: { items: ApprovalInboxItem[] }) {
  const router = useRouter()
  const [comments, setComments] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function executeRequestedAction(requestId: string) {
    const key = `${requestId}:EXECUTE`
    setBusy(key)
    setMessage(null)
    try {
      const response = await fetch(`/api/agent-approvals/${encodeURIComponent(requestId)}/execute`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to execute requested action.')
      const runId = payload.runId ?? payload.agentRunId ?? payload.agent_run_id
      router.push(payload.monitorUrl ?? (typeof runId === 'string' ? `/monitoring?run=${encodeURIComponent(runId)}` : '/monitoring'))
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to execute requested action.')
    } finally {
      setBusy(null)
    }
  }

  async function decide(requestId: string, axis: 'BUSINESS' | 'GOVERNANCE', decision: 'APPROVED' | 'REJECTED') {
    const key = `${requestId}:${axis}`
    const comment = (comments[key] ?? '').trim()
    if (!comment) {
      setMessage('A reason/comment is required for every approval or rejection.')
      return
    }
    setBusy(key)
    setMessage(null)
    try {
      const response = await fetch(`/api/agent-approvals/${encodeURIComponent(requestId)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ axis, decision, comment }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to record approval decision.')
      setComments(current => ({ ...current, [key]: '' }))
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record approval decision.')
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    return <section className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No approval requests are currently visible to you.</section>
  }

  return (
    <div className="space-y-4">
      {message ? <p role="status" className="rounded-xl border p-3 text-sm">{message}</p> : null}
      {items.map(item => {
        const request = item.request
        const requestId = value(request, 'id')
        const status = value(request, 'status')
        const terminal = ['EXECUTED','REJECTED','CANCELLED','INVALIDATED'].includes(status)
        return (
          <article key={requestId} className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border px-2 py-1 text-xs font-semibold">{value(request, 'risk_level')}</span>
                  <span className="rounded-full border px-2 py-1 text-xs">{status}</span>
                  <span className="rounded-full border px-2 py-1 text-xs">{value(request, 'environment')}</span>
                </div>
                <h2 className="mt-3 text-lg font-semibold">{value(request, 'action_key')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Domain: {value(request, 'domain')} · Criticality: {value(request, 'business_criticality')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Target: {value(request, 'target_type')} {value(request, 'target_id')}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{item.isRequester ? 'Requested by you' : 'Approval assigned to your governed scope'}</p>
                <p className="mt-1">SLA due {value(request, 'sla_due_at') ? new Date(value(request, 'sla_due_at')).toLocaleString() : 'N/A'}</p>
              </div>
            </div>

            {item.notifications.length ? (
              <div className="mt-4 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notification delivery</p>
                  <span className="text-xs text-muted-foreground">DataNexus remains authoritative</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(['DATANEXUS','EMAIL','TEAMS'] as const).map(channel => {
                    const rows = item.notifications.filter(notification => value(notification, 'channel') === channel)
                    const latest = rows[0]
                    if (!latest) return <div key={channel} className="rounded-xl border p-3 text-xs"><p className="font-semibold">{channel}</p><p className="mt-1 text-muted-foreground">No delivery record</p></div>
                    const deliveryStatus = value(latest, 'status')
                    const attempts = value(latest, 'attempt_count')
                    return <div key={channel} className="rounded-xl border p-3 text-xs">
                      <div className="flex items-center justify-between gap-2"><p className="font-semibold">{channel}</p><span className="rounded-full border px-2 py-0.5">{deliveryStatus}</span></div>
                      <p className="mt-1 text-muted-foreground">{value(latest, 'event_type')} · attempts {attempts || '0'}</p>
                      {value(latest, 'sent_at') ? <p className="mt-1 text-muted-foreground">Sent {new Date(value(latest, 'sent_at')).toLocaleString()}</p> : null}
                      {value(latest, 'next_attempt_at') && !['SENT','DEAD_LETTER'].includes(deliveryStatus) ? <p className="mt-1 text-muted-foreground">Next retry {new Date(value(latest, 'next_attempt_at')).toLocaleString()}</p> : null}
                      {deliveryStatus === 'DEAD_LETTER' ? <p className="mt-1 font-semibold text-amber-700 dark:text-amber-300">Delivery exhausted. Use DataNexus and investigate provider health.</p> : null}
                    </div>
                  })}
                </div>
              </div>
            ) : null}

            {item.decisions.length ? (
              <div className="mt-4 space-y-2 border-t pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision history</p>
                {item.decisions.map(decision => (
                  <div key={value(decision, 'id')} className="rounded-xl bg-muted/40 p-3 text-sm">
                    <span className="font-semibold">{value(decision, 'approval_axis')} · {value(decision, 'decision')}</span>
                    <span className="ml-2 text-xs text-muted-foreground">via {value(decision, 'channel')}</span>
                    <p className="mt-1 text-muted-foreground">{value(decision, 'comment')}</p>
                    {decision.delegated === true ? <p className="mt-1 text-xs text-muted-foreground">Delegated approval recorded on behalf of the delegator.</p> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {!terminal && item.canExecute && status === 'READY_TO_EXECUTE' ? (
              <div className="mt-5 border-t pt-5">
                <div className="rounded-xl border p-4">
                  <p className="font-semibold">Execution request ready</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You independently hold the runtime capability required for this requested action.
                  </p>
                  <button
                    type="button"
                    onClick={() => executeRequestedAction(requestId)}
                    disabled={busy === `${requestId}:EXECUTE`}
                    className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
                  >
                    {busy === `${requestId}:EXECUTE` ? 'Executing…' : 'Execute requested action'}
                  </button>
                </div>
              </div>
            ) : null}

            {!terminal && item.eligibleAxes.length ? (
              <div className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-2">
                {item.eligibleAxes.map(axis => {
                  const key = `${requestId}:${axis}`
                  return (
                    <div key={axis} className="rounded-xl border p-4">
                      <p className="font-semibold">{axis === 'BUSINESS' ? 'Business approval' : 'Governance approval'}</p>
                      <textarea
                        className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                        rows={3}
                        value={comments[key] ?? ''}
                        onChange={event => setComments(current => ({ ...current, [key]: event.target.value.slice(0, 2000) }))}
                        placeholder="Reason/comment is mandatory"
                        disabled={busy === key}
                      />
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => decide(requestId, axis, 'APPROVED')} disabled={busy === key} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
                        <button type="button" onClick={() => decide(requestId, axis, 'REJECTED')} disabled={busy === key} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Reject</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
