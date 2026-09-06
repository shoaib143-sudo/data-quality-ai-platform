'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Archive, BookOpen, CheckCircle2, Link2, Loader2, Plus, RotateCcw, Send, ShieldCheck, XCircle } from 'lucide-react'

type Project = { id: string; name: string }
type Dataset = { id: string; project_id: string; name: string }
type CatalogAsset = {
  id: string
  project_id: string
  source_id: string
  asset_key: string
  name: string
  namespace: string | null
  identity_key: string | null
  columns: unknown
}
type Mapping = {
  id: string
  dataset_id: string | null
  discovered_asset_id: string | null
  data_source_id: string | null
  catalog_identity_key: string | null
  target_type: 'DATASET' | 'CATALOG_ASSET'
  column_name: string | null
  confidence: number | null
  approved: boolean
  mapping_status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW'
  validation_state: 'VALID' | 'UNVERIFIED' | 'STALE'
  origin: string
  term_version_number: number | null
}
type TermVersion = {
  id: string
  version_number: number
  status: string
  authority_type: string
  change_kind: string
  created_at: string
}
type Term = {
  id: string
  project_id: string
  term: string
  definition: string
  domain: string | null
  synonyms: string[]
  status: 'REFERENCE' | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'DEPRECATED'
  authority_type: 'REFERENCE_BOOTSTRAP' | 'HUMAN_GOVERNED' | 'IMPORTED_GOVERNED' | 'AI_SUGGESTED'
  glossary_mappings: Mapping[]
  glossary_term_versions: TermVersion[]
}

function columnNames(asset: CatalogAsset | undefined) {
  if (!asset || !Array.isArray(asset.columns)) return []
  return asset.columns
    .map(column => column && typeof column === 'object' && 'name' in column ? String((column as { name?: unknown }).name ?? '').trim() : '')
    .filter(Boolean)
}

export function GlossaryManager({
  projects,
  datasets,
  catalogAssets,
  initialTerms,
}: {
  projects: Project[]
  datasets: Dataset[]
  catalogAssets: CatalogAsset[]
  initialTerms: Term[]
}) {
  const [terms, setTerms] = useState(initialTerms)
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [term, setTerm] = useState('')
  const [definition, setDefinition] = useState('')
  const [domain, setDomain] = useState('')
  const [synonyms, setSynonyms] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const visibleTerms = useMemo(() => terms.filter(item => item.project_id === projectId), [terms, projectId])
  const stats = useMemo(() => ({
    reference: visibleTerms.filter(item => item.status === 'REFERENCE').length,
    governed: visibleTerms.filter(item => item.authority_type !== 'REFERENCE_BOOTSTRAP').length,
    published: visibleTerms.filter(item => item.status === 'APPROVED').length,
    review: visibleTerms.reduce((total, item) => total + (item.glossary_mappings ?? []).filter(mapping => ['PROPOSED', 'NEEDS_REVIEW'].includes(mapping.mapping_status)).length, 0),
  }), [visibleTerms])

  async function refresh(targetProjectId = projectId) {
    const response = await fetch(`/api/glossary?projectId=${encodeURIComponent(targetProjectId)}`)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error ?? 'Unable to refresh glossary.')
    setTerms(current => [
      ...current.filter(item => item.project_id !== targetProjectId),
      ...(payload.terms ?? []),
    ])
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          term,
          definition,
          domain,
          synonyms: synonyms.split(',').map(value => value.trim()).filter(Boolean),
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to create term.')
      setTerm('')
      setDefinition('')
      setDomain('')
      setSynonyms('')
      setMessage('Draft business term created. Submit it for review when the meaning is ready.')
      await refresh(projectId)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create term.')
    } finally {
      setBusy(false)
    }
  }

  async function termAction(item: Term, action: string) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/glossary/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Glossary action failed.')
      await refresh(item.project_id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Glossary action failed.')
    } finally {
      setBusy(false)
    }
  }

  async function proposeMapping(item: Term, input: { targetType: 'DATASET' | 'CATALOG_ASSET'; targetId: string; columnName: string }) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/glossary/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termId: item.id,
          targetType: input.targetType,
          datasetId: input.targetType === 'DATASET' ? input.targetId : null,
          discoveredAssetId: input.targetType === 'CATALOG_ASSET' ? input.targetId : null,
          columnName: input.columnName || null,
          confidence: 1,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Mapping proposal failed.')
      await refresh(item.project_id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Mapping proposal failed.')
    } finally {
      setBusy(false)
    }
  }

  async function mappingAction(item: Term, mapping: Mapping, action: string) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/glossary/mappings/${mapping.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Mapping review failed.')
      await refresh(item.project_id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Mapping review failed.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="mt-6 space-y-6">
    <section className="grid gap-3 sm:grid-cols-4">
      <Metric label="Reference concepts" value={stats.reference} detail="Useful vocabulary, not enterprise authority" />
      <Metric label="Governed terms" value={stats.governed} detail="Human/imported semantic work" />
      <Metric label="Published terms" value={stats.published} detail="Approved versions currently authoritative" />
      <Metric label="Mapping review queue" value={stats.review} detail="Proposed or revision-sensitive mappings" />
    </section>

    <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
      <form onSubmit={create} className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-violet-600" /><h2 className="text-xl font-bold">New governed term</h2></div>
        <p className="mt-2 text-sm text-slate-500">New terms always begin as drafts. Approval is an explicit lifecycle action with evidence.</p>
        <div className="mt-5 grid gap-3">
          <select value={projectId} onChange={event => setProjectId(event.target.value)} className="rounded-xl border px-3 py-2.5">
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <input required value={term} onChange={event => setTerm(event.target.value)} placeholder="Business term" className="rounded-xl border px-3 py-2.5" />
          <textarea required value={definition} onChange={event => setDefinition(event.target.value)} placeholder="Business definition" rows={5} className="rounded-xl border px-3 py-2.5" />
          <input value={domain} onChange={event => setDomain(event.target.value)} placeholder="Domain" className="rounded-xl border px-3 py-2.5" />
          <input value={synonyms} onChange={event => setSynonyms(event.target.value)} placeholder="Synonyms, comma separated" className="rounded-xl border px-3 py-2.5" />
          <button disabled={busy || !projectId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create draft
          </button>
          {message ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
        </div>
      </form>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">Semantic workbench</h2><p className="mt-1 text-sm text-slate-500">Published meaning survives draft revisions; mappings are reviewed against the approved term version.</p></div>
          <select value={projectId} onChange={event => setProjectId(event.target.value)} className="rounded-xl border px-3 py-2 text-sm font-semibold">
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>

        <div className="mt-5 space-y-4">
          {visibleTerms.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">No glossary concepts exist for this project yet.</div> : null}
          {visibleTerms.map(item => {
            const versions = [...(item.glossary_term_versions ?? [])].sort((left, right) => right.version_number - left.version_number)
            const publishedVersion = versions.find(version => version.status === 'APPROVED' && version.authority_type !== 'REFERENCE_BOOTSTRAP')
            return <article key={item.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-900">{item.term}</h3>
                    <StatusBadge status={item.status} />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {item.authority_type === 'REFERENCE_BOOTSTRAP' ? 'Reference only' : item.authority_type.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.definition}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {item.domain ?? 'No domain'} · synonyms {(item.synonyms ?? []).join(', ') || 'none'} · {versions.length} semantic version{versions.length === 1 ? '' : 's'}
                    {publishedVersion ? ` · published v${publishedVersion.version_number}` : ' · no published authority'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === 'REFERENCE' ? <ActionButton disabled={busy} onClick={() => void termAction(item, 'ADOPT_REFERENCE')} icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Adopt" /> : null}
                  {item.status === 'DRAFT' ? <ActionButton disabled={busy} onClick={() => void termAction(item, 'SUBMIT_REVIEW')} icon={<Send className="h-3.5 w-3.5" />} label="Submit" /> : null}
                  {item.status === 'IN_REVIEW' ? <ActionButton disabled={busy} onClick={() => void termAction(item, 'APPROVE')} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Approve" /> : null}
                  {item.status === 'APPROVED' ? <ActionButton disabled={busy} onClick={() => void termAction(item, 'DEPRECATE')} icon={<Archive className="h-3.5 w-3.5" />} label="Deprecate" /> : null}
                  {item.status === 'DEPRECATED' ? <ActionButton disabled={busy} onClick={() => void termAction(item, 'REOPEN')} icon={<RotateCcw className="h-3.5 w-3.5" />} label="Reopen" /> : null}
                </div>
              </div>

              <MappingForm
                term={item}
                datasets={datasets.filter(dataset => dataset.project_id === item.project_id)}
                catalogAssets={catalogAssets.filter(asset => asset.project_id === item.project_id)}
                disabled={busy}
                onMap={proposeMapping}
              />

              <div className="mt-3 space-y-2">
                {(item.glossary_mappings ?? []).map(mapping => {
                  const dataset = datasets.find(candidate => candidate.id === mapping.dataset_id)
                  const asset = catalogAssets.find(candidate => candidate.id === mapping.discovered_asset_id)
                  const target = mapping.target_type === 'DATASET'
                    ? dataset?.name ?? 'Dataset'
                    : asset?.asset_key ?? mapping.catalog_identity_key ?? 'Catalog asset'
                  const canApprove = item.status === 'APPROVED' && (mapping.target_type !== 'CATALOG_ASSET' || mapping.validation_state === 'VALID')
                  return <div key={mapping.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <div className="min-w-0 text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">{target}{mapping.column_name ? `.${mapping.column_name}` : ''}</span>
                      <span> · {mapping.target_type.replace('_', ' ').toLowerCase()} · {mapping.origin.toLowerCase().replace('_', ' ')}</span>
                      <span> · {mapping.mapping_status}</span>
                      <span> · {mapping.validation_state}</span>
                      {mapping.term_version_number ? <span> · term v{mapping.term_version_number}</span> : null}
                    </div>
                    <div className="flex gap-1.5">
                      {['PROPOSED', 'NEEDS_REVIEW'].includes(mapping.mapping_status) ? <>
                        <button type="button" disabled={busy || !canApprove} title={canApprove ? 'Approve mapping' : 'Approve the term and ensure catalog mapping validity first'} onClick={() => void mappingAction(item, mapping, 'APPROVE')} className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold disabled:opacity-40">Approve</button>
                        <button type="button" disabled={busy} onClick={() => void mappingAction(item, mapping, 'REJECT')} className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold">Reject</button>
                      </> : null}
                      {mapping.mapping_status === 'REJECTED' ? <button type="button" disabled={busy} onClick={() => void mappingAction(item, mapping, 'RESET_PROPOSAL')} className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold">Reopen</button> : null}
                    </div>
                  </div>
                })}
              </div>
            </article>
          })}
        </div>
      </section>
    </div>
  </div>
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
}

function StatusBadge({ status }: { status: Term['status'] }) {
  const label = status === 'REFERENCE' ? 'REFERENCE' : status.replace('_', ' ')
  return <span className="rounded-full border bg-white px-2 py-0.5 text-xs font-bold text-slate-700">{label}</span>
}

function ActionButton({ disabled, onClick, icon, label }: { disabled: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-50">{icon}{label}</button>
}

function MappingForm({
  term,
  datasets,
  catalogAssets,
  disabled,
  onMap,
}: {
  term: Term
  datasets: Dataset[]
  catalogAssets: CatalogAsset[]
  disabled: boolean
  onMap: (term: Term, input: { targetType: 'DATASET' | 'CATALOG_ASSET'; targetId: string; columnName: string }) => Promise<void>
}) {
  const defaultTargetType: 'DATASET' | 'CATALOG_ASSET' = catalogAssets.length ? 'CATALOG_ASSET' : 'DATASET'
  const [targetType, setTargetType] = useState<'DATASET' | 'CATALOG_ASSET'>(defaultTargetType)
  const [targetId, setTargetId] = useState(defaultTargetType === 'CATALOG_ASSET' ? catalogAssets[0]?.id ?? '' : datasets[0]?.id ?? '')
  const [columnName, setColumnName] = useState('')
  const selectedAsset = catalogAssets.find(asset => asset.id === targetId)
  const availableColumns = columnNames(selectedAsset)

  function changeTargetType(value: 'DATASET' | 'CATALOG_ASSET') {
    setTargetType(value)
    setTargetId(value === 'CATALOG_ASSET' ? catalogAssets[0]?.id ?? '' : datasets[0]?.id ?? '')
    setColumnName('')
  }

  return <div className="mt-4 rounded-xl border border-dashed p-3">
    <div className="flex items-center gap-2 text-xs font-bold text-slate-600"><Link2 className="h-3.5 w-3.5" />Propose semantic mapping</div>
    <div className="mt-2 flex flex-wrap gap-2">
      <select value={targetType} onChange={event => changeTargetType(event.target.value as 'DATASET' | 'CATALOG_ASSET')} className="rounded-lg border px-2 py-1.5 text-xs">
        <option value="CATALOG_ASSET" disabled={!catalogAssets.length}>Catalog asset</option>
        <option value="DATASET" disabled={!datasets.length}>Registered dataset</option>
      </select>
      <select value={targetId} onChange={event => { setTargetId(event.target.value); setColumnName('') }} className="min-w-56 rounded-lg border px-2 py-1.5 text-xs">
        {targetType === 'DATASET'
          ? datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)
          : catalogAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.asset_key}</option>)}
      </select>
      {targetType === 'CATALOG_ASSET' ? <select value={columnName} onChange={event => setColumnName(event.target.value)} className="rounded-lg border px-2 py-1.5 text-xs">
        <option value="">Whole asset</option>
        {availableColumns.map(name => <option key={name} value={name}>{name}</option>)}
      </select> : <input value={columnName} onChange={event => setColumnName(event.target.value)} placeholder="Column optional" className="rounded-lg border px-2 py-1.5 text-xs" />}
      <button type="button" disabled={disabled || !targetId} onClick={() => void onMap(term, { targetType, targetId, columnName })} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Propose</button>
    </div>
    {term.status === 'REFERENCE' ? <p className="mt-2 flex items-center gap-1 text-xs text-amber-700"><XCircle className="h-3.5 w-3.5" />Reference mappings can be proposed, but cannot be approved until the concept is adopted and governed.</p> : null}
  </div>
}
