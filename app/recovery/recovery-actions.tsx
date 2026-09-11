'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type RecoveryAction = 'RETRY' | 'ACKNOWLEDGE' | 'ROLLBACK_REVIEW'

export function RecoveryActions({
  caseId,
  recommendedAction,
  status,
}: {
  caseId: string
  recommendedAction: string
  status: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState<RecoveryAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function requestAction(action: RecoveryAction) {
    setPending(action)
    setError(null)
    try {
      const response = await fetch(`/api/recovery/${caseId}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Recovery action failed.')
      router.refresh()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Recovery action failed.')
    } finally {
      setPending(null)
    }
  }

  const terminal = status === 'RESOLVED'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {recommendedAction === 'RETRY' && !terminal && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => requestAction('RETRY')}
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending === 'RETRY' ? 'Queueing…' : 'Approve one retry'}
          </button>
        )}
        {!terminal && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => requestAction('ROLLBACK_REVIEW')}
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending === 'ROLLBACK_REVIEW' ? 'Recording…' : 'Request rollback review'}
          </button>
        )}
        {!terminal && status !== 'ACKNOWLEDGED' && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => requestAction('ACKNOWLEDGE')}
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending === 'ACKNOWLEDGE' ? 'Recording…' : 'Acknowledge'}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Retry grants exactly one additional durable attempt. Rollback review records consent for human review only; it does not mutate source data or schemas.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
