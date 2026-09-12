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

export function DatasetActions({ projectId, datasetId, datasetVersionId, agentDefinitionId, ready: legacyReady }: { projectId: string; datasetId: string; datasetVersionId: string; agentDefinitionId: string | null; ready: boolean }) {
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
  const canAskAi = blockerCodes.some(code => Boolean(readiness?.remediation?.[code]?.ai_action))
  const manualTarget = useMemo(() => {
    if (!primaryBlocker) return null

    if (primaryBlocker === 'READINESS_RULE_NOT_ONBOARDED') {
      return {
        href: null,
        label: 'Readiness policy onboarding requires a governance administrator. No self-service remediation is available from this dataset page.',
      }
    }

    if (['SOURCE_NOT_ACTIVE','SOURCE_NOT_OBSERVED_READY','GOVERNED_SCOPE_NOT_READY','EXECUTION_SOURCE_NOT_BOUND','DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE'].includes(primaryBlocker)) {
      return readiness?.source_id
        ? { href: canonicalRoutes.sourceEdit(readiness.source_id), label: null }
        : { href: null, label: 'The blocked source could not be resolved, so no safe remediation route is available.' }
    }

    if (['DATASET_NOT_ACTIVE'].includes(primaryBlocker)) {
      return { href: canonicalRoutes.datasetEdit(datasetId), label: null }
    }

    return {
      href: null,
      label: primaryRemediation?.manual_action ?? 'No governed self-service remediation route is available for this blocker.',
    }
  }, [datasetId, primaryBlocker, primaryRemediation?.manual_action, readiness?.source_id])

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
    setMessage('AI is reviewing the readiness blockers under governed repair policy…')
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
        setMessage('AI reviewed the blockers, but at least one required change needs explicit user approval. No governed change was applied.')
      } else if (outcome.status === 'AI_UNAVAILABLE') {
        setMessage('The governed AI reasoning provider is unavailable. No change was applied; manual remediation remains available.')
      } else if (outcome.executed) {
        setMessage('AI-assisted low-risk repair ran, but deterministic readiness is still not READY. Review the remaining blocker guidance.')
      } else {
        setMessage('AI reviewed the blockers and found no currently authorized automatic repair. No change was applied.')
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
      {manualTarget?.href ? <Link href={manualTarget.href} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
        <Pencil className="h-3.5 w-3.5" /> Fix manually
      </Link> : null}
      {canAskAi ? <button type="button" onClick={() => void askAiToRepair()} disabled={busy || readinessLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
        Ask AI to repair
      </button> : null}
      {effectiveReady && agentDefinitionId ? <button type="button" onClick={() => void runProfiling()} disabled={busy || readinessLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        {busy ? 'Profiling…' : 'Run profiling'}
      </button> : null}
      {readinessLoading ? <span className="inline-flex items-center gap-1 text-xs text-slate-500"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking readiness…</span> : null}
    </div>

    {!readinessLoading && readiness && !effectiveReady ? <div className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900" role="status">
      <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><strong>{readiness.state ?? 'BLOCKED'}:</strong> {primaryRemediation?.root_cause ?? 'This dataset is not ready for profiling.'}</div></div>
      {primaryRemediation?.manual_action ? <div className="mt-1 pl-5"><strong>Manual:</strong> {primaryRemediation.manual_action}</div> : null}
      {manualTarget?.label ? <div className="mt-1 pl-5 text-slate-700"><strong>Access:</strong> {manualTarget.label}</div> : null}
      {primaryRemediation?.ai_action ? <div className="mt-1 flex items-start gap-1 pl-5 text-slate-700"><Bot className="mt-0.5 h-3 w-3 shrink-0" /><span><strong>AI option:</strong> {primaryRemediation.ai_action}{primaryRemediation.approval_required ? ' Explicit approval is required before a governed change.' : ''}</span></div> : null}
      {aiOutcome?.rationale ? <div className="mt-1 pl-5 text-slate-700"><strong>Latest AI review:</strong> {aiOutcome.rationale}</div> : null}
      {legacyReady && !effectiveReady ? <div className="mt-1 pl-5 text-slate-600">The previous UI heuristic indicated executable, but deterministic readiness now takes precedence.</div> : null}
    </div> : null}

    {message ? <span className={`flex items-center gap-1 text-xs ${hasError ? 'text-rose-600' : 'text-slate-500'}`} role="status">{hasError ? <AlertCircle className="h-3.5 w-3.5 text-rose-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}{message}</span> : null}
  </div>
}
