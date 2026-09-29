'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import type { NegativeLearningCaseAdminItem } from '@/lib/agents/governed-negative-case-learning-admin'
import {
  NEGATIVE_CASE_ADMIN_DECISIONS,
  type NegativeCaseAdminDecision,
} from '@/lib/agents/governed-negative-case-learning-service'

const labels: Record<NegativeCaseAdminDecision, string> = {
  APPROVE_NEGATIVE_CASE: 'Approve negative case',
  REJECT: 'Reject',
  DEFER: 'Defer',
  MARK_ONE_OFF: 'Mark one-off',
}

export function NegativeLearningCaseReviewManager({ items }: { items: NegativeLearningCaseAdminItem[] }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(items[0]?.candidateId ?? '')
  const [decision, setDecision] = useState<NegativeCaseAdminDecision>('APPROVE_NEGATIVE_CASE')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const selected = useMemo(() => items.find((item) => item.candidateId === selectedId) ?? null, [items, selectedId])

  async function submit() {
    if (!selected || !reason.trim()) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/admin/learning-cases/' + selected.candidateId + '/negative-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: reason.trim() }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Negative-case review failed.')
      setMessage(labels[decision] + ' recorded.')
      setReason('')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Negative-case review failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!items.length) return null

  return <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]" aria-label="Negative learning review queue">
    <div className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Failure learning queue</p><h2 className="mt-1 text-xl font-black">{items.length} negative candidate{items.length === 1 ? '' : 's'}</h2></div>
        <AlertTriangle className="h-5 w-5 text-amber-600"/>
      </div>
      <div className="mt-4 space-y-3">{items.map((item) => <button key={item.candidateId} type="button" onClick={() => { setSelectedId(item.candidateId); setMessage(''); setError('') }} className={'w-full rounded-2xl border p-4 text-left transition ' + (selectedId === item.candidateId ? 'border-amber-300 bg-amber-50' : 'border-slate-200 hover:border-amber-200 hover:bg-slate-50')}>
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase text-amber-700">{item.runMode}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{item.reviewStatus}</span></div>
        <p className="mt-2 font-bold">{item.useCaseKey}</p>
        <p className="mt-1 text-xs text-slate-500">{item.projectName} · {item.agentKey} · {item.occurrenceCount} occurrence{item.occurrenceCount === 1 ? '' : 's'}</p>
        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.failureSummary}</p>
      </button>)}</div>
    </div>
    {selected ? <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Candidate negative case</p><h2 className="mt-1 text-2xl font-black">{selected.useCaseKey}</h2><p className="mt-1 text-sm text-slate-500">{selected.projectName} · {selected.agentKey} · {selected.skillKey} · {selected.occurrenceCount} verified occurrence{selected.occurrenceCount === 1 ? '' : 's'}</p></div>
        <Link href={`/agents/runs/${encodeURIComponent(selected.sourceAgentRunId)}`} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold text-amber-800">Source run <ExternalLink className="h-4 w-4"/></Link>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"/>
        <p className="text-sm text-amber-900"><strong>Negative learning is context only.</strong> Approval records what future agents should avoid. It never grants tool, mutation, approval, or execution authority.</p>
      </div>
      <div className="mt-5 grid gap-4">
        <Detail title="Problem" value={selected.problemSignature}/>
        <Detail title="Failure evidence" value={selected.failureSummary}/>
        <Detail title="Avoid lesson" value={selected.avoidLesson}/>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Tags title="Evidence" values={selected.evidenceRefs}/>
        <Tags title="Verification evidence" values={selected.verificationEvidenceRefs}/>
      </div>
      <div className="mt-6 border-t pt-6">
        <label className="block text-sm font-bold">Decision<select value={decision} onChange={(event) => { const next=event.target.value as NegativeCaseAdminDecision; if (NEGATIVE_CASE_ADMIN_DECISIONS.includes(next)) setDecision(next) }} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5">{NEGATIVE_CASE_ADMIN_DECISIONS.map((item)=><option key={item} value={item}>{labels[item]}</option>)}</select></label>
        <label className="mt-4 block text-sm font-bold">Review reason<textarea required value={reason} onChange={(event)=>setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Explain why this failure pattern should or should not become reusable avoidance knowledge."/></label>
        {message ? <p role="status" aria-live="polite" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <button type="button" disabled={busy || !reason.trim()} onClick={()=>void submit()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : decision === 'REJECT' ? <XCircle className="h-4 w-4"/> : <CheckCircle2 className="h-4 w-4"/>}Record decision</button>
      </div>
    </div> : null}
  </section>
}

function Detail({ title, value }: { title: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-2 text-sm leading-6 text-slate-700">{value}</p></div>
}

function Tags({ title, values }: { title: string; values: string[] }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p><div className="mt-2 flex flex-wrap gap-1.5">{values.length ? values.map((value)=><span key={value} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{value}</span>) : <span className="text-xs text-slate-400">None</span>}</div></div>
}
