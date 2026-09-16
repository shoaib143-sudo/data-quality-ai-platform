'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type ApprovalAxis = 'BUSINESS' | 'GOVERNANCE'
type Workspace = {
  managedProjects: { id: string; name: string }[]
  managedDomains: { projectId: string; domain: string }[]
  members: { userId: string; role: string; label: string }[]
  actionKeys: string[]
}

const emptyWorkspace: Workspace = { managedProjects: [], managedDomains: [], members: [], actionKeys: [] }

function toIso(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : value
}

export function DirectAuthorityAdminManager() {
  const router = useRouter()
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [projectId, setProjectId] = useState('')
  const [domain, setDomain] = useState('')
  const [approverUserId, setApproverUserId] = useState('')
  const [approvalAxis, setApprovalAxis] = useState<ApprovalAxis>('BUSINESS')
  const [actionKeys, setActionKeys] = useState<string[]>([])
  const [maxRisk, setMaxRisk] = useState<RiskLevel>('HIGH')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [reason, setReason] = useState('')

  const projects = workspace.managedProjects
  const domains = useMemo(
    () => workspace.managedDomains.filter(row => row.projectId === projectId).map(row => row.domain),
    [workspace.managedDomains, projectId],
  )

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/agent-approvals/delegations/admin', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load authority administration workspace.')
      setWorkspace(payload as Workspace)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load authority administration workspace.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (projects.length === 1 && !projectId) setProjectId(projects[0].id)
  }, [projects, projectId])
  useEffect(() => {
    if (domain && !domains.includes(domain)) setDomain('')
    if (domains.length === 1 && !domain) setDomain(domains[0])
  }, [domains, domain])

  async function assign() {
    setSaving(true)
    setStatus(null)
    try {
      const response = await fetch('/api/agent-approvals/authorities/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          domain,
          approverUserId,
          approvalAxis,
          actionKeys,
          maxRisk,
          startsAt: toIso(startsAt),
          endsAt: toIso(endsAt),
          reason,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to assign direct approval authority.')
      setReason('')
      setActionKeys([])
      setEndsAt('')
      setStatus(`${approvalAxis} approval authority assigned. Coverage refreshed.`)
      await load()
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to assign direct approval authority.')
    } finally {
      setSaving(false)
    }
  }

  if (!loading && projects.length === 0) return null

  return (
    <section className="rounded-xl border p-5">
      <div>
        <p className="text-sm font-semibold text-cyan-500">Data Governance administration</p>
        <h2 className="mt-1 text-xl font-bold">Assign direct approval authority</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Use this only to establish missing Business or Governance coverage. Assignments are project and domain scoped, require an explicit action allowlist and risk ceiling, and enforce separation of duties server-side.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-semibold">Managed project</span>
          <select value={projectId} onChange={event => setProjectId(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2">
            <option value="">Select project</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-semibold">Governed domain</span>
          <select value={domain} onChange={event => setDomain(event.target.value)} disabled={!projectId} className="w-full rounded-lg border bg-background px-3 py-2 disabled:opacity-60">
            <option value="">Select domain</option>
            {domains.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-semibold">Approver individual</span>
          <select value={approverUserId} onChange={event => setApproverUserId(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2">
            <option value="">Select person</option>
            {workspace.members.map(member => <option key={member.userId} value={member.userId}>{member.label} · {member.role}</option>)}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-semibold">Approval axis</span>
          <select value={approvalAxis} onChange={event => setApprovalAxis(event.target.value as ApprovalAxis)} className="w-full rounded-lg border bg-background px-3 py-2">
            <option value="BUSINESS">BUSINESS</option>
            <option value="GOVERNANCE">GOVERNANCE</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-semibold">Maximum risk</span>
          <select value={maxRisk} onChange={event => setMaxRisk(event.target.value as RiskLevel)} className="w-full rounded-lg border bg-background px-3 py-2">
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
          <span className="block text-xs text-muted-foreground">Blank means no scheduled expiry.</span>
        </label>
      </div>

      <fieldset className="mt-4 rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">Allowed actions</legend>
        <p className="mt-1 text-xs text-muted-foreground">No wildcard grant is created. At least one governed action must be selected explicitly.</p>
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
        <span className="font-semibold">Assignment reason</span>
        <textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} className="w-full rounded-lg border bg-background px-3 py-2" />
      </label>

      <button
        type="button"
        onClick={() => void assign()}
        disabled={saving || !projectId || !domain || !approverUserId || actionKeys.length === 0 || !reason.trim()}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving ? 'Assigning…' : 'Assign direct authority'}
      </button>

      {status ? <p role="status" className="mt-4 text-sm text-muted-foreground">{status}</p> : null}
    </section>
  )
}
