'use client'

import { useEffect, useMemo, useState } from 'react'

type Authority = {
  id: string
  user_id: string
  user_label: string
  project_id: string | null
  domain: string
  approval_axis: 'BUSINESS' | 'GOVERNANCE'
  starts_at: string
  ends_at: string | null
}

type Delegation = {
  id: string
  delegator_user_id: string
  delegate_user_id: string
  approval_axis: 'BUSINESS' | 'GOVERNANCE'
  domain: string
  project_id: string | null
  action_keys: string[]
  max_risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  starts_at: string
  ends_at: string | null
  active: boolean
  reason: string
  created_by: string
  created_at: string
  revoked_at: string | null
  canRevoke: boolean
}

type Workspace = {
  managedProjects: { id: string; name: string }[]
  authorities: Authority[]
  delegations: Delegation[]
  members: { userId: string; role: string; label: string }[]
  actionKeys: string[]
}

const emptyWorkspace: Workspace = { managedProjects: [], authorities: [], delegations: [], members: [], actionKeys: [] }

function toIso(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : value
}

function labelDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Permanent'
}

export function DelegationAdminManager() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [authorityId, setAuthorityId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [delegateUserId, setDelegateUserId] = useState('')
  const [actionKeys, setActionKeys] = useState<string[]>([])
  const [maxRisk, setMaxRisk] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [reason, setReason] = useState('')

  const projectNames = useMemo(() => new Map(workspace.managedProjects.map(project => [project.id, project.name])), [workspace.managedProjects])
  const memberNames = useMemo(() => new Map(workspace.members.map(member => [member.userId, member.label])), [workspace.members])
  const selectedAuthority = useMemo(() => workspace.authorities.find(authority => authority.id === authorityId) ?? null, [authorityId, workspace.authorities])
  const eligibleProjects = useMemo(() => {
    if (!selectedAuthority?.project_id) return workspace.managedProjects
    return workspace.managedProjects.filter(project => project.id === selectedAuthority.project_id)
  }, [selectedAuthority, workspace.managedProjects])

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/agent-approvals/delegations/admin', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load governance-admin delegation workspace.')
      setWorkspace(payload as Workspace)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load governance-admin delegation workspace.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (selectedAuthority?.project_id) setProjectId(selectedAuthority.project_id)
    else if (eligibleProjects.length === 1) setProjectId(eligibleProjects[0].id)
    else if (projectId && !eligibleProjects.some(project => project.id === projectId)) setProjectId('')
  }, [selectedAuthority, eligibleProjects, projectId])

  async function createDelegation() {
    setSaving(true)
    setStatus(null)
    try {
      const response = await fetch('/api/agent-approvals/delegations/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorityId,
          projectId,
          delegateUserId,
          actionKeys,
          maxRisk,
          startsAt: toIso(startsAt),
          endsAt: toIso(endsAt),
          reason,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to create governance-admin delegation.')
      setReason('')
      setActionKeys([])
      setEndsAt('')
      setStatus('Approval delegation created by Data Governance Admin.')
      await load()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to create governance-admin delegation.')
    } finally {
      setSaving(false)
    }
  }

  async function revoke(delegationId: string) {
    setStatus(null)
    try {
      const response = await fetch(`/api/agent-approvals/delegations/admin/${encodeURIComponent(delegationId)}/revoke`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to revoke governance-admin delegation.')
      setStatus('Approval delegation revoked by Data Governance Admin.')
      await load()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to revoke governance-admin delegation.')
    }
  }

  if (!loading && workspace.managedProjects.length === 0) return null

  return (
    <section className="rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-cyan-500">Data Governance administration</p>
          <h2 className="mt-1 text-xl font-bold">Managed delegations</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Governance administrators may manage delegations only inside projects where they hold admin authority. Delegates remain view-only and cannot alter delegated authority.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {workspace.managedProjects.length > 0 ? (
        <div className="mt-5 rounded-xl border p-4">
          <h3 className="font-semibold">Create managed delegation</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The direct approver remains the delegator of record. Your administrator identity is stored separately as the creator for audit provenance. Domain-wide authority must be narrowed to one managed project here.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-semibold">Direct authority</span>
              <select value={authorityId} onChange={event => setAuthorityId(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2">
                <option value="">Select authority</option>
                {workspace.authorities.map(authority => (
                  <option key={authority.id} value={authority.id}>
                    {authority.user_label} · {authority.approval_axis} · {authority.domain}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-semibold">Managed project</span>
              <select value={projectId} onChange={event => setProjectId(event.target.value)} disabled={Boolean(selectedAuthority?.project_id)} className="w-full rounded-lg border bg-background px-3 py-2 disabled:opacity-60">
                <option value="">Select project</option>
                {eligibleProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-semibold">Delegate individual</span>
              <select value={delegateUserId} onChange={event => setDelegateUserId(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2">
                <option value="">Select person</option>
                {workspace.members.filter(member => member.userId !== selectedAuthority?.user_id).map(member => (
                  <option key={member.userId} value={member.userId}>{member.label} · {member.role}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-semibold">Maximum risk</span>
              <select value={maxRisk} onChange={event => setMaxRisk(event.target.value as typeof maxRisk)} className="w-full rounded-lg border bg-background px-3 py-2">
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-semibold">Starts</span>
              <input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" />
              <span className="block text-xs text-muted-foreground">Blank means now.</span>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-semibold">Ends</span>
              <input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" />
              <span className="block text-xs text-muted-foreground">Blank is allowed only when the direct authority itself is permanent.</span>
            </label>
          </div>

          <fieldset className="mt-4 rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">Allowed actions</legend>
            <p className="mt-1 text-xs text-muted-foreground">Every delegated action is selected explicitly; administrator management does not widen the source authority.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {workspace.actionKeys.map(actionKey => (
                <label key={actionKey} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={actionKeys.includes(actionKey)}
                    onChange={event => setActionKeys(current => event.target.checked
                      ? [...new Set([...current, actionKey])]
                      : current.filter(value => value !== actionKey))}
                  />
                  <span>{actionKey}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 block space-y-2 text-sm">
            <span className="font-semibold">Administrative reason</span>
            <textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} className="w-full rounded-lg border bg-background px-3 py-2" />
          </label>

          <button
            type="button"
            onClick={() => void createDelegation()}
            disabled={saving || !authorityId || !projectId || !delegateUserId || actionKeys.length === 0 || !reason.trim()}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create managed delegation'}
          </button>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <h3 className="font-semibold">Delegations in managed projects</h3>
        {workspace.delegations.length === 0 ? <p className="text-sm text-muted-foreground">No project-scoped delegations are currently recorded in your managed projects.</p> : null}
        {workspace.delegations.map(delegation => (
          <article key={delegation.id} className="rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{delegation.approval_axis} · {delegation.domain}</p>
                <p className="mt-1 text-muted-foreground">
                  Delegator: {memberNames.get(delegation.delegator_user_id) ?? delegation.delegator_user_id}
                  {' · '}Delegate: {memberNames.get(delegation.delegate_user_id) ?? delegation.delegate_user_id}
                  {' · '}Project: {delegation.project_id ? projectNames.get(delegation.project_id) ?? delegation.project_id : 'Domain wide'}
                </p>
              </div>
              <span className="rounded-full border px-2 py-1 text-xs font-semibold">{delegation.active && !delegation.revoked_at ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
            <p className="mt-2 text-muted-foreground">Actions: {delegation.action_keys.join(', ')} · Max risk: {delegation.max_risk}</p>
            <p className="mt-1 text-muted-foreground">Window: {labelDate(delegation.starts_at)} to {labelDate(delegation.ends_at)}</p>
            <p className="mt-1">{delegation.reason}</p>
            {delegation.canRevoke ? (
              <button type="button" onClick={() => void revoke(delegation.id)} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold">
                Revoke as Data Governance Admin
              </button>
            ) : null}
          </article>
        ))}
      </div>

      {status ? <p role="status" className="mt-4 text-sm text-muted-foreground">{status}</p> : null}
    </section>
  )
}
