'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Check, Loader2, Plus, ShieldCheck, X } from 'lucide-react'

type Project = { id: string; name: string }
type Dataset = { id: string; project_id: string; name: string }
type Label = { id: string; project_id: string | null; code: string; name: string; category: string; description: string | null; handling_requirements: Record<string, unknown> }
type Classification = { id: string; project_id: string; dataset_id: string; column_name: string | null; status: string; confidence: number | null; source: string; classification_labels: Label | null }
type Policy = { id: string; project_id: string; label_id: string; name: string; description: string | null; retention_days: number | null; encryption_required: boolean; masking_required: boolean; approval_required: boolean; enabled: boolean; classification_labels: Label | null }

type Props = {
  projects: Project[]
  datasets: Dataset[]
  labels: Label[]
  initialClassifications: Classification[]
  initialPolicies: Policy[]
  initialProjectId?: string | null
  policyManageProjectIds: string[]
}

export function ClassificationManager({ projects, datasets, labels, initialClassifications, initialPolicies, initialProjectId, policyManageProjectIds }: Props) {
  const resolvedInitial = initialProjectId && projects.some(project => project.id === initialProjectId) ? initialProjectId : ''
  const [classifications, setClassifications] = useState(initialClassifications)
  const [policies, setPolicies] = useState(initialPolicies)
  const [projectId, setProjectId] = useState(resolvedInitial)
  const [labelId, setLabelId] = useState('')
  const [name, setName] = useState('Restricted PII handling')
  const [description, setDescription] = useState('Require encryption and masking for approved PII fields.')
  const [retention, setRetention] = useState('365')
  const [encrypt, setEncrypt] = useState(true)
  const [mask, setMask] = useState(true)
  const [approval, setApproval] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const datasetById = useMemo(() => new Map(datasets.map(dataset => [dataset.id, dataset])), [datasets])
  const visibleClassifications = useMemo(() => projectId ? classifications.filter(item => item.project_id === projectId) : [], [classifications, projectId])
  const visiblePolicies = useMemo(() => projectId ? policies.filter(item => item.project_id === projectId) : [], [policies, projectId])
  const visibleLabels = useMemo(() => projectId ? labels.filter(label => label.project_id == null || label.project_id === projectId) : [], [labels, projectId])
  const effectiveLabelId = visibleLabels.some(label => label.id === labelId) ? labelId : visibleLabels[0]?.id ?? ''
  const canManagePolicy = Boolean(projectId && policyManageProjectIds.includes(projectId))

  async function patch(id: string, status: string) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/classification/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Classification update failed.')
      setClassifications(current => current.map(item => item.id === id ? { ...item, ...payload.classification } : item))
      setMessage(status === 'APPROVED' ? 'Classification approved as governed authority.' : 'Classification rejected; review history remains preserved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Classification update failed.')
    } finally {
      setBusy(false)
    }
  }

  async function createPolicy(event: FormEvent) {
    event.preventDefault()
    if (!projectId) {
      setMessage('Choose a governed project before creating a handling policy.')
      return
    }
    if (!canManagePolicy) {
      setMessage('Your current project role does not allow handling-policy approval.')
      return
    }
    if (!effectiveLabelId) {
      setMessage('Choose an available classification label before creating a handling policy.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/classification/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          labelId: effectiveLabelId,
          name,
          description,
          retentionDays: Number(retention),
          encryptionRequired: encrypt,
          maskingRequired: mask,
          approvalRequired: approval,
          requiredControls: { access: 'restricted', audit: true },
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Policy creation failed.')
      setPolicies(current => [payload.policy, ...current])
      setMessage('Classification handling policy created with governance audit evidence.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Policy creation failed.')
    } finally {
      setBusy(false)
    }
  }

  const policyList = (
    <div className="mt-4 space-y-2">
      {visiblePolicies.length ? visiblePolicies.map(policy => (
        <div key={policy.id} className="rounded-xl bg-slate-50 p-3 text-xs">
          <span className="font-bold">{policy.name}</span>
          <span className="mt-1 block text-slate-500">
            {policy.encryption_required ? 'Encryption · ' : ''}
            {policy.masking_required ? 'Masking · ' : ''}
            {policy.approval_required ? 'Approval · ' : ''}
            {policy.retention_days ?? 'No'} day retention
          </span>
        </div>
      )) : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No handling policies are recorded for this project.</p>}
    </div>
  )

  return <div className="mt-6 space-y-5">
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <label className="block max-w-md text-sm font-semibold text-slate-700">
        Governed project
        <select value={projectId} onChange={event => { setProjectId(event.target.value); setLabelId(''); setMessage('') }} className="mt-1 w-full rounded-xl border px-3 py-2.5">
          <option value="">Choose a governed project</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <p className="mt-2 text-xs text-slate-500">Classification decisions and handling policies below are scoped to the selected project. DataNexus does not assume the first organization project is active.</p>
    </section>

    {!projectId ? (
      <section className="rounded-3xl border border-dashed bg-white p-8 text-sm text-slate-600">Choose a governed project to review detected classifications and handling policies.</section>
    ) : (
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Detected classifications</h2>
              <p className="mt-1 text-sm text-slate-500">Profiling-generated suggestions require governance review before becoming authoritative.</p>
            </div>
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">{visibleClassifications.filter(item => item.status === 'SUGGESTED').length} pending</span>
          </div>
          <div className="mt-5 space-y-3">
            {visibleClassifications.length ? visibleClassifications.map(classification => (
              <article key={classification.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{datasetById.get(classification.dataset_id)?.name ?? classification.dataset_id}{classification.column_name ? `.${classification.column_name}` : ''}</span>
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700">{classification.classification_labels?.code ?? 'CLASSIFIED'}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{classification.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Confidence {classification.confidence != null ? `${Math.round(classification.confidence * 100)}%` : 'N/A'} · source {classification.source}</p>
                  </div>
                  {classification.status === 'SUGGESTED' ? (
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => void patch(classification.id, 'APPROVED')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" />Approve</button>
                      <button disabled={busy} onClick={() => void patch(classification.id, 'REJECTED')} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><X className="h-3.5 w-3.5" />Reject</button>
                    </div>
                  ) : null}
                </div>
              </article>
            )) : <p className="rounded-2xl border border-dashed p-5 text-sm text-slate-500">No detected classifications are currently recorded for this project.</p>}
          </div>
        </section>

        {canManagePolicy ? (
          <form onSubmit={createPolicy} className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-purple-600" /><h2 className="text-xl font-bold">Approve handling policy</h2></div>
            <p className="mt-1 text-sm text-slate-500">This mutation requires explicit policy approval authority for the selected project.</p>
            <div className="mt-5 grid gap-3">
              <select value={effectiveLabelId} onChange={event => setLabelId(event.target.value)} className="rounded-xl border px-3 py-2.5">
                {visibleLabels.map(label => <option key={label.id} value={label.id}>{label.code} · {label.name}</option>)}
              </select>
              <input value={name} onChange={event => setName(event.target.value)} className="rounded-xl border px-3 py-2.5" />
              <textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} className="rounded-xl border px-3 py-2.5" />
              <input type="number" value={retention} onChange={event => setRetention(event.target.value)} className="rounded-xl border px-3 py-2.5" placeholder="Retention days" />
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={encrypt} onChange={event => setEncrypt(event.target.checked)} />Encryption required</label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={mask} onChange={event => setMask(event.target.checked)} />Masking required</label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={approval} onChange={event => setApproval(event.target.checked)} />Access approval required</label>
              <button disabled={busy || !effectiveLabelId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create policy</button>
              {message ? <p className="text-sm text-slate-600" role="status">{message}</p> : null}
              {policyList}
            </div>
          </form>
        ) : (
          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Handling policies</h2>
            <p className="mt-1 text-sm text-slate-500">Your current project role can review classification evidence but does not have handling-policy approval authority. Mutation controls are therefore hidden.</p>
            {message ? <p className="mt-3 text-sm text-slate-600" role="status">{message}</p> : null}
            {policyList}
          </section>
        )}
      </div>
    )}
  </div>
}
