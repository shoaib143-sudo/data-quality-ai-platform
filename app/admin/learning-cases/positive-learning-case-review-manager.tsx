'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Clock3, ExternalLink, Loader2, PencilLine, ShieldCheck, XCircle } from 'lucide-react'
import type { PositiveLearningCaseAdminItem } from '@/lib/agents/proactive-governed-case-learning-admin'
import {
  PGCL_ADMIN_DECISIONS,
  type PgclAdminDecision,
} from '@/lib/agents/proactive-governed-case-learning'

const decisionLabels: Record<PgclAdminDecision, string> = {
  APPROVE_POSITIVE_CASE: 'Approve positive case',
  APPROVE_WITH_EDITS: 'Approve with edits',
  REJECT: 'Reject',
  DEFER: 'Defer',
  MARK_ONE_OFF: 'Mark one-off',
}

export function PositiveLearningCaseReviewManager({
  items,
}: {
  items: PositiveLearningCaseAdminItem[]
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(items[0]?.candidateId ?? '')
  const [decision, setDecision] = useState<PgclAdminDecision>('APPROVE_POSITIVE_CASE')
  const [reason, setReason] = useState('')
  const [reusableLesson, setReusableLesson] = useState(items[0]?.reusableLesson ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selected = useMemo(
    () => items.find((item) => item.candidateId === selectedId) ?? null,
    [items, selectedId],
  )

  async function submit() {
    if (!selected || !reason.trim()) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const edits = decision === 'APPROVE_WITH_EDITS' && reusableLesson.trim()
        ? { reusableLesson: reusableLesson.trim() }
        : {}
      const response = await fetch('/api/admin/learning-cases/' + selected.candidateId + '/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: reason.trim(), edits }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'PGCL review failed.')
      setMessage(decisionLabels[decision] + ' recorded.')
      setReason('')
      setReusableLesson('')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PGCL review failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!items.length) {
    return (
      <section className="rounded-3xl border border-dashed bg-white p-10 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <h2 className="mt-3 text-xl font-black">No learning cases need review</h2>
        <p className="mt-2 text-sm text-slate-500">
          Verified successful runs will appear here only when an agent detects a materially reusable pattern.
        </p>
      </section>
    )
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">Review queue</p>
            <h2 className="mt-1 text-xl font-black">{items.length} candidate{items.length === 1 ? '' : 's'}</h2>
          </div>
          <Clock3 className="h-5 w-5 text-slate-400" />
        </div>
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <button
              key={item.candidateId}
              type="button"
              onClick={() => {
                setSelectedId(item.candidateId)
                setReusableLesson(item.reusableLesson)
                setMessage('')
                setError('')
              }}
              className={'w-full rounded-2xl border p-4 text-left transition ' + (
                selectedId === item.candidateId
                  ? 'border-violet-300 bg-violet-50'
                  : 'border-slate-200 hover:border-violet-200 hover:bg-slate-50'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-violet-700">{item.runMode}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{item.reviewStatus}</span>
              </div>
              <p className="mt-2 font-bold">{item.useCaseKey}</p>
              <p className="mt-1 text-xs text-slate-500">{item.projectName} · {item.agentKey}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Observed {item.occurrenceCount} time{item.occurrenceCount === 1 ? '' : 's'}{item.lastObservedAt ? ' · latest ' + new Date(item.lastObservedAt).toLocaleString() : ''}</p>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.resultSummary}</p>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">Candidate positive case</p>
              <h2 className="mt-1 text-2xl font-black">{selected.useCaseKey}</h2>
              <p className="mt-1 text-sm text-slate-500">{selected.projectName} · {selected.agentKey} · {selected.skillKey}</p>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">{selected.runMode}</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
              This pattern has been observed <strong>{selected.occurrenceCount}</strong> time{selected.occurrenceCount === 1 ? '' : 's'}.
              {selected.lastObservedAt ? ' Latest verified occurrence: ' + new Date(selected.lastObservedAt).toLocaleString() + '.' : ''}
            </div>
            <Link href={`/agents/runs/${encodeURIComponent(selected.sourceAgentRunId)}`} className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-violet-700 hover:bg-violet-50">Source run <ExternalLink className="h-4 w-4"/></Link>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"/>
            <div><p className="text-sm font-black text-emerald-900">Learning is a governed promotion, not automatic self-modification.</p><p className="mt-1 text-xs leading-5 text-emerald-800">Review the source run, verification evidence, applicability and exclusions before deciding whether this success should become reusable organizational knowledge.</p></div>
          </div>

          <div className="mt-5 grid gap-4">
            <Detail title="Problem" value={selected.problemSignature} />
            <Detail title="Verified result" value={selected.resultSummary} />
            <Detail title="Proposed reusable lesson" value={selected.reusableLesson} />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <TagGroup title="Applicability" values={selected.applicabilityConditions} />
            <TagGroup title="Do not reuse when" values={selected.exclusionConditions} />
            <TagGroup title="Why this was proposed" values={selected.significanceSignals} />
            <TagGroup title="Verification evidence" values={selected.verificationEvidenceRefs} />
          </div>

          <div className="mt-6 border-t pt-6">
            <label className="block text-sm font-bold">
              Decision
              <select
                value={decision}
                onChange={(event) => {
                  const next = event.target.value as PgclAdminDecision
                  if (PGCL_ADMIN_DECISIONS.includes(next)) setDecision(next)
                }}
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5"
              >
                {PGCL_ADMIN_DECISIONS.map((item) => (
                  <option key={item} value={item}>{decisionLabels[item]}</option>
                ))}
              </select>
            </label>

            {decision === 'APPROVE_WITH_EDITS' ? (
              <label className="mt-4 block text-sm font-bold">
                Revised reusable lesson
                <textarea
                  value={reusableLesson}
                  onChange={(event) => setReusableLesson(event.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
                />
              </label>
            ) : null}

            <label className="mt-4 block text-sm font-bold">
              Review reason
              <textarea
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Explain why this should or should not become reusable governance knowledge."
                className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
              />
            </label>

            {message ? <p role="status" aria-live="polite" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
            {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() => void submit()}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : decision === 'REJECT' ? <XCircle className="h-4 w-4" /> : decision === 'APPROVE_WITH_EDITS' ? <PencilLine className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              Record decision
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Detail({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  )
}

function TagGroup({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.length ? values.map((value) => (
          <span key={value} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{value}</span>
        )) : <span className="text-xs text-slate-400">None specified</span>}
      </div>
    </div>
  )
}
