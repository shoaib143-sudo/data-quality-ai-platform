'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Boxes,
  Braces,
  CircleCheck,
  Database,
  FileCheck2,
  GitBranch,
  Network,
  RefreshCw,
  ShieldCheck,
  Tags,
  UserRoundCheck,
} from 'lucide-react'

type DomainContextPayload = {
  source: 'RECORDED_STATE_ONLY'
  generatedAt: string
  presentationMode: 'OUTCOME' | 'GOVERNANCE' | 'OPERATIONS'
  dataset: { id: string; name: string; status: string; business_domain?: string | null } | null
  governance: null | {
    summary: {
      criticality?: string | null
      highestSensitivity?: number
      openIssueCount?: number
      gapCount?: number
      highSeverityGapCount?: number
    } | null
    gaps: Array<{ code: string; severity: string; reason: string }>
    openIssues: Array<{ id: string; title: string; severity: string; status: string; dueAt?: string | null }>
    classification: { authoritativeCount: number; proposedCount: number }
    stewardship: { activeCount: number; roles: string[] }
    controls: { authoritativeCount: number; proposedCount: number; evaluatedCount: number; failedCount: number }
    contractCount: number
    certificationReadiness: Record<string, unknown> | null
  }
  profiling: null | {
    run: { id: string; status: string; row_count?: number | null; column_count?: number | null; completed_at?: string | null }
    findingCount: number
    findingsBySeverity: Record<string, number>
    recentFindings: Array<{ id: string; finding_type: string; severity: string; title: string; confidence?: number | null }>
  }
  quality: { definedRuleCount: number; enabledRuleCount: number; latestEvaluationCount: number; failedEvaluationCount: number; evidenceCount: number }
  lineage: { assetCount: number; edgeCount: number; upstreamEdgeCount: number; downstreamEdgeCount: number; latestImpact: null | { affected_count?: number; critical_affected_count?: number; risk_score?: number; confidence?: number; summary?: string; direction?: string } }
  execution: {
    capacity: { runningCount: number; maxConcurrentJobs: number; saturated: boolean }
    jobs: Array<{
      id: string
      jobType: string
      pool: 'CORE' | 'SEMANTIC' | 'GOVERNANCE'
      recordedStatus: string
      displayState: string
      eligible: boolean
      waitingReason: string | null
      blockedBy: Array<{ parentJobId: string; parentJobType: string | null; parentStatus: string | null; dependencyType: string; reason: string }>
      leaseHealth: string
      attempts: number
      maxAttempts: number
    }>
    blockedCount: number
    waitingCount: number
    staleLeaseCount: number
  }
  evidence: { profileFindingCount: number; qualityEvidenceCount: number; controlEvidenceCount: number; totalRecordedEvidence: number }
}

type Props = {
  projectId: string
  runId: string
  datasetId: string | null
  domainName: string
}

function toneForState(state: string) {
  const normalized = state.trim().toUpperCase()
  if (['FAILED', 'DEAD', 'BLOCKED', 'NON_COMPLIANT'].includes(normalized)) return 'border-rose-400/30 bg-rose-400/[0.08] text-rose-200'
  if (['WAITING', 'QUEUED', 'PENDING'].includes(normalized)) return 'border-amber-300/30 bg-amber-300/[0.08] text-amber-100'
  if (['SUCCEEDED', 'COMPLETED', 'COMPLETE', 'HEALTHY', 'ACTIVE'].includes(normalized)) return 'border-emerald-300/30 bg-emerald-300/[0.08] text-emerald-100'
  if (['RUNNING'].includes(normalized)) return 'border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-100'
  return 'border-white/10 bg-white/[0.03] text-slate-300'
}

function StateTag({ state }: { state: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${toneForState(state)}`}>{state || 'Unknown'}</span>
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
    <p className="text-xl font-black text-slate-100">{value}</p>
    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-[10px] leading-4 text-slate-600">{detail}</p>
  </div>
}

function ComponentRow({ icon: Icon, label, state, detail }: { icon: typeof Database; label: string; state: string; detail: string }) {
  return <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04]"><Icon className="h-4 w-4 text-cyan-200/80" /></div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-200">{label}</p><StateTag state={state} /></div>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p>
    </div>
  </div>
}

export function GovernedDomainContext({ projectId, runId, datasetId, domainName }: Props) {
  const [payload, setPayload] = useState<DomainContextPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ projectId, runId })
      if (datasetId) params.set('datasetId', datasetId)
      const response = await fetch(`/api/monitoring/domain-context?${params.toString()}`, { signal, cache: 'no-store' })
      const body = await response.json().catch(() => null) as DomainContextPayload | { error?: string } | null
      if (!response.ok) throw new Error(body && 'error' in body && body.error ? body.error : 'Recorded domain context is unavailable.')
      setPayload(body as DomainContextPayload)
      setError(null)
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setPayload(null)
      setError(loadError instanceof Error ? loadError.message : 'Recorded domain context is unavailable.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [projectId, runId, datasetId])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const timer = window.setInterval(() => void load(), 15_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [load])

  const componentRows = useMemo(() => {
    if (!payload) return []
    const governance = payload.governance
    const profileState = payload.profiling?.run.status ?? 'NOT RECORDED'
    const qualityState = payload.quality.failedEvaluationCount > 0 ? 'FAILED' : payload.quality.latestEvaluationCount > 0 ? 'COMPLETE' : 'NOT RECORDED'
    const controlState = (governance?.controls.failedCount ?? 0) > 0 ? 'FAILED' : (governance?.controls.evaluatedCount ?? 0) > 0 ? 'COMPLETE' : 'NOT RECORDED'
    const issueState = (governance?.openIssues.length ?? 0) > 0 ? 'ATTENTION' : 'CLEAR'
    const executionState = payload.execution.blockedCount > 0 ? 'BLOCKED' : payload.execution.waitingCount > 0 ? 'WAITING' : payload.execution.jobs.some((job) => job.recordedStatus === 'RUNNING') ? 'RUNNING' : payload.execution.jobs.length ? 'RECORDED' : 'NOT RECORDED'
    const impact = payload.lineage.latestImpact
    return [
      { icon: Database, label: 'Dataset', state: payload.dataset?.status ?? 'NOT RECORDED', detail: payload.dataset ? `${payload.dataset.name} is the recorded governed asset for this execution.` : 'This execution is not linked to a dataset record.' },
      { icon: Activity, label: 'Profiling', state: profileState, detail: payload.profiling ? `${payload.profiling.findingCount} persisted finding(s) from the latest recorded profile for this dataset version.` : 'No persisted profile run is linked to the selected dataset version.' },
      { icon: CircleCheck, label: 'Quality controls', state: qualityState, detail: `${payload.quality.latestEvaluationCount}/${payload.quality.definedRuleCount} current rule evaluation(s) recorded; ${payload.quality.failedEvaluationCount} failing.` },
      { icon: Tags, label: 'Classification', state: governance ? 'RECORDED' : 'NOT RECORDED', detail: governance ? `${governance.classification.authoritativeCount} authoritative and ${governance.classification.proposedCount} proposed classification(s).` : 'No dataset governance posture is available for this execution.' },
      { icon: UserRoundCheck, label: 'Stewardship', state: (governance?.stewardship.activeCount ?? 0) > 0 ? 'ACTIVE' : 'NOT RECORDED', detail: governance ? `${governance.stewardship.activeCount} active steward assignment(s)${governance.stewardship.roles.length ? `: ${governance.stewardship.roles.join(', ')}` : '.'}` : 'No recorded stewardship context.' },
      { icon: ShieldCheck, label: 'Governance controls', state: controlState, detail: governance ? `${governance.controls.evaluatedCount}/${governance.controls.authoritativeCount} authoritative control(s) evaluated; ${governance.controls.failedCount} failing.` : 'No recorded control context.' },
      { icon: AlertTriangle, label: 'Issues and gaps', state: issueState, detail: governance ? `${governance.openIssues.length} open issue(s), ${governance.gaps.length} governance gap(s), ${governance.summary?.highSeverityGapCount ?? 0} high severity.` : 'No recorded issue context.' },
      { icon: GitBranch, label: 'Lineage', state: payload.lineage.edgeCount > 0 ? 'RECORDED' : 'NOT RECORDED', detail: `${payload.lineage.upstreamEdgeCount} upstream and ${payload.lineage.downstreamEdgeCount} downstream persisted relationship(s).` },
      { icon: Network, label: 'Downstream impact', state: impact ? 'RECORDED' : 'NOT RECORDED', detail: impact ? `${impact.affected_count ?? 0} affected asset(s), ${impact.critical_affected_count ?? 0} critical. ${impact.summary ?? ''}`.trim() : 'No persisted impact analysis is linked to the selected lineage asset.' },
      { icon: Boxes, label: 'Durable execution', state: executionState, detail: `${payload.execution.jobs.length} durable job(s); ${payload.execution.blockedCount} blocked, ${payload.execution.waitingCount} waiting. Capacity ${payload.execution.capacity.runningCount}/${payload.execution.capacity.maxConcurrentJobs}.` },
      { icon: FileCheck2, label: 'Recorded evidence', state: payload.evidence.totalRecordedEvidence > 0 ? 'RECORDED' : 'NOT RECORDED', detail: `${payload.evidence.totalRecordedEvidence} persisted evidence item(s) across findings, quality evaluations, and control evaluations.` },
    ]
  }, [payload])

  if (loading && !payload) return <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs text-slate-500">Loading recorded governance and orchestration context…</div>

  if (error) return <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4">
    <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" /><div><p className="text-xs font-semibold text-amber-100">Recorded context unavailable</p><p className="mt-1 text-[11px] leading-4 text-amber-100/60">{error}</p></div></div>
    <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-amber-100"><RefreshCw className="h-3.5 w-3.5" />Retry</button>
  </div>

  if (!payload) return null

  const governance = payload.governance
  const outcomeMode = payload.presentationMode === 'OUTCOME'
  const operationsMode = payload.presentationMode === 'OPERATIONS'

  return <section aria-label={`Recorded governed context for ${domainName}`} className="space-y-4 border-t border-white/10 pt-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/55">Recorded domain context</p>
        <p className="mt-1 text-sm font-semibold text-slate-200">Governed components and operational evidence</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">Only persisted product records are shown. Missing records remain explicitly not recorded.</p>
      </div>
      <div className="text-right"><StateTag state={payload.source === 'RECORDED_STATE_ONLY' ? 'Recorded' : payload.source} /><p className="mt-1 text-[9px] uppercase tracking-wide text-slate-600">{payload.presentationMode.toLowerCase()} view</p></div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <Metric label="Open issues" value={governance?.openIssues.length ?? 0} detail={`${governance?.summary?.highSeverityGapCount ?? 0} high severity governance gap(s)`} />
      <Metric label="Quality failures" value={payload.quality.failedEvaluationCount} detail={`${payload.quality.latestEvaluationCount} current evaluation(s)`} />
      <Metric label="Lineage edges" value={payload.lineage.edgeCount} detail={`${payload.lineage.downstreamEdgeCount} downstream relationship(s)`} />
      <Metric label="Evidence" value={payload.evidence.totalRecordedEvidence} detail="Persisted findings and evaluation evidence" />
    </div>

    <div>
      <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-slate-300">Domain component network</h4><span className="text-[9px] uppercase tracking-wide text-slate-600">State plus meaning</span></div>
      <div className="max-h-[440px] space-y-2 overflow-auto pr-1">
        {componentRows.map((component) => <ComponentRow key={component.label} {...component} />)}
      </div>
    </div>

    {governance && !outcomeMode ? <div>
      <h4 className="mb-2 text-xs font-semibold text-slate-300">Governance implications</h4>
      {governance.gaps.length || governance.openIssues.length ? <div className="space-y-2">
        {governance.gaps.slice(0, 5).map((gap) => <div key={gap.code} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-slate-300">{gap.code.replaceAll('_', ' ')}</p><StateTag state={gap.severity} /></div><p className="mt-1 text-[10px] leading-4 text-slate-500">{gap.reason}</p></div>)}
        {governance.openIssues.slice(0, 5).map((issue) => <div key={issue.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2"><div className="flex items-center justify-between gap-2"><p className="truncate text-[11px] font-semibold text-slate-300">{issue.title}</p><StateTag state={issue.severity || issue.status} /></div><p className="mt-1 text-[10px] text-slate-500">Issue status: {issue.status}</p></div>)}
      </div> : <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-3 py-3 text-[11px] text-emerald-100/75">No open recorded governance issue or derived governance gap is present for this dataset posture.</div>}
    </div> : null}

    {operationsMode ? <div>
      <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-slate-300">Durable orchestration topology</h4><span className="text-[9px] text-slate-600">No lease owner or raw secret-bearing diagnostic is exposed</span></div>
      {payload.execution.jobs.length ? <div className="space-y-2">
        {payload.execution.jobs.map((job) => <div key={job.id} className="rounded-xl border border-white/[0.08] bg-[#051321] p-3">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold text-slate-200">{job.jobType}</p><p className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-600">{job.pool} pool · attempts {job.attempts}/{job.maxAttempts}</p></div><StateTag state={job.displayState} /></div>
          {job.waitingReason ? <p className="mt-2 text-[10px] leading-4 text-amber-100/70">{job.waitingReason}</p> : null}
          {job.blockedBy.map((dependency) => <p key={`${job.id}:${dependency.parentJobId}`} className="mt-2 text-[10px] leading-4 text-slate-500">Dependency: {dependency.reason} Recorded parent state: {dependency.parentStatus ?? 'unavailable'}.</p>)}
          {job.leaseHealth !== 'NOT_APPLICABLE' ? <p className="mt-2 text-[9px] uppercase tracking-wide text-slate-600">Lease integrity: {job.leaseHealth}</p> : null}
        </div>)}
      </div> : <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-slate-500">No durable orchestration job is linked to this agent run. The monitor does not infer one.</div>}
    </div> : null}

    {outcomeMode ? <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
      <p className="text-xs font-semibold text-cyan-100">Trust and impact summary</p>
      <p className="mt-1 text-[11px] leading-5 text-slate-400">Criticality: {governance?.summary?.criticality ?? 'not recorded'}. Open issues: {governance?.openIssues.length ?? 0}. Quality failures: {payload.quality.failedEvaluationCount}. Downstream relationships: {payload.lineage.downstreamEdgeCount}. Recorded evidence: {payload.evidence.totalRecordedEvidence}.</p>
    </div> : null}

    <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.12em] text-slate-600"><Braces className="h-3 w-3" />Refreshed from authorized persisted state at {new Date(payload.generatedAt).toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore' })}</p>
  </section>
}
