'use client'

import { useEffect, useMemo, useState } from 'react'

type Workspace = {
  projects: { id: string; name: string }[]
  datasets: { id: string; projectId: string; name: string; ownerUserId: string | null }[]
  members: { userId: string; role: string; label: string }[]
  grants: {
    id: string
    projectId: string
    resourceId: string
    userId: string
    userLabel: string
    effect: 'ALLOW' | 'DENY'
    active: boolean
    startsAt: string
    endsAt: string | null
    reason: string
    revokedAt: string | null
  }[]
}

const emptyWorkspace: Workspace = { projects: [], datasets: [], members: [], grants: [] }

function toIso(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : value
}

export function ResourceAccessManager() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [projectId, setProjectId] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [effect, setEffect] = useState<'ALLOW' | 'DENY'>('ALLOW')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<null | {
    currentEffectiveAccess: 'ALLOWED' | 'DENIED'
    proposedEffectiveAccess: 'ALLOWED' | 'DENIED'
    proposedEffect: 'ALLOW' | 'DENY'
    datasetOwner: boolean
    replacementRequired: boolean
    existingEffect: string | null
    warning: string
  }>(null)

  const projectNames = useMemo(() => new Map(workspace.projects.map(project => [project.id, project.name])), [workspace.projects])
  const datasetNames = useMemo(() => new Map(workspace.datasets.map(dataset => [dataset.id, dataset.name])), [workspace.datasets])
  const filteredDatasets = workspace.datasets.filter(dataset => !projectId || dataset.projectId === projectId)

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/resource-access', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load resource access.')
      setWorkspace(payload as Workspace)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load resource access.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (datasetId && !filteredDatasets.some(dataset => dataset.id === datasetId)) setDatasetId('')
  }, [projectId, datasetId, filteredDatasets])

  useEffect(() => {
    if (!projectId || !datasetId || !targetUserId) { setPreview(null); return }
    let active = true
    fetch('/api/resource-access/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, datasetId, targetUserId, effect }),
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? 'Unable to preview resource access.')
        if (active) setPreview(payload.preview ?? null)
      })
      .catch(error => { if (active) { setPreview(null); setStatus(error instanceof Error ? error.message : 'Unable to preview resource access.') } })
    return () => { active = false }
  }, [projectId, datasetId, targetUserId, effect])

  async function createGrant() {
    setSaving(true)
    setStatus(null)
    try {
      const response = await fetch('/api/resource-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          datasetId,
          targetUserId,
          effect,
          startsAt: toIso(startsAt),
          endsAt: toIso(endsAt),
          reason,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to create resource-access rule.')
      setReason('')
      setEndsAt('')
      setStatus(`${effect} rule created.`)
      await load()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to create resource-access rule.')
    } finally {
      setSaving(false)
    }
  }

  async function revoke(grantId: string) {
    setStatus(null)
    try {
      const response = await fetch(`/api/resource-access/${encodeURIComponent(grantId)}/revoke`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to revoke resource-access rule.')
      setStatus('Resource-access rule revoked.')
      await load()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to revoke resource-access rule.')
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">Create dataset access rule</h2>
        <p className="mt-2 text-sm text-slate-600">
          DENY always wins. Once any active ACL rule exists for a dataset, ordinary project members must have an explicit ALLOW unless they are the dataset owner or an effective steward. A DENY also overrides owner/steward access.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm"><span className="font-semibold">Project</span><select value={projectId} onChange={event => setProjectId(event.target.value)} className="w-full rounded-lg border px-3 py-2"><option value="">Select project</option>{workspace.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="space-y-2 text-sm"><span className="font-semibold">Dataset</span><select value={datasetId} onChange={event => setDatasetId(event.target.value)} className="w-full rounded-lg border px-3 py-2"><option value="">Select dataset</option>{filteredDatasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select></label>
          <label className="space-y-2 text-sm"><span className="font-semibold">Person</span><select value={targetUserId} onChange={event => setTargetUserId(event.target.value)} className="w-full rounded-lg border px-3 py-2"><option value="">Select person</option>{workspace.members.map(member => <option key={member.userId} value={member.userId}>{member.label} · {member.role}</option>)}</select></label>
          <label className="space-y-2 text-sm"><span className="font-semibold">Effect</span><select value={effect} onChange={event => setEffect(event.target.value as 'ALLOW' | 'DENY')} className="w-full rounded-lg border px-3 py-2"><option value="ALLOW">ALLOW</option><option value="DENY">DENY</option></select></label>
          <label className="space-y-2 text-sm"><span className="font-semibold">Starts</span><input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} className="w-full rounded-lg border px-3 py-2" /><span className="block text-xs text-slate-500">Blank means now.</span></label>
          <label className="space-y-2 text-sm"><span className="font-semibold">Ends</span><input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} className="w-full rounded-lg border px-3 py-2" /><span className="block text-xs text-slate-500">Blank means no scheduled expiry.</span></label>
        </div>
        <label className="mt-4 block space-y-2 text-sm"><span className="font-semibold">Reason</span><textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} className="w-full rounded-lg border px-3 py-2" /></label>
        {preview ? <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Effective-access preview</span>
            <span className="rounded-full border px-2 py-0.5 text-xs">Current: {preview.currentEffectiveAccess}</span>
            <span className="rounded-full border px-2 py-0.5 text-xs">Proposed: {preview.proposedEffectiveAccess}</span>
            {preview.datasetOwner ? <span className="rounded-full border px-2 py-0.5 text-xs">Dataset owner</span> : null}
          </div>
          <p className="mt-2 text-slate-600">{preview.warning}</p>
          {preview.replacementRequired ? <p className="mt-2 font-semibold text-amber-700">Revoke the existing {preview.existingEffect} rule before creating this rule.</p> : null}
          <p className="mt-2 text-xs text-slate-500">Preview is advisory. Server-side authorization and current ACL state are revalidated when the rule is committed.</p>
        </div> : null}
        <button type="button" onClick={() => void createGrant()} disabled={saving || !projectId || !datasetId || !targetUserId || !reason.trim() || preview?.replacementRequired === true} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : `Create ${effect} rule`}</button>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Recorded resource rules</h2><p className="mt-1 text-sm text-slate-600">Rules are scoped to projects you currently administer. Revocation retains provenance.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm font-semibold">{loading ? 'Refreshing…' : 'Refresh'}</button></div>
        <div className="mt-4 space-y-3">
          {workspace.grants.length === 0 ? <p className="text-sm text-slate-500">No resource-specific rules recorded.</p> : null}
          {workspace.grants.map(grant => <article key={grant.id} className="rounded-xl border p-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{grant.effect} · {datasetNames.get(grant.resourceId) ?? grant.resourceId}</p><p className="mt-1 text-slate-600">{grant.userLabel} · {projectNames.get(grant.projectId) ?? grant.projectId}</p></div><span className="rounded-full border px-2 py-1 text-xs font-semibold">{grant.active && !grant.revokedAt ? 'ACTIVE' : 'INACTIVE'}</span></div><p className="mt-2">{grant.reason}</p>{grant.active && !grant.revokedAt ? <button type="button" onClick={() => void revoke(grant.id)} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold">Revoke rule</button> : null}</article>)}
        </div>
      </section>
      {status ? <p role="status" className="text-sm text-slate-600">{status}</p> : null}
    </div>
  )
}
