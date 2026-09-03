'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'

type SourceOption = { id: string; name: string; sourceType: string; status: string }
type Props = {
  dataset: {
    id: string
    projectId: string
    projectName: string
    sourceId: string
    name: string
    description: string
    sourceIdentifier: string
    businessDomain: string
  }
  sources: SourceOption[]
}

export function EditDatasetForm({ dataset, sources }: Props) {
  const router = useRouter()
  const [name, setName] = useState(dataset.name)
  const [description, setDescription] = useState(dataset.description)
  const [businessDomain, setBusinessDomain] = useState(dataset.businessDomain)
  const [sourceId, setSourceId] = useState(dataset.sourceId)
  const [sourceIdentifier, setSourceIdentifier] = useState(dataset.sourceIdentifier)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)

  async function save() {
    setBusy(true)
    setError(false)
    setStatus('Validating and saving dataset…')
    try {
      if (!name.trim() || !sourceId || !sourceIdentifier.trim()) throw new Error('Dataset name, connection, and source object are required.')
      const response = await fetch(`/api/datasets/${dataset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          businessDomain: businessDomain.trim(),
          sourceId,
          sourceIdentifier: sourceIdentifier.trim(),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? payload.source_validation?.errors?.join(' ') ?? 'Unable to update dataset.')
      setStatus('Dataset updated successfully and remains ready for profiling.')
      router.refresh()
    } catch (e) {
      setError(true)
      setStatus(e instanceof Error ? e.message : 'Dataset update failed.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
    <div className="mb-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Dataset configuration</div>
      <h2 className="mt-1 text-xl font-bold">{dataset.name}</h2>
      <p className="mt-1 text-sm text-slate-500">Project: {dataset.projectName}</p>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1.5 text-sm md:col-span-2">
        <span className="font-medium">Dataset name *</span>
        <input value={name} onChange={e => setName(e.target.value)} disabled={busy} className="w-full rounded-lg border bg-white px-3 py-2.5" />
      </label>

      <label className="space-y-1.5 text-sm">
        <span className="font-medium">Connection *</span>
        <select value={sourceId} onChange={e => setSourceId(e.target.value)} disabled={busy} className="w-full rounded-lg border bg-white px-3 py-2.5">
          <option value="">Select connection</option>
          {sources.map(source => <option key={source.id} value={source.id}>{source.name} · {source.sourceType} · {String(source.status).toUpperCase() === 'ACTIVE' ? 'READY' : 'SETUP REQUIRED'}</option>)}
        </select>
      </label>

      <label className="space-y-1.5 text-sm">
        <span className="font-medium">Source object *</span>
        <input value={sourceIdentifier} onChange={e => setSourceIdentifier(e.target.value)} disabled={busy} placeholder="jdbc_test.customers" className="w-full rounded-lg border bg-white px-3 py-2.5 font-mono text-sm" />
      </label>

      <label className="space-y-1.5 text-sm">
        <span className="font-medium">Business domain</span>
        <input value={businessDomain} onChange={e => setBusinessDomain(e.target.value)} disabled={busy} placeholder="Customer" className="w-full rounded-lg border bg-white px-3 py-2.5" />
      </label>

      <label className="space-y-1.5 text-sm">
        <span className="font-medium">Description</span>
        <input value={description} onChange={e => setDescription(e.target.value)} disabled={busy} placeholder="Purpose and business context" className="w-full rounded-lg border bg-white px-3 py-2.5" />
      </label>
    </div>

    <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-700">
      Changing the connection or source object triggers source validation. The dataset is only saved as ready when the updated source can be used for profiling.
    </div>

    <div className="mt-6 flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {busy ? 'Validating and saving…' : 'Save dataset changes'}
      </button>
      {status ? <span className={`inline-flex items-center gap-2 text-sm ${error ? 'text-rose-700' : 'text-emerald-700'}`}>{!error && <CheckCircle2 className="h-4 w-4" />}{status}</span> : null}
    </div>
  </section>
}
