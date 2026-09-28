'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react'
import { MATURITY_LEVELS, type MaturityQuestion, type OrganizationAssessmentProfile } from '@/lib/governance/maturity-framework'
import type { MaturityScorecard } from '@/lib/governance/maturity-scoring'

type StoredResponse = {
  question_id: string
  maturity: number
  target: number | null
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  evidence_confidence: number | null
  coverage: number | null
  comment: string | null
}

type Assessment = {
  id: string
  framework_version: string
  status: string
  created_at: string
  updated_at: string
} | null

type AssessmentPayload = {
  organizationId: string
  organizationRole: string | null
  canManageProfile: boolean
  assessment: Assessment
  profile: OrganizationAssessmentProfile
  questions: MaturityQuestion[]
  currentUserResponses: StoredResponse[]
  allResponses: StoredResponse[]
  scorecard: MaturityScorecard
  evidenceCount: number
  observationCount: number
  history: Array<{ id: string; status: string; framework_version: string; scorecard: Record<string, unknown>; created_at: string; completed_at: string | null }>
}

type DraftAnswer = {
  maturity: number | null
  target: number
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  evidenceConfidence: number | null
  coverage: number | null
  comment: string
}

type BooleanProfileKey = 'regulated' | 'processesPersonalData' | 'processesSensitiveData' | 'usesAi' | 'sharesDataExternally' | 'crossBorderTransfers'

const booleanProfileFields: Array<{ key: BooleanProfileKey; label: string; detail: string }> = [
  { key: 'regulated', label: 'Regulated organization', detail: 'Activates stronger risk and evidence expectations.' },
  { key: 'processesPersonalData', label: 'Processes personal data', detail: 'Activates privacy, minimization, retention, and disposal questions.' },
  { key: 'processesSensitiveData', label: 'Processes sensitive data', detail: 'Raises the relevance of privacy, security, and impact assessment controls.' },
  { key: 'usesAi', label: 'Uses AI or machine learning', detail: 'Activates AI governance and AI data readiness questions.' },
  { key: 'sharesDataExternally', label: 'Shares data externally', detail: 'Activates external agreements and data-sharing governance questions.' },
  { key: 'crossBorderTransfers', label: 'Transfers data across borders', detail: 'Activates cross-border governance questions.' },
]

function blankAnswer(question: MaturityQuestion, stored?: StoredResponse): DraftAnswer {
  return {
    maturity: stored?.maturity ?? null,
    target: stored?.target ?? question.defaultTarget,
    priority: stored?.priority ?? (question.criticality === 'CRITICAL' ? 'HIGH' : 'MEDIUM'),
    evidenceConfidence: stored?.evidence_confidence ?? null,
    coverage: stored?.coverage ?? null,
    comment: stored?.comment ?? '',
  }
}

function Metric({ label, value, suffix = '' }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.13em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}{suffix}</p>
    </div>
  )
}

export function GovernanceMaturityOnboarding({ initial }: { initial: AssessmentPayload }) {
  const [data, setData] = useState(initial)
  const [profile, setProfile] = useState<OrganizationAssessmentProfile>(initial.profile)
  const [phase, setPhase] = useState<'baseline' | 'full' | 'results'>(
    initial.scorecard.completion > 0 ? 'results' : 'baseline',
  )
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [evidenceLabel, setEvidenceLabel] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceType, setEvidenceType] = useState('DOCUMENT')

  const responseByQuestion = useMemo(
    () => new Map(data.currentUserResponses.map(response => [response.question_id, response])),
    [data.currentUserResponses],
  )
  const visibleQuestions = useMemo(
    () => data.questions.filter(question => phase === 'full' || question.baseline),
    [data.questions, phase],
  )
  const question = visibleQuestions[Math.min(index, Math.max(0, visibleQuestions.length - 1))]
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>(() => Object.fromEntries(
    initial.questions.map(question => [question.id, blankAnswer(question, initial.currentUserResponses.find(response => response.question_id === question.id))]),
  ))

  function refreshDrafts(next: AssessmentPayload) {
    setDrafts(Object.fromEntries(next.questions.map(question => [
      question.id,
      blankAnswer(question, next.currentUserResponses.find(response => response.question_id === question.id)),
    ])))
  }

  async function configureAssessment(startNew = false) {
    setBusy(true)
    setFeedback('')
    try {
      const response = await fetch('/api/governance/maturity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, startNew }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to configure assessment.')
      setData(payload)
      setProfile(payload.profile)
      refreshDrafts(payload)
      setPhase('baseline')
      setIndex(0)
      setFeedback(startNew ? 'New reassessment cycle created.' : 'Organization context saved. Your adaptive baseline is ready.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to configure assessment.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyConnectedEstate() {
    if (!data.assessment) return
    setBusy(true)
    setFeedback('')
    try {
      const response = await fetch('/api/governance/maturity/observe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: data.assessment.id }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to verify connected governance coverage.')
      setData(payload.assessment)
      setProfile(payload.assessment.profile)
      refreshDrafts(payload.assessment)
      setFeedback(
        payload.result?.skipped
          ? 'System verification is ready, but no connected datasets are available yet.'
          : `DataNexus recorded ${payload.result?.observations?.length ?? 0} system observations.`,
      )
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to verify connected governance coverage.')
    } finally {
      setBusy(false)
    }
  }

  async function saveAnswer(moveNext = true) {
    if (!question || !data.assessment) return
    const draft = drafts[question.id] ?? blankAnswer(question, responseByQuestion.get(question.id))
    if (draft.maturity === null) {
      setFeedback('Choose the maturity statement that best matches current operating reality.')
      return
    }
    setBusy(true)
    setFeedback('')
    try {
      const response = await fetch('/api/governance/maturity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: data.assessment.id,
          responses: [{
            questionId: question.id,
            maturity: draft.maturity,
            target: draft.target,
            priority: draft.priority,
            evidenceConfidence: draft.evidenceConfidence,
            coverage: draft.coverage,
            comment: draft.comment,
          }],
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save response.')

      if (evidenceLabel.trim()) {
        const evidenceResponse = await fetch('/api/governance/maturity/evidence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assessmentId: data.assessment.id,
            questionId: question.id,
            evidenceType,
            label: evidenceLabel.trim(),
            referenceUri: evidenceUrl.trim() || undefined,
          }),
        })
        const evidencePayload = await evidenceResponse.json()
        if (!evidenceResponse.ok) throw new Error(evidencePayload.error ?? 'Response saved, but evidence could not be recorded.')
        setData(evidencePayload.assessment)
      } else {
        setData(payload)
      }

      const nextPayload = evidenceLabel.trim() ? await fetch('/api/governance/maturity').then(result => result.json()) : payload
      setData(nextPayload)
      setProfile(nextPayload.profile)
      refreshDrafts(nextPayload)
      setEvidenceLabel('')
      setEvidenceUrl('')
      setFeedback('Response saved.')

      if (moveNext) {
        if (index < visibleQuestions.length - 1) setIndex(index + 1)
        else setPhase('results')
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save response.')
    } finally {
      setBusy(false)
    }
  }

  function updateDraft(patch: Partial<DraftAnswer>) {
    if (!question) return
    setDrafts(current => ({
      ...current,
      [question.id]: { ...(current[question.id] ?? blankAnswer(question, responseByQuestion.get(question.id))), ...patch },
    }))
  }

  const baselineQuestions = data.questions.filter(item => item.baseline)
  const baselineAnswered = baselineQuestions.filter(item => responseByQuestion.has(item.id)).length
  const fullAnswered = data.questions.filter(item => responseByQuestion.has(item.id)).length
  const currentDraft = question ? (drafts[question.id] ?? blankAnswer(question, responseByQuestion.get(question.id))) : null

  if (!data.assessment) {
    return (
      <section className="mt-5 space-y-5">
        <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm sm:p-9">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">DataNexus Governance Maturity & Readiness Assessment</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Establish your governance baseline.</h1>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-600">DataNexus uses organizational context to adapt the assessment. The resulting score is a DataNexus maturity assessment, not legal advice, regulatory certification, or an official score from any source framework.</p>
        </header>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-black">Organization context</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">This information controls which questions apply. It does not increase or decrease maturity by itself.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">Organization type
              <select value={profile.organizationType ?? ''} onChange={event => setProfile(current => ({ ...current, organizationType: event.target.value as OrganizationAssessmentProfile['organizationType'] }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                <option value="">Select</option><option value="PRIVATE">Private</option><option value="PUBLIC">Public</option><option value="NONPROFIT">Nonprofit</option><option value="OTHER">Other</option>
              </select>
            </label>
            <label className="text-sm font-bold">Industry
              <input value={profile.industry ?? ''} onChange={event => setProfile(current => ({ ...current, industry: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" placeholder="Financial services, healthcare, public sector..." />
            </label>
            <label className="text-sm font-bold">Country or primary jurisdiction
              <input value={profile.country ?? ''} onChange={event => setProfile(current => ({ ...current, country: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" placeholder="Singapore" />
            </label>
            <label className="text-sm font-bold">Employee size
              <select value={profile.employeeBand ?? ''} onChange={event => setProfile(current => ({ ...current, employeeBand: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                <option value="">Select</option><option value="1-49">1 to 49</option><option value="50-249">50 to 249</option><option value="250-999">250 to 999</option><option value="1000-4999">1,000 to 4,999</option><option value="5000+">5,000+</option>
              </select>
            </label>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {booleanProfileFields.map(field => (
              <label key={String(field.key)} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input type="checkbox" checked={profile[field.key] === true} onChange={event => setProfile(current => ({ ...current, [field.key]: event.target.checked }))} className="mt-1 h-4 w-4" />
                <span><span className="block font-bold">{field.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{field.detail}</span></span>
              </label>
            ))}
          </div>
          <button onClick={() => void configureAssessment(false)} disabled={busy} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Preparing assessment…' : 'Build my governance baseline'} <ArrowRight className="h-4 w-4" />
          </button>
          {feedback ? <p role="status" className="mt-3 text-sm font-semibold text-slate-600">{feedback}</p> : null}
        </div>
      </section>
    )
  }

  return (
    <section className="mt-5 space-y-5">
      <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Governance maturity onboarding · {data.assessment.framework_version}</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">From self-assessment to verified governance posture.</h1>
            <p className="mt-4 max-w-4xl text-base leading-7 text-slate-600">Assess current operating reality, capture supporting evidence, set an appropriate target state, and turn material gaps into DataNexus actions. Scores remain explainable and separate maturity from evidence, coverage, risk, and consensus.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="font-black">{data.assessment.status}</p>
            <p className="mt-1 text-xs text-slate-500">{baselineAnswered}/{baselineQuestions.length} baseline · {fullAnswered}/{data.questions.length} applicable</p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Maturity" value={data.scorecard.maturity} suffix="/100" />
        <Metric label="Target" value={data.scorecard.targetMaturity} suffix="/100" />
        <Metric label="Evidence confidence" value={data.scorecard.evidenceConfidence ?? 'Not scored'} suffix={data.scorecard.evidenceConfidence === null ? '' : '%'} />
        <Metric label="Risk exposure" value={data.scorecard.riskExposure} />
      </div>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Assessment phases">
        <button onClick={() => { setPhase('baseline'); setIndex(0) }} className={`rounded-xl px-4 py-2 text-sm font-black ${phase === 'baseline' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Quick baseline</button>
        <button onClick={() => { setPhase('full'); setIndex(0) }} className={`rounded-xl px-4 py-2 text-sm font-black ${phase === 'full' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Full assessment</button>
        <button onClick={() => setPhase('results')} className={`rounded-xl px-4 py-2 text-sm font-black ${phase === 'results' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Results & roadmap</button>
      </nav>

      {phase !== 'results' && question && currentDraft ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">{question.domainId} · {question.criticality}</p>
              <h2 className="mt-2 text-2xl font-black">{question.shortLabel}</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Question {index + 1} of {visibleQuestions.length}</span>
          </div>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-700">{question.prompt}</p>

          <fieldset className="mt-6 grid gap-3">
            <legend className="mb-2 text-sm font-black">Choose the statement that best matches current operating reality</legend>
            {MATURITY_LEVELS.map(level => (
              <label key={level.level} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${currentDraft.maturity === level.level ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name={question.id} value={level.level} checked={currentDraft.maturity === level.level} onChange={() => updateDraft({ maturity: level.level })} className="mt-1" />
                <span><span className="block font-black">{level.level} · {level.label}</span><span className="mt-1 block text-sm leading-6 text-slate-600">{question.maturityStatements[level.level]}</span></span>
              </label>
            ))}
          </fieldset>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <label className="text-sm font-bold">Priority
              <select value={currentDraft.priority} onChange={event => updateDraft({ priority: event.target.value as DraftAnswer['priority'] })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                <option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
              </select>
            </label>
            <label className="text-sm font-bold">Target maturity
              <select disabled={!data.canManageProfile} value={currentDraft.target} onChange={event => updateDraft({ target: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 disabled:bg-slate-100">
                {MATURITY_LEVELS.map(level => <option key={level.level} value={level.level}>{level.level} · {level.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold">Reported control coverage, optional
              <input type="number" min={0} max={100} value={currentDraft.coverage ?? ''} onChange={event => updateDraft({ coverage: event.target.value === '' ? null : Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" placeholder="0 to 100%" />
            </label>
          </div>

          <label className="mt-4 block text-sm font-bold">Comments and context
            <textarea value={currentDraft.comment} onChange={event => updateDraft({ comment: event.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" placeholder="Scope, exceptions, known limitations, or assumptions." />
          </label>

          <section className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
            <div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-emerald-700" /><h3 className="font-black">Optional supporting evidence</h3></div>
            <p className="mt-1 text-xs leading-5 text-slate-600">Evidence is stored separately from the answer so DataNexus can later corroborate, expire, or challenge it without rewriting the original response.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-bold">Evidence type
                <select value={evidenceType} onChange={event => setEvidenceType(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <option value="DOCUMENT">Document</option><option value="URL">URL</option><option value="CONTROL_REPORT">Control report</option><option value="SYSTEM_CONNECTION">System connection</option><option value="OWNER_ATTESTATION">Owner attestation</option><option value="AUDIT_RESULT">Audit result</option><option value="COMMENT">Comment</option>
                </select>
              </label>
              <label className="text-xs font-bold">Evidence label
                <input value={evidenceLabel} onChange={event => setEvidenceLabel(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="Data Governance Policy v3" />
              </label>
              <label className="text-xs font-bold">Reference, optional
                <input value={evidenceUrl} onChange={event => setEvidenceUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="https:// or repository reference" />
              </label>
            </div>
          </section>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button type="button" disabled={index === 0 || busy} onClick={() => setIndex(current => Math.max(0, current - 1))} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-600 disabled:opacity-40">Previous</button>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void saveAnswer(false)} className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-black text-blue-700 disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" disabled={busy} onClick={() => void saveAnswer(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{index === visibleQuestions.length - 1 ? 'Finish section' : 'Save & next'} <ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
          {feedback ? <p role="status" className="mt-4 text-sm font-semibold text-slate-600">{feedback}</p> : null}
        </div>
      ) : null}

      {phase === 'results' ? (
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Governance baseline</p>
                <h2 className="mt-2 text-3xl font-black">Your current organizational posture</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">This assessment separates declared maturity from supporting evidence and observed coverage. A strong aggregate score does not suppress critical gaps.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Completion" value={data.scorecard.completion} suffix="%" />
                <Metric label="Respondents" value={data.scorecard.respondentCount} />
                <Metric label="Evidence items" value={data.evidenceCount} />
                <Metric label="System observations" value={data.observationCount} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {data.scorecard.domains.map(domain => (
              <article key={domain.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3"><h3 className="font-black">{domain.label}</h3><span className="text-sm font-black">{domain.maturity ?? 'Not scored'}{domain.maturity === null ? '' : '/100'}</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${domain.maturity ?? 0}%` }} /></div>
                <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{domain.answered}/{domain.applicable} answered</span><span>Target {domain.target ?? 'Not scored'}</span></div>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2"><Target className="h-5 w-5 text-blue-600" /><h2 className="text-2xl font-black">Prioritized improvement roadmap</h2></div>
            <p className="mt-2 text-sm text-slate-600">Roadmap priority is derived from target gap, capability weight, criticality, and your stated priority. It does not alter the underlying maturity answer.</p>
            <div className="mt-5 grid gap-3">
              {data.scorecard.roadmap.length ? data.scorecard.roadmap.slice(0, 8).map((item, position) => (
                <article key={item.questionId} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">{position + 1}. {item.label}</h3><span className="rounded-full bg-white px-3 py-1 text-xs font-black">{item.criticality} · Gap {item.gap}</span></div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{item.recommendedAction}</p>
                  <p className="mt-2 text-sm font-bold text-blue-700">DataNexus action: {item.dataNexusAction}</p>
                </article>
              )) : <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">No material target gaps have been scored yet.</p>}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h2 className="text-2xl font-black">Critical gaps</h2></div>
            <p className="mt-2 text-sm text-slate-600">Critical weaknesses remain visible even when other capabilities raise the aggregate maturity score.</p>
            <div className="mt-5 grid gap-3">
              {data.scorecard.criticalGaps.length ? data.scorecard.criticalGaps.map(gap => (
                <article key={gap.questionId} className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">{gap.label}</h3><span className="rounded-full bg-white px-3 py-1 text-xs font-black">Current {gap.maturity} · Target {gap.target}</span></div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{gap.recommendedAction}</p>
                  <p className="mt-2 text-sm font-bold text-blue-700">DataNexus action: {gap.dataNexusAction}</p>
                </article>
              )) : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />No currently answered critical capability meets the critical-gap trigger.</div>}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><ShieldCheck className="h-5 w-5 text-blue-600" /><p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Evidence confidence</p><p className="mt-1 text-2xl font-black">{data.scorecard.evidenceConfidence ?? 'Not scored'}{data.scorecard.evidenceConfidence === null ? '' : '%'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><Gauge className="h-5 w-5 text-blue-600" /><p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Control coverage</p><p className="mt-1 text-2xl font-black">{data.scorecard.controlCoverage ?? 'Not observed'}{data.scorecard.controlCoverage === null ? '' : '%'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><Users className="h-5 w-5 text-blue-600" /><p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Assessment consensus</p><p className="mt-1 text-2xl font-black">{data.scorecard.assessmentConsensus ?? 'Needs 2+ respondents'}{data.scorecard.assessmentConsensus === null ? '' : '%'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><Target className="h-5 w-5 text-blue-600" /><p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Target maturity</p><p className="mt-1 text-2xl font-black">{data.scorecard.targetMaturity}/100</p></div>
          </section>

          <section className="rounded-3xl border border-blue-100 bg-blue-50 p-6 sm:p-8">
            <div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-blue-700" /><h2 className="text-2xl font-black">Next actions</h2></div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <button onClick={() => { setPhase('baseline'); setIndex(0) }} className="rounded-2xl bg-white p-4 text-left shadow-sm"><p className="font-black">Complete quick baseline</p><p className="mt-1 text-xs leading-5 text-slate-500">{baselineAnswered}/{baselineQuestions.length} answered</p></button>
              <button onClick={() => { setPhase('full'); setIndex(0) }} className="rounded-2xl bg-white p-4 text-left shadow-sm"><p className="font-black">Deepen the assessment</p><p className="mt-1 text-xs leading-5 text-slate-500">{fullAnswered}/{data.questions.length} applicable questions answered</p></button>
              <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="font-black">Add more evidence</p><p className="mt-1 text-xs leading-5 text-slate-500">Evidence remains independently verifiable and can be corroborated by DataNexus observations.</p></div>
            </div>
            {data.canManageProfile ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={() => void verifyConnectedEstate()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-40">
                  Verify connected estate <ShieldCheck className="h-4 w-4" />
                </button>
                <button onClick={() => void configureAssessment(true)} disabled={busy} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:opacity-40">
                  Start a new reassessment cycle <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            {feedback ? <p role="status" className="mt-4 text-sm font-semibold text-slate-600">{feedback}</p> : null}
          </section>

          {data.history.length > 1 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-black">Assessment history</h2>
              <div className="mt-4 grid gap-3">
                {data.history.map(item => {
                  const score = typeof item.scorecard?.maturity === 'number' ? item.scorecard.maturity : null
                  return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div><p className="font-bold">{new Date(item.created_at).toLocaleDateString()}</p><p className="text-xs text-slate-500">{item.status} · {item.framework_version}</p></div><p className="text-lg font-black">{score === null ? 'Not scored' : `${score}/100`}</p></div>
                })}
              </div>
            </section>
          ) : null}

          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500">DataNexus Governance Maturity & Readiness Assessment is an organizational learning and prioritization tool. It is not legal advice, regulatory certification, or an official score from the Broadband Commission or any other referenced framework.</p>
        </div>
      ) : null}
    </section>
  )
}
