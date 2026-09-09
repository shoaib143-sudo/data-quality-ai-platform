import Link from 'next/link'
import { SearchCheck, ShieldCheck, TestTube2 } from 'lucide-react'
import { authorizeProject } from '@/lib/auth/authorize'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }

type CaseRow = {
  id: string
  case_key: string
  query_text: string
  authority: string
  evidence_refs: string[]
  reviewer_capability: string | null
  reviewed_at: string | null
  source_reference: string | null
  created_at: string
}

type JudgmentRow = { case_version_id: string; object_key: string; relevance: number }
type EvaluationRow = { id: string; metric_name: string; score: number | null; evaluator_type: string; evaluator_version: string | null; evidence_refs: string[]; observed_at: string }

export default async function RetrievalEvaluationPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const supabase = await createClient()
  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId) ? params.projectId! : projects[0]?.id

  let cases: CaseRow[] = []
  let judgments: JudgmentRow[] = []
  let evaluations: EvaluationRow[] = []
  if (selectedProjectId) {
    await authorizeProject(user.id, selectedProjectId, 'admin.manage')
    const [caseResult, judgmentResult, evaluationResult] = await Promise.all([
      supabase.schema('governance').from('ai_retrieval_evaluation_case_effective').select('id,case_key,query_text,authority,evidence_refs,reviewer_capability,reviewed_at,source_reference,created_at').eq('project_id', selectedProjectId).order('created_at', { ascending: false }).limit(100),
      supabase.schema('governance').from('ai_retrieval_relevance_judgments').select('case_version_id,object_key,relevance').eq('project_id', selectedProjectId).order('created_at', { ascending: false }).limit(500),
      supabase.schema('governance').from('ai_evaluation_results').select('id,metric_name,score,evaluator_type,evaluator_version,evidence_refs,observed_at').eq('project_id', selectedProjectId).eq('evaluation_type', 'RETRIEVAL_RELEVANCE').order('observed_at', { ascending: false }).limit(100),
    ])
    if (caseResult.error) throw new Error(`Unable to load retrieval evaluation cases: ${caseResult.error.message}`)
    if (judgmentResult.error) throw new Error(`Unable to load retrieval relevance judgments: ${judgmentResult.error.message}`)
    if (evaluationResult.error) throw new Error(`Unable to load retrieval evaluation evidence: ${evaluationResult.error.message}`)
    cases = (caseResult.data ?? []) as CaseRow[]
    judgments = (judgmentResult.data ?? []) as JudgmentRow[]
    evaluations = (evaluationResult.data ?? []) as EvaluationRow[]
  }

  const positiveJudgments = judgments.filter((item) => item.relevance > 0).length
  const benchmarkReady = cases.length > 0 && positiveJudgments > 0
  const judgmentCounts = new Map<string, number>()
  for (const judgment of judgments) judgmentCounts.set(judgment.case_version_id, (judgmentCounts.get(judgment.case_version_id) ?? 0) + 1)

  return <main className="min-h-screen bg-slate-50 p-5 sm:p-8"><div className="mx-auto max-w-7xl space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href={selectedProjectId ? `/admin/ai-command-center?projectId=${selectedProjectId}` : '/admin/ai-command-center'} className="text-sm font-semibold text-slate-600">← AI Command Center</Link><Link href="/admin" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">Administration</Link></div>

    <header className="rounded-3xl border bg-white p-7 shadow-sm"><div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><SearchCheck className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Retrieval evaluation evidence</p><h1 className="text-3xl font-black">Relevance Labels & Benchmark Readiness</h1><p className="mt-2 max-w-4xl text-sm text-slate-600">Read-only canonical evidence for human-reviewed or governed-import relevance labels and retrieval benchmark results. This page does not create labels, run benchmarks, promote rerankers, or change model lifecycle state.</p></div></div></header>

    <form method="get" className="rounded-2xl border bg-white p-5"><label className="block text-sm font-semibold">Project<select name="projectId" defaultValue={selectedProjectId} className="mt-2 block w-full max-w-xl rounded-xl border bg-white px-3 py-2 font-normal">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button className="mt-3 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Load retrieval evidence</button></form>

    {!selectedProjectId ? <section className="rounded-2xl border bg-white p-6 text-sm text-slate-600">No authorized project is available for this account.</section> : <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border bg-white p-5"><SearchCheck className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{cases.length}</p><p className="text-xs font-bold uppercase text-slate-500">Effective labeled cases</p></article>
        <article className="rounded-2xl border bg-white p-5"><ShieldCheck className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{positiveJudgments}</p><p className="text-xs font-bold uppercase text-slate-500">Positive judgments</p></article>
        <article className="rounded-2xl border bg-white p-5"><TestTube2 className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{evaluations.length}</p><p className="text-xs font-bold uppercase text-slate-500">Benchmark metric records</p></article>
        <article className="rounded-2xl border bg-white p-5"><ShieldCheck className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{benchmarkReady ? 'READY' : 'BLOCKED'}</p><p className="text-xs font-bold uppercase text-slate-500">Benchmark data readiness</p></article>
      </section>

      <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Governed relevance cases</h2><p className="mt-1 text-sm text-slate-500">Latest append-only case version per stable case key. Labels are evidence only and never model approval.</p><div className="mt-5 space-y-3">{cases.length ? cases.map((item) => <article key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{item.case_key}</p><p className="mt-1 text-sm text-slate-700">{item.query_text}</p><p className="mt-2 text-xs text-slate-400">{item.authority} · {judgmentCounts.get(item.id) ?? 0} judgments · {new Date(item.created_at).toLocaleString()}</p></div><span className="rounded-full border px-3 py-1 text-xs font-black">{item.authority}</span></div><p className="mt-3 text-xs text-slate-500">Evidence: {item.evidence_refs.join(', ')}</p></article>) : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No canonical retrieval relevance cases are recorded. A model-backed reranker benchmark remains data-blocked until explicit human-reviewed or governed-import labels exist.</p>}</div></section>

      <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Retrieval benchmark evidence</h2><p className="mt-1 text-sm text-slate-500">MRR, nDCG, Recall and related retrieval metrics persisted by the canonical EvaluationEngine.</p><div className="mt-5 overflow-x-auto">{evaluations.length ? <table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Observed</th><th className="p-3">Metric</th><th className="p-3">Score</th><th className="p-3">Evaluator</th><th className="p-3">Evidence refs</th></tr></thead><tbody>{evaluations.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-3 text-xs">{new Date(item.observed_at).toLocaleString()}</td><td className="p-3 font-bold">{item.metric_name}</td><td className="p-3">{item.score == null ? 'Not scored' : item.score.toFixed(4)}</td><td className="p-3">{item.evaluator_type}{item.evaluator_version ? ` · v${item.evaluator_version}` : ''}</td><td className="p-3 text-xs">{item.evidence_refs.join(', ')}</td></tr>)}</tbody></table> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No retrieval relevance benchmark results are recorded for this project.</p>}</div></section>

      <section className="rounded-2xl border bg-slate-950 p-6 text-white"><h2 className="text-lg font-black">Authority boundary</h2><p className="mt-3 max-w-4xl text-sm text-slate-300">Relevance labels establish evaluation truth only when explicitly reviewed or governed-imported. Benchmark metrics establish ranking evidence only. Neither automatically selects, promotes, activates, deploys, or approves a reranker or AI-system version.</p></section>
    </>}
  </div></main>
}
