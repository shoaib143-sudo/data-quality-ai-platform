'use client'

import { AlertCircle, Bot, CheckCircle2, Pencil, Play, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { canonicalRoutes } from '@/lib/platform/canonical-routes'

type Remediation = {
  root_cause?: string
  manual_action?: string
  ai_action?: string
  ai_remediation?: string
  approval_required?: boolean
}

type Readiness = {
  state?: 'READY' | 'BLOCKED' | 'NOT_ASSESSED' | 'PARTIALLY_READY'
  profiling_ready?: boolean
  source_id?: string
  blockers?: Record<string, boolean>
  remediation?: Record<string, Remediation>
}

type AiRemediationOutcome = {
  status?: string
  selected_action?: string
  executed?: boolean
  approval_required?: boolean
  rationale?: string
  before_state?: string
  after_state?: string
  provider?: string | null
  model?: string | null
}

type ManualGuidance = {
  title: string
  location: string
  owner: string
  steps: string[]
  success: string
  configurationKind: 'source' | 'dataset' | 'none'
}

const AUTO_REPAIR_BLOCKERS = new Set(['SOURCE_NOT_OBSERVED_READY', 'EXECUTION_SOURCE_NOT_BOUND'])
const SOURCE_CONFIGURATION_BLOCKERS = new Set([
  'SOURCE_NOT_ACTIVE',
  'SOURCE_NOT_OBSERVED_READY',
  'GOVERNED_SCOPE_NOT_READY',
  'EXECUTION_SOURCE_NOT_BOUND',
  'DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE',
])

function manualGuidanceForBlocker(code: string | undefined, fallback?: string): ManualGuidance {
  switch (code) {
    case 'READINESS_RULE_NOT_ONBOARDED':
      return {
        title: 'Onboard a governed profiling-readiness policy for this source type.',
        location: 'Platform readiness-policy configuration — not dataset metadata.',
        owner: 'Data Governance Admin or platform administrator',
        steps: [
          'Do not edit this dataset’s name, description, ownership, or other catalog metadata; those changes will not clear this blocker.',
          'Onboard a profiling-readiness policy for this source type in governed platform configuration.',
          'Define the adapter/readiness evidence the source type must provide and complete any required approval.',
          'Re-run deterministic readiness evaluation for this dataset version.',
        ],
        success: 'The blocker is cleared only when the deterministic readiness verifier returns READY for this dataset version.',
        configurationKind: 'none',
      }
    case 'SOURCE_NOT_ACTIVE':
      return {
        title: 'Restore the linked source to an active governed state.',
        location: 'Source configuration for the linked data source.',
        owner: 'Source System Owner, Data Custodian, or Data Governance Admin',
        steps: [
          'Open the linked source configuration.',
          'Resolve the source lifecycle, credential, or connectivity condition that prevents the source from being active.',
          'Run the governed source validation flow.',
          'Return here and re-check readiness.',
        ],
        success: 'The source must be ACTIVE and the deterministic readiness verifier must no longer report SOURCE_NOT_ACTIVE.',
        configurationKind: 'source',
      }
    case 'SOURCE_NOT_OBSERVED_READY':
      return {
        title: 'Revalidate the linked source and persist fresh readiness evidence.',
        location: 'Source configuration and governed source validation.',
        owner: 'Source System Owner, Data Custodian, or Data Governance Admin',
        steps: [
          'Open the linked source configuration.',
          'Run governed source validation so DataNexus can observe the source again.',
          'Resolve any validation error without weakening credentials, scope, or governance controls.',
          'Return here and re-check readiness.',
        ],
        success: 'Fresh successful source evidence is persisted and deterministic readiness returns READY.',
        configurationKind: 'source',
      }
    case 'GOVERNED_SCOPE_NOT_READY':
      return {
        title: 'Complete governed scope approval for the linked source or dataset.',
        location: 'Source governance/scope configuration.',
        owner: 'Data Owner or Data Governance Admin',
        steps: [
          'Review the governed profiling scope for the linked source and dataset.',
          'Approve or correct the permitted scope through the governed workflow.',
          'Do not broaden scope outside the approved data boundary.',
          'Re-run readiness evaluation after approval is recorded.',
        ],
        success: 'Approved governed scope evidence exists and deterministic readiness no longer reports GOVERNED_SCOPE_NOT_READY.',
        configurationKind: 'source',
      }
    case 'EXECUTION_SOURCE_NOT_BOUND':
      return {
        title: 'Bind this dataset version to the correct governed execution source.',
        location: 'Linked source / execution-source configuration.',
        owner: 'Data Custodian, Source System Owner, or Data Governance Admin',
        steps: [
          'Open the linked source configuration.',
          'Confirm the dataset is bound to the intended governed execution source.',
          'Run source validation to reconcile the binding evidence.',
          'Return here and re-check readiness.',
        ],
        success: 'A valid execution-source binding is persisted and deterministic readiness returns READY.',
        configurationKind: 'source',
      }
    case 'DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE':
      return {
        title: 'Produce successful governed discovery evidence for the linked source.',
        location: 'Source discovery/validation workflow.',
        owner: 'Data Custodian, Source System Owner, or Data Governance Admin',
        steps: [
          'Open the linked source configuration.',
          'Run governed validation/discovery for the approved scope.',
          'Resolve discovery failures and persist a successful discovery result.',
          'Return here and re-check readiness.',
        ],
        success: 'Successful discovery evidence exists for the governed scope and deterministic readiness no longer reports this blocker.',
        configurationKind: 'source',
      }
    default:
      return {
        title: fallback ?? 'Resolve the reported readiness blocker using governed configuration.',
        location: 'Dataset or linked-source configuration, depending on the blocker.',
        owner: 'Data Steward, Data Custodian, Source System Owner, or Data Governance Admin',
        steps: [
          fallback ?? 'Review the reported blocker and update only the governed configuration required to resolve it.',
          'Re-run the relevant validation or approval workflow.',
          'Return here and re-check deterministic readiness.',
        ],
        success: 'The deterministic readiness verifier no longer reports the blocker and returns READY when all requirements are satisfied.',
        configurationKind: 'dataset',
      }
  }
}

export function DatasetActions({
  projectId,
  datasetId,
  datasetVersionId,
  agentDefinitionId,
  ready: legacyReady,
  canOpenManualConfiguration = true,
}: {
  projectId: string
  datasetId: string
  datasetVersionId: string
  agentDefinitionId: string | null
  ready: boolean
  canOpenManualConfiguration?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(true)
  const [aiOutcome, setAiOutcome] = useState<AiRemediationOutcome | null>(null)

  const refreshReadiness = useCallback(async () => {
    setReadinessLoading(true)
    try {
      const response = await fetch(`/api/profiling/readiness?projectId=${encodeURIComponent(projectId)}&datasetVersionId=${encodeURIComponent(datasetVersionId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to check profiling readiness.')
      setReadiness(payload.readiness ?? null)
    } catch (error) {
      setReadiness(null)
      setHasError(true)
      setMessage(error instanceof Error ? error.message : 'Unable to check profiling readiness.')
    } finally {
      setReadinessLoading(false)
    }
  }, [datasetVersionId, projectId])

  useEffect(() => {
    void refreshReadiness()
  }, [refreshReadiness])

  const effectiveReady = readiness?.state === 'READY' && readiness.profiling_ready === true
  const blockerCodes = useMemo(() => Object.keys(readiness?.blockers ?? {}).filter(code => readiness?.blockers?.[code]), [readiness])
  const primaryBlocker = blockerCodes[0]
  const primaryRemediation = primaryBlocker ? readiness?.remediation?.[primaryBlocker] : undefined
  const manualGuidance = manualGuidanceForBlocker(primaryBlocker, primaryRemediation?.manual_action)
  const canAskAi = blockerCodes.some(code => Boolean(readiness?.remediation?.[code]?.ai_action))
  const canAutoRepair = blockerCodes.length > 0 && blockerCodes.every(code => AUTO_REPAIR_BLOCKERS.has(code)) && !blockerCodes.some(code => readiness?.remediation?.[code]?.approval_required)
  const manualHref = readiness?.source_id && SOURCE_CONFIGURATION_BLOCKERS.has(primaryBlocker ?? '')
    ? canonicalRoutes.sourceEdit(readiness.source_id)
    : canonicalRoutes.datasetEdit(datasetId)
  const canOpenManualLink = canOpenManualConfiguration && manualGuidance.configurationKind !== 'none'
  const manualButtonLabel = manualGuidance.configurationKind === 'source' ? 'Open source configuration' : 'Open dataset configuration'

  async function runProfiling() {
    if (!effectiveReady || !agentDefinitionId || busy) return
    setBusy(true)
    setHasError(false)
    setMessage('Starting profiling job…')
    try {
      await refreshReadiness()
      const idempotencyKey = crypto.randomUUID()
      const response = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ projectId, datasetVersionId, agentDefinitionId, idempotencyKey }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Profiling execution failed.')
      if (!payload.agentRunId) throw new Error('Profiling job was accepted without a run identifier.')
      setHasError(false)
      setMessage('Profiling job queued. Opening live monitor…')
      router.push(payload.monitorUrl ?? `/monitoring?run=${encodeURIComponent(payload.agentRunId)}`)
    } catch (error) {
      setHasError(true)
      setMessage(error instanceof Error ? error.message : 'Profiling execution failed.')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function askAiToRepair() {
    if (!canAskAi || busy) return
    setBusy(true)
    setHasError(false)
    setAiOutcome(null)
    setMessage(canAutoRepair ? 'AI is reviewing the readiness blockers under governed repair policy…' : 'AI is diagnosing the readiness blockers under governed policy…')
    try {
      const response = await fetch('/api/profiling/readiness/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, datasetVersionId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'AI readiness remediation failed.')
      const outcome = (payload.remediation ?? {}) as AiRemediationOutcome
      setAiOutcome(outcome)

      if (outcome.status === 'REMEDIATED') {
        setMessage('AI-assisted low-risk repair completed and deterministic readiness is now READY.')
      } else if (outcome.status === 'APPROVAL_REQUIRED') {
        setMessage('AI diagnosed the blockers, but the required governed change needs explicit approval. No change was applied; follow the manual steps below.')
      } else if (outcome.status === 'AI_UNAVAILABLE') {
        setMessage('The governed AI reasoning provider is unavailable. No change was applied; follow the manual steps below.')
      } else if (outcome.executed) {
        setMessage('AI-assisted low-risk repair ran, but deterministic readiness is still not READY. Follow the remaining manual steps below.')
      } else {
        setMessage('AI diagnosed the blockers and found no currently authorized automatic repair. No change was applied; follow the manual steps below.')
      }

      await refreshReadiness()
      router.refresh()
    } catch (error) {
      setHasError(true)
      setMessage(error instanceof Error ? error.message : 'AI readiness remediation failed.')
      await refreshReadiness()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return <div className="mt-0 flex w-full flex-col items-end gap-2">
    <div className="flex flex-wrap items-center justify-end gap-3">
      {canOpenManualLink ? <Link href={manualHref} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
        <Pencil className="h-3.5 w-3.5" /> {manualButtonLabel}
      </Link> : null}
      {canAskAi ? <button type="button" onClick={() => void askAiToRepair()} disabled={busy || readinessLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
        {canAutoRepair ? 'Ask AI to repair' : 'Ask AI to diagnose'}
      </button> : null}
      {effectiveReady && agentDefinitionId ? <button type="button" onClick={() => void runProfiling()} disabled={busy || readinessLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        {busy ? 'Profiling…' : 'Run profiling'}
      </button> : null}
      {readinessLoading ? <span className="inline-flex items-center gap-1 text-xs text-slate-500"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking readiness…</span> : null}
    </div>

    {!readinessLoading && readiness && !effectiveReady ? <div className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs text-amber-950" role="status">
      <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><strong>{readiness.state ?? 'BLOCKED'}{primaryBlocker ? ` · ${primaryBlocker}` : ''}:</strong> {primaryRemediation?.root_cause ?? 'This dataset is not ready for profiling.'}</div></div>
      <div className="mt-3 grid gap-2 pl-5 text-slate-800">
        <div><strong>What must change:</strong> {manualGuidance.title}</div>
        <div><strong>Where:</strong> {manualGuidance.location}</div>
        <div><strong>Who should act:</strong> {manualGuidance.owner}</div>
        <div><strong>Steps:</strong>
          <ol className="mt-1 list-decimal space-y-1 pl-5">{manualGuidance.steps.map(step => <li key={step}>{step}</li>)}</ol>
        </div>
        <div><strong>Success condition:</strong> {manualGuidance.success}</div>
        {!canOpenManualConfiguration && manualGuidance.configurationKind !== 'none' ? <div className="rounded-lg border border-amber-300 bg-amber-100/70 px-2.5 py-2"><strong>Your current persona is read-only for this configuration.</strong> Ask the role listed above to perform the change; DataNexus will keep deterministic readiness blocked until governed evidence is present.</div> : null}
        {manualGuidance.configurationKind === 'none' ? <div className="rounded-lg border border-amber-300 bg-amber-100/70 px-2.5 py-2"><strong>This is not a dataset-edit task.</strong> There is no dataset metadata change that can clear this blocker.</div> : null}
      </div>
      {primaryRemediation?.ai_action ? <div className="mt-3 flex items-start gap-1 pl-5 text-slate-700"><Bot className="mt-0.5 h-3 w-3 shrink-0" /><span><strong>AI capability:</strong> {primaryRemediation.ai_action}{primaryRemediation.approval_required ? ' AI may diagnose this blocker, but it cannot apply the governed change without explicit approval.' : ''}</span></div> : null}
      {aiOutcome?.rationale ? <div className="mt-2 pl-5 text-slate-700"><strong>Latest AI review:</strong> {aiOutcome.rationale}</div> : null}
      {legacyReady && !effectiveReady ? <div className="mt-2 pl-5 text-slate-600">The previous UI heuristic indicated executable, but deterministic readiness now takes precedence.</div> : null}
    </div> : null}

    {message ? <span className={`flex items-center gap-1 text-xs ${hasError ? 'text-rose-600' : 'text-slate-500'}`} role="status">{hasError ? <AlertCircle className="h-3.5 w-3.5 text-rose-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}{message}</span> : null}
  </div>
}
