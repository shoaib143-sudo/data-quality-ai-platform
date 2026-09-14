'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ExternalApprovalDecisionForm({ token, axis, channel }: {
  token: string
  axis: 'BUSINESS' | 'GOVERNANCE'
  channel: 'EMAIL' | 'TEAMS'
}) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    const reason = comment.trim()
    if (!reason) {
      setMessage('A reason/comment is required for every approval or rejection.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/agent-approvals/external/${encodeURIComponent(token)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment: reason }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to record approval decision.')
      router.push('/approvals')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record approval decision.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {axis === 'BUSINESS' ? 'Business approval' : 'Governance approval'} · via {channel === 'EMAIL' ? 'Email' : 'Microsoft Teams'}
      </p>
      <textarea
        className="mt-4 w-full rounded-lg border bg-background px-3 py-2 text-sm"
        rows={4}
        value={comment}
        onChange={event => setComment(event.target.value.slice(0, 2000))}
        placeholder="Reason/comment is mandatory"
        disabled={busy}
      />
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => decide('APPROVED')} disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
        <button type="button" onClick={() => decide('REJECTED')} disabled={busy} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Reject</button>
      </div>
      {message ? <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{message}</p> : null}
    </section>
  )
}
