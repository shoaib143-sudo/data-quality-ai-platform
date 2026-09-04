'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Workflow } from 'lucide-react'

type Project = { id: string; name: string }
type Dataset = { id: string; project_id: string; name: string }
type ChangeResult = {
  datasetId: string
  datasetName: string
  analysisId: string
  columnAnalysisId: string | null
  changeType: string
  changeSummary: string | null
  affectedColumns: string[]
  decision: 'SAFE_TO_PROCEED' | 'REVIEW_REQUIRED' | 'APPROVAL_REQUIRED'
  approvalRequired: boolean
  productionMutationPerformed: boolean
  riskScore: number
  confidence: number
  affectedCount: number
  columnAffectedCount: number
  criticalAffectedCount: number
  certifiedAffectedCount: number
  businessImpact: string
}
type ApprovalResult = {
  instanceId: string
  status: string
  reused?: boolean
  autoProvisioned?: boolean
  currentStep?: number
  workflowVersion?: number | null
  startedAt?: string | null
  completedAt?: string | null
  productionMutationPerformed?: boolean
}

const CHANGE_TYPES = [
  ['ADD_COLUMN', 'Add column'],
  ['DROP_COLUMN', 'Drop column'],
  ['RENAME_COLUMN', 'Rename column'],
  ['TYPE_CHANGE', 'Change data type'],
  ['TYPE_NARROWING', 'Narrow data type'],
  ['NULLABILITY_CHANGE', 'Change nullability'],
  ['PIPELINE_LOGIC_CHANGE', 'Pipeline logic change'],
  ['PIPELINE_BREAKING_CHANGE', 'Breaking pipeline change'],
  ['DROP_DATASET', 'Drop dataset'],
] as const

export function ChangeImpactManager({ projects, datasets }: { projects: Project[]; datasets: Dataset[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const available = useMemo(() => datasets.filter((dataset) => dataset.project_id === projectId), [datasets, projectId])
  const [datasetId, setDatasetId] = useState('')
  const [changeType, setChangeType] = useState('PIPELINE_LOGIC_CHANGE')
  const [changeSummary, setChangeSummary] = useState('')
  const [affectedColumns, setAffectedColumns] = useState('')
  const [maxDepth, setMaxDepth] = useState(5)
  const [busy, setBusy] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [approvalMessage, setApprovalMessage] = useState('')
  const [result, setResult] = useState<ChangeResult | null>(null)
  const [approval, setApproval] = useState<ApprovalResult | null>(null)
  const selectedId = datasetId && available.some((dataset) => dataset.id === datasetId) ? datasetId : (available[0]?.id ?? '')

  async function assess(event: FormEvent) {
    event.preventDefault()
    if (!projectId || !selectedId) return
    setBusy(true)
    setMessage('')
    setApproval(null)
    setApprovalMessage('')
    try {
      const response = await fetch('/api/lineage/impact/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, datasetId: selectedId, changeType, changeSummary, affectedColumns, maxDepth }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to assess proposed change.')
      setResult(payload as ChangeResult)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to assess proposed change.')
    } finally {
      setBusy(false)
    }
  }

  async function startApproval() {
    if (!result?.approvalRequired || !result.analysisId) return
    setApprovalBusy(true)
    setApprovalMessage('')
    try {
      const response = await fetch('/api/lineage/impact/change/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: result.analysisId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to start governed change approval.')
      setApproval(payload as ApprovalResult)
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : 'Unable to start governed change approval.')
    } finally {
      setApprovalBusy(false)
    }
  }

  async function refreshApproval() {
    if (!result?.analysisId) return
    setApprovalBusy(true)
    setApprovalMessage('')
    try {
      const response = await fetch(`/api/lineage/impact/change/approval/status?analysisId=${encodeURIComponent(result.analysisId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load governed change approval status.')
      setApproval((payload.approval ?? null) as ApprovalResult | null)
      if (!payload.approval) setApprovalMessage('No governed approval workflow has been started for this analysis yet.')
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : 'Unable to load governed change approval status.')
    } finally {
      setApprovalBusy(false)
    }
  }

  const decisionStyle = result?.decision === 'APPROVAL_REQUIRED'
    ? 'border-red-200 bg-red-50 text-red-800'
    : result?.decision === 'REVIEW_REQUIRED'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
  const approvalStyle = approval?.status === 'APPROVED'
    ? 'border-emerald-200 text-emerald-700'
    : approval?.status === 'REJECTED' || approval?.status === 'CANCELLED'
      ? 'border-red-200 text-red-700'
      : 'border-amber-200 text-amber-700'

  return <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700"><Workflow className="h-4 w-4"/>Pre-change impact gate</div><h2 className="mt-3 text-2xl font-black">Assess schema and pipeline changes before deployment</h2><p className="mt-2 max-w-3xl text-sm text-slate-600">Combine downstream dataset lineage, explicit column mappings, criticality and certification evidence. This assessment never changes production systems.</p></div>
      <span className="rounded-xl border bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">Read-only governance analysis</span>
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
      <form onSubmit={assess} className="rounded-2xl border bg-slate-50 p-5">
        <div className="grid gap-4">
          <label className="text-sm font-semibold">Project<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setDatasetId(''); setResult(null); setApproval(null) }} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="text-sm font-semibold">Dataset<select value={selectedId} onChange={(event) => { setDatasetId(event.target.value); setResult(null); setApproval(null) }} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5">{available.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select></label>
          <label className="text-sm font-semibold">Proposed change<select value={changeType} onChange={(event) => setChangeType(event.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5">{CHANGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm font-semibold">Affected columns <span className="font-normal text-slate-400">optional, comma or newline separated</span><textarea value={affectedColumns} onChange={(event) => setAffectedColumns(event.target.value)} rows={3} placeholder="customer_id, email, status" className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5"/></label>
          <label className="text-sm font-semibold">Change summary<textarea value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} rows={3} placeholder="Describe the planned schema or transformation change." className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5"/></label>
          <label className="text-sm font-semibold">Maximum blast-radius depth<input type="number" min={1} max={20} value={maxDepth} onChange={(event) => setMaxDepth(Math.max(1, Math.min(20, Number(event.target.value) || 5)))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5"/></label>
          <button disabled={busy || !selectedId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShieldAlert className="h-4 w-4"/>}Assess proposed change</button>
          {message ? <p className="text-sm text-red-600">{message}</p> : null}
        </div>
      </form>

      <div className="rounded-2xl border p-5">
        {!result ? <div className="grid min-h-80 place-items-center text-center"><div><AlertTriangle className="mx-auto h-11 w-11 text-slate-300"/><h3 className="mt-4 text-lg font-bold">No proposed change assessed yet</h3><p className="mt-2 max-w-xl text-sm text-slate-500">For column changes, explicit persisted column mappings are followed. Missing lineage lowers confidence and is reported as an evidence limitation rather than treated as proof of safety.</p></div></div> : <>
          <div className={`rounded-2xl border p-4 ${decisionStyle}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2">{result.decision === 'SAFE_TO_PROCEED' ? <CheckCircle2 className="h-5 w-5"/> : <ShieldAlert className="h-5 w-5"/>}<div><p className="text-xs font-bold uppercase tracking-wider">Decision</p><p className="text-xl font-black">{result.decision.replaceAll('_', ' ')}</p></div></div><div className="text-right"><p className="text-2xl font-black">{Math.round(result.riskScore * 100)}% risk</p><p className="text-xs">{Math.round(result.confidence * 100)}% evidence confidence</p></div></div></div>
          <p className="mt-4 text-sm leading-6 text-slate-700">{result.businessImpact}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Affected assets</p><p className="mt-1 text-2xl font-black">{result.affectedCount}</p></div><div className="rounded-2xl bg-indigo-50 p-4"><p className="text-xs font-bold uppercase text-indigo-600">Mapped columns</p><p className="mt-1 text-2xl font-black text-indigo-700">{result.columnAffectedCount}</p></div><div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-bold uppercase text-red-600">High / critical</p><p className="mt-1 text-2xl font-black text-red-700">{result.criticalAffectedCount}</p></div><div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-600">Certified</p><p className="mt-1 text-2xl font-black text-blue-700">{result.certifiedAffectedCount}</p></div></div>
          {result.approvalRequired ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="font-bold text-amber-900">Governed approval is required before this change proceeds.</p><p className="mt-1 text-sm text-amber-800">Approval is tied to this exact impact analysis, including risk, downstream critical/certified dependencies, affected columns and evidence confidence.</p><div className="mt-3 flex flex-wrap items-center gap-3">{approval ? <><span className={`rounded-full border bg-white px-3 py-1.5 text-xs font-bold ${approvalStyle}`}>Workflow {approval.status}</span><Link href="/workflows" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Open approval workflow</Link><button type="button" onClick={refreshApproval} disabled={approvalBusy} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800 disabled:opacity-50">{approvalBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}Refresh status</button></> : <><button type="button" onClick={startApproval} disabled={approvalBusy} className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{approvalBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Workflow className="h-4 w-4"/>}Start governed approval</button><button type="button" onClick={refreshApproval} disabled={approvalBusy} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-800 disabled:opacity-50"><RefreshCw className="h-4 w-4"/>Check existing approval</button></>}</div>{approval ? <p className="mt-2 text-xs text-amber-800">Instance {approval.instanceId}{approval.workflowVersion ? ` · workflow v${approval.workflowVersion}` : ''}{typeof approval.currentStep === 'number' ? ` · step ${approval.currentStep + 1}` : ''}{approval.completedAt ? ` · completed ${new Date(approval.completedAt).toLocaleString()}` : ''}</p> : null}{approvalMessage ? <p className="mt-2 text-sm text-red-700">{approvalMessage}</p> : null}</div> : null}
          <div className="mt-5 rounded-2xl border bg-slate-50 p-4 text-sm"><p><span className="font-bold">Change:</span> {result.changeType.replaceAll('_', ' ')}</p>{result.affectedColumns.length ? <p className="mt-2"><span className="font-bold">Columns:</span> {result.affectedColumns.join(', ')}</p> : null}<p className="mt-2"><span className="font-bold">Production mutation:</span> {result.productionMutationPerformed ? 'performed' : 'not performed'}</p><p className="mt-2 font-mono text-xs text-slate-500">Analysis {result.analysisId}{result.columnAnalysisId ? ` · Column analysis ${result.columnAnalysisId}` : ''}</p></div>
        </>}
      </div>
    </div>
  </section>
}
