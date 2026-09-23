'use client'

import { useCallback, useEffect, useState } from 'react'

type ProjectOption = { id: string; name: string }
type Approval = {
  id: string
  projectId: string
  orchestratorRunId: string
  actionKey: string
  riskLevel: string
  status: string
  approvalAxis: 'BUSINESS' | 'GOVERNANCE' | null
  policyVersion: string
  orchestratorPolicyVersion: string
  autonomyMode: string
  executionFingerprint: string
  goalHash: string
  originalGoal: string
  requestedBy: string
  requester: string | null
  domain: string
  createdAt: string | null
  slaDueAt: string | null
  approvalExpiresAt: string | null
  canDecide: boolean
}

 function short(value: string, length = 18) {
  return value.length > length ? `${value.slice(0, length)}…` : value
}

export function OrchestratorApprovalInbox({ projects }: { projects: ProjectOption[] }) {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [goalByApproval, setGoalByApproval] = useState<Record<string,string>>({})
  const [confirmedByApproval, setConfirmedByApproval] = useState<Record<string, boolean>>({})
  const [commentByApproval, setCommentByApproval] = useState<Record<string,string>>({})
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState('')

  const refresh = useCallback(async () => {
    if (!projects.length) { setApprovals([]); return }
    try {
      const responses = await Promise.all(projects.map(async project => {
        const response = await fetch(`/api/agents/governance-orchestrator/approvals?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || `Unable to load approvals for ${project.name}.`)
        return Array.isArray(body.approvals) ? body.approvals as Approval[] : []
      }))
      const next = responses.flat().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      setApprovals(next)
      setGoalByApproval(current => {
        const copy = { ...current }
        for (const approval of next) {
          if (!Object.prototype.hasOwnProperty.call(copy, approval.id)) copy[approval.id] = approval.originalGoal || ''
        }
        return copy
      })
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load orchestrator approvals.')
    }
  }, [projects])

  useEffect(() => { void refresh() }, [refresh])

  async function decide(approval: Approval, decision: 'APPROVED' | 'REJECTED') {
    if (!approval.canDecide || busyId) return
    const comment = (commentByApproval[approval.id] ?? '').trim()
    if (!comment) { setMessage('Add an approval comment before approving or rejecting.'); return }
    if (decision === 'APPROVED' && !confirmedByApproval[approval.id]) {
      setMessage('Review the exact submitted goal and confirm it before approving.'); return
    }
    setBusyId(approval.id); setMessage('')
    try {
      const response = await fetch('/api/agents/governance-orchestrator/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: approval.projectId,
          approvalRequestId: approval.id,
          decision,
          comment,
          goal: goalByApproval[approval.id] ?? '',
        }),
      })
      const body = await response.json()
      if (!response.ok && response.status !== 202) throw new Error(body.error || 'Unable to resolve approval.')
      if (response.status === 202) {
        setMessage(body.message || 'One approval axis was recorded; another governed approval remains pending.')
      } else if (decision === 'REJECTED') {
        setMessage(`Run ${approval.orchestratorRunId} was rejected and remains fail-closed.`)
      } else {
        const status = body.runtime?.status ?? 'UNKNOWN'
        setMessage(`Approval recorded. Exact paused run ${approval.orchestratorRunId} resumed with status ${status}.`)
      }
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to resolve approval.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section id="guided-approvals" className="dn-workspace-panel scroll-mt-24 rounded-xl border p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Governed approvals</p>
          <h2 className="mt-1 text-lg font-semibold">Orchestrator approval inbox</h2>
          <p className="mt-1 text-sm text-muted-foreground">GUIDED step 5: An authorized reviewer checks the original goal and policy fingerprint, records a reason and approves or rejects. If two approval axes are required, both must be recorded. Approval resumes only the exact paused run, never certifies it.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={Boolean(busyId)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Refresh approvals</button>
      </div>

      {message && <p className="rounded-lg border p-3 text-sm" role="status" aria-live="polite">{message}</p>}
      {!approvals.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No pending Governance Orchestrator approvals are visible to you. If you just submitted a GUIDED run, refresh and check the run status. Do not invent an approval to advance.</p>}

      <div className="grid gap-4">
        {approvals.map(approval => {
          const project = projects.find(row => row.id === approval.projectId)
          return <article key={approval.id} className="rounded-xl border p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{project?.name ?? approval.projectId}</p>
                <p className="mt-1 text-xs text-muted-foreground">Run {approval.orchestratorRunId || 'unbound'} · {approval.status.replaceAll('_',' ')}</p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs">Risk: {approval.riskLevel}</span>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Requested action</dt><dd className="mt-1 font-medium">{approval.actionKey}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Approval axis</dt><dd className="mt-1 font-medium">{approval.approvalAxis ?? 'Ready to execute'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Requester</dt><dd className="mt-1 break-all">{approval.requester ?? short(approval.requestedBy)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Orchestrator policy snapshot</dt><dd className="mt-1">{approval.orchestratorPolicyVersion || 'Not recorded'} · {approval.autonomyMode || 'Unknown mode'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Agent approval policy</dt><dd className="mt-1">{approval.policyVersion || 'Unknown'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Evidence / execution fingerprint</dt><dd className="mt-1 font-mono text-xs break-all" title={approval.executionFingerprint}>{short(approval.executionFingerprint, 28)}</dd></div>
            </dl>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="text-sm">Original execution goal confirmation
                <textarea rows={3} readOnly value={goalByApproval[approval.id] ?? ''}
                  className="mt-1 w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm" />
                <span className="mt-1 block text-xs text-muted-foreground">This value comes from the persisted request, not a generic default. Server-side SHA-256 still checks it against the exact paused run before resuming.</span>
                <span className="mt-2 flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={confirmedByApproval[approval.id] ?? false}
                    onChange={event => setConfirmedByApproval(current => ({ ...current, [approval.id]: event.target.checked }))}
                    disabled={!approval.canDecide || !approval.originalGoal}
                    aria-label={`Confirm the original execution goal for request ${approval.id}`} />
                  I inspected the original goal, requested action, risk, policy and fingerprint.
                </span>
                {!approval.originalGoal && <span role="alert" className="mt-1 block text-xs text-amber-700 dark:text-amber-300">Original goal is unavailable. Do not approve until the source request is investigated.</span>
              </label>
              <label className="text-sm">Approval comment
                <textarea rows={3} value={commentByApproval[approval.id] ?? ''} onChange={event => setCommentByApproval(current => ({ ...current, [approval.id]: event.target.value }))}
                  placeholder="Why are you approving or rejecting this execution?" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                <span className="mt-1 block text-xs text-muted-foreground">The decision and comment are persisted to the governed approval audit trail.</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void decide(approval, 'APPROVED')} disabled={!approval.canDecide || !approval.originalGoal || !confirmedByApproval[approval.id] || busyId === approval.id}
                className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">{busyId === approval.id ? 'Resolving…' : 'Approve and resume'}</button>
              <button type="button" onClick={() => void decide(approval, 'REJECTED')} disabled={!approval.canDecide || busyId === approval.id}
                className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">Reject</button>
              {!approval.canDecide && <span className="self-center text-xs text-muted-foreground">You can inspect this request, but you do not hold the current approval authority. Runtime remains WAITING_APPROVAL.</span>}
            </div>
          </article>
        })}
      </div>
    </section>
  )
}
