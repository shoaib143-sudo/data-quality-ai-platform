'use client'

import { FormEvent, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Plus, ShieldCheck, UserRoundCheck, XCircle } from 'lucide-react'

type Project = { id: string; name: string; organization_id: string }
type Dataset = { id: string; project_id: string; name: string }
type Source = { id: string; project_id: string; name: string }
type CatalogAsset = { id: string; source_id: string; identity_key: string | null; asset_key: string; namespace: string | null; name: string; asset_type: string }
type Member = { organization_id: string; user_id: string; role: string }
type Assignment = {
  id: string
  project_id: string
  target_type: 'DATASET' | 'CATALOG_ASSET'
  dataset_id: string | null
  discovered_asset_id: string | null
  data_source_id: string | null
  catalog_identity_key: string | null
  target_locator: string | null
  user_id: string
  role: string
  accountability: string | null
  status: string
  origin: string
  target_state: string
  subject_state: string
  active: boolean
}
type Certification = { id: string; project_id: string; dataset_id: string; requested_by: string | null; assigned_to: string | null; status: string; decision_notes: string | null; requested_at: string }
type DatasetCoverage = { project_id: string; dataset_id: string; name: string; business_owner_count: number; data_steward_count: number; technical_owner_count: number; custodian_count: number; coverage_status: string }
type CatalogCoverage = { project_id: string; data_source_id: string; catalog_identity_key: string; target_name: string; business_owner_count: number; data_steward_count: number; technical_owner_count: number; custodian_count: number; coverage_status: string }

function statusClass(status: string) {
  if (status === 'ACCOUNTABLE' || status === 'ACTIVE') return 'bg-emerald-50 text-emerald-700'
  if (status === 'PARTIAL' || status === 'PROPOSED') return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

export function StewardshipManager({
  projects,
  datasets,
  sources,
  catalogAssets,
  members,
  initialAssignments,
  initialCertifications,
  datasetCoverage,
  catalogCoverage,
}: {
  projects: Project[]
  datasets: Dataset[]
  sources: Source[]
  catalogAssets: CatalogAsset[]
  members: Member[]
  initialAssignments: Assignment[]
  initialCertifications: Certification[]
  datasetCoverage: DatasetCoverage[]
  catalogCoverage: CatalogCoverage[]
}) {
  const [assignments] = useState(initialAssignments)
  const [certifications, setCertifications] = useState(initialCertifications)
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [targetType, setTargetType] = useState<'DATASET' | 'CATALOG_ASSET'>('DATASET')
  const [targetId, setTargetId] = useState('')
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('DATA_STEWARD')
  const [accountability, setAccountability] = useState('Own governance triage, semantic review, quality follow-up and evidence for this target.')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const project = projects.find(item => item.id === projectId)
  const sourceIds = useMemo(() => new Set(sources.filter(item => item.project_id === projectId).map(item => item.id)), [sources, projectId])
  const projectDatasets = datasets.filter(item => item.project_id === projectId)
  const projectAssets = catalogAssets.filter(item => sourceIds.has(item.source_id) && Boolean(item.identity_key))
  const projectMembers = members.filter(item => item.organization_id === project?.organization_id)
  const targetOptions = targetType === 'DATASET' ? projectDatasets : projectAssets
  const effectiveTargetId = targetOptions.some(item => item.id === targetId) ? targetId : targetOptions[0]?.id ?? ''
  const effectiveUserId = projectMembers.some(item => item.user_id === userId) ? userId : projectMembers[0]?.user_id ?? ''
  const datasetById = useMemo(() => new Map(datasets.map(item => [item.id, item])), [datasets])
  const assetById = useMemo(() => new Map(catalogAssets.map(item => [item.id, item])), [catalogAssets])

  const projectDatasetCoverage = datasetCoverage.filter(item => item.project_id === projectId)
  const projectCatalogCoverage = catalogCoverage.filter(item => item.project_id === projectId)
  const accountableDatasets = projectDatasetCoverage.filter(item => item.coverage_status === 'ACCOUNTABLE').length
  const partialDatasets = projectDatasetCoverage.filter(item => item.coverage_status === 'PARTIAL').length
  const unassignedDatasets = projectDatasetCoverage.filter(item => item.coverage_status === 'UNASSIGNED').length
  const effectiveAssignments = assignments.filter(item => item.project_id === projectId && item.active).length

  async function assign(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (!effectiveTargetId || !effectiveUserId) throw new Error('A target and current organization member are required.')
      const body = targetType === 'DATASET'
        ? { projectId, targetType, datasetId: effectiveTargetId, userId: effectiveUserId, role, accountability }
        : { projectId, targetType, discoveredAssetId: effectiveTargetId, userId: effectiveUserId, role, accountability }
      const response = await fetch('/api/stewardship/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Assignment failed.')
      setMessage('Governed stewardship assignment recorded with evidence.')
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Assignment failed.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(assignmentId: string) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/stewardship/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REVOKE', reason: 'Revoked from stewardship workbench.' }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Revocation failed.')
      setMessage('Assignment revoked. History and audit evidence were preserved.')
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Revocation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function requestCertification(datasetId: string) {
    setBusy(true)
    try {
      const dataset = datasets.find(item => item.id === datasetId)
      const response = await fetch('/api/stewardship/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: dataset?.project_id,
          datasetId,
          assignedTo: projectMembers.find(item => item.role === 'OWNER')?.user_id ?? null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Certification request failed.')
      setCertifications(value => [payload.request, ...value])
      setMessage('Certification request created.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Certification request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function decide(id: string, status: string) {
    const response = await fetch(`/api/stewardship/certifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error ?? 'Decision failed.')
    setCertifications(value => value.map(item => item.id === id ? payload.request : item))
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Effective assignments" value={effectiveAssignments} icon={<UserRoundCheck className="h-4 w-4" />} />
        <Metric label="Accountable datasets" value={accountableDatasets} icon={<CheckCircle2 className="h-4 w-4" />} />
        <Metric label="Partial coverage" value={partialDatasets} icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Unassigned datasets" value={unassignedDatasets} icon={<XCircle className="h-4 w-4" />} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <form onSubmit={assign} className="rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Assign accountability</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Assignments are DataNexus governance decisions. AI may suggest a candidate later, but it cannot silently activate an owner or steward.</p>
          <div className="mt-5 grid gap-3">
            <select value={projectId} onChange={event => { setProjectId(event.target.value); setTargetId(''); setUserId('') }} className="rounded-xl border px-3 py-2.5">
              {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={targetType} onChange={event => { setTargetType(event.target.value as 'DATASET' | 'CATALOG_ASSET'); setTargetId('') }} className="rounded-xl border px-3 py-2.5">
              <option value="DATASET">Governed dataset</option>
              <option value="CATALOG_ASSET">Current catalog asset</option>
            </select>
            <select value={effectiveTargetId} onChange={event => setTargetId(event.target.value)} className="rounded-xl border px-3 py-2.5">
              {targetType === 'DATASET'
                ? projectDatasets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)
                : projectAssets.map(item => <option key={item.id} value={item.id}>{item.asset_key} · {item.asset_type}</option>)}
            </select>
            <select value={effectiveUserId} onChange={event => setUserId(event.target.value)} className="rounded-xl border px-3 py-2.5">
              {projectMembers.map((item, index) => <option key={item.user_id + item.role} value={item.user_id}>Member {index + 1} · {item.role}</option>)}
            </select>
            <select value={role} onChange={event => setRole(event.target.value)} className="rounded-xl border px-3 py-2.5">
              <option value="BUSINESS_OWNER">Business owner</option>
              <option value="DATA_STEWARD">Data steward</option>
              <option value="TECHNICAL_OWNER">Technical owner</option>
              <option value="CUSTODIAN">Custodian</option>
            </select>
            <textarea value={accountability} onChange={event => setAccountability(event.target.value)} rows={4} className="rounded-xl border px-3 py-2.5" placeholder="Explicit accountability statement" />
            <button disabled={busy || !effectiveTargetId || !effectiveUserId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Assign governed role
            </button>
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </div>
        </form>

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold">Assignment register</h2><p className="mt-1 text-xs text-slate-500">Current state is separated from immutable assignment and revocation evidence.</p></div>
          </div>
          <div className="mt-5 space-y-3">
            {assignments.filter(item => item.project_id === projectId).length === 0 ? <p className="rounded-2xl border border-dashed p-5 text-sm text-slate-500">No ownership or stewardship has been assigned for this project yet.</p> : null}
            {assignments.filter(item => item.project_id === projectId).map(item => {
              const dataset = item.dataset_id ? datasetById.get(item.dataset_id) : null
              const asset = item.discovered_asset_id ? assetById.get(item.discovered_asset_id) : null
              const targetName = item.target_type === 'DATASET' ? dataset?.name ?? item.target_locator ?? 'Historical dataset' : item.target_locator ?? asset?.asset_key ?? 'Historical catalog asset'
              return (
                <article key={item.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{targetName}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${statusClass(item.status)}`}>{item.status}</span>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 font-bold text-blue-700">{item.role}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{item.target_type}</span>
                        {item.target_state !== 'CURRENT' ? <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">TARGET {item.target_state}</span> : null}
                        {item.subject_state !== 'CURRENT' ? <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">ASSIGNEE {item.subject_state}</span> : null}
                      </div>
                    </div>
                    {item.status !== 'REVOKED' ? <button type="button" disabled={busy} onClick={() => void revoke(item.id)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-bold text-red-700">Revoke</button> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.accountability ?? 'No accountability statement recorded.'}</p>
                  <p className="mt-2 text-xs text-slate-400">Assignee {item.user_id.slice(0, 8)}… · origin {item.origin} · effective {item.active ? 'yes' : 'no'}</p>
                </article>
              )
            })}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Stewardship coverage</h2>
          <p className="mt-1 text-xs text-slate-500">Accountable means both a current business owner and a current data steward are present. Missing roles stay visible as evidence gaps.</p>
          <div className="mt-4 space-y-2">
            {projectDatasetCoverage.map(item => <CoverageRow key={item.dataset_id} name={item.name} status={item.coverage_status} owners={item.business_owner_count} stewards={item.data_steward_count} />)}
            {projectCatalogCoverage.map(item => <CoverageRow key={`${item.data_source_id}:${item.catalog_identity_key}`} name={item.target_name} status={item.coverage_status} owners={item.business_owner_count} stewards={item.data_steward_count} catalog />)}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold">Certification queue</h2><p className="mt-1 text-xs text-slate-500">Certification remains a separate governed decision; stewardship does not automatically certify an asset.</p></div>
            {targetType === 'DATASET' && effectiveTargetId ? <button onClick={() => void requestCertification(effectiveTargetId)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white"><ShieldCheck className="h-4 w-4" />Request</button> : null}
          </div>
          <div className="mt-4 space-y-2">
            {certifications.filter(item => item.project_id === projectId).map(item => <div key={item.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{datasetById.get(item.dataset_id)?.name ?? 'Historical dataset'}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{item.status}</span></div><p className="mt-1 text-xs text-slate-500">Requested {new Date(item.requested_at).toLocaleString()}</p>{!['APPROVED', 'REJECTED', 'CANCELLED'].includes(item.status) ? <div className="mt-2 flex gap-2"><button onClick={() => void decide(item.id, 'IN_REVIEW')} className="rounded-lg border px-2 py-1 text-xs font-bold">Review</button><button onClick={() => void decide(item.id, 'APPROVED')} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white">Approve</button><button onClick={() => void decide(item.id, 'REJECTED')} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white">Reject</button></div> : null}</div>)}
          </div>
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div><p className="mt-2 text-2xl font-black">{value}</p></div>
}

function CoverageRow({ name, status, owners, stewards, catalog = false }: { name: string; status: string; owners: number; stewards: number; catalog?: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{name}</p><p className="mt-0.5 text-xs text-slate-400">{catalog ? 'Catalog asset' : 'Dataset'} · business owner {owners} · data steward {stewards}</p></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${statusClass(status)}`}>{status}</span></div>
}
