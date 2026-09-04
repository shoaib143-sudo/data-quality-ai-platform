import Link from 'next/link'
import { BrainCircuit, CheckCircle2, CircleAlert, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Investigation = {
  id: string
  project_id: string
  agent_run_id: string
  dataset_id: string
  dataset_version_id: string
  profile_run_id: string | null
  severity: string
  status: string
  summary: string
  probable_root_causes: Array<Record<string, unknown>>
  business_impact: string | null
  recommendations: Array<Record<string, unknown>>
  approval_required: boolean
  workflow_instance_id: string | null
  evidence: Record<string, unknown>
  created_at: string
  updated_at: string
}
type Outcome = {
  id: string
  workflow_instance_id: string
  investigation_id: string
  source_agent_run_id: string
  verification_agent_run_id: string | null
  status: string
  execution_mode: string
  production_mutation_performed: boolean
  remediation_issue_ids: string[] | null
  checks: Record<string, unknown>
  outcome: Record<string, unknown>
  verified_at: string | null
}
type Learning = {
  id: string
  workflow_instance_id: string
  recommendation_action: string
  priority: string | null
  status: string
  effective: boolean | null
  updated_at: string
}
type Dataset = { id: string; name: string }

function tone(value: string) {
  const normalized = value.toUpperCase()
  if (normalized.includes('VERIFIED') || normalized === 'CONTROLLED') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (normalized.includes('FAILED') || normalized === 'CRITICAL' || normalized === 'HIGH') return 'border-red-200 bg-red-50 text-red-700'
  if (normalized.includes('APPROVAL') || normalized.includes('ATTENTION') || normalized === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}
function text(value: unknown) { return typeof value === 'string' ? value : '' }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }

export default async function AutonomousDataQualityPage() {
  await requireUser()
  const supabase = await createClient()
  const [investigationsResult, outcomesResult, learningResult] = await Promise.all([
    supabase.schema('governance').from('data_quality_investigations').select('*').order('updated_at', { ascending: false }).limit(100),
    supabase.schema('governance').from('data_quality_remediation_outcomes').select('*').order('updated_at', { ascending: false }).limit(100),
    supabase.schema('governance').from('data_quality_recommendation_learning').select('id,workflow_instance_id,recommendation_action,priority,status,effective,updated_at').order('updated_at', { ascending: false }).limit(300),
  ])
  const firstError = [investigationsResult.error, outcomesResult.error, learningResult.error].find(Boolean)
  if (firstError) throw new Error(firstError.message)

  const investigations = (investigationsResult.data ?? []) as Investigation[]
  const outcomes = (outcomesResult.data ?? []) as Outcome[]
  const learning = (learningResult.data ?? []) as Learning[]
  const datasetIds = [...new Set(investigations.map((row) => row.dataset_id))]
  const { data: datasets, error: datasetError } = datasetIds.length
    ? await supabase.schema('catalog').from('datasets').select('id,name').in('id', datasetIds)
    : { data: [], error: null }
  if (datasetError) throw new Error(datasetError.message)

  const datasetById = new Map((datasets ?? []).map((row) => [row.id, row as Dataset]))
  const outcomeByWorkflow = new Map(outcomes.map((row) => [row.workflow_instance_id, row]))
  const effectiveLearning = learning.filter((row) => row.status === 'VERIFIED' && row.effective === true).length
  const ineffectiveLearning = learning.filter((row) => row.status === 'INEFFECTIVE' || row.effective === false).length
  const pendingApproval = investigations.filter((row) => row.status === 'APPROVAL_REQUIRED').length
  const verified = outcomes.filter((row) => row.status === 'VERIFIED').length

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm">
        <Link href="/data-quality" className="font-bold text-blue-700">← Data Quality</Link>
        <div className="flex gap-2"><Link href="/workflows" className="rounded-xl border px-3 py-2 text-sm font-semibold">Approvals</Link><Link href="/issues" className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Remediation issues</Link></div>
      </nav>

      <section className="mt-6 rounded-3xl border border-violet-100 bg-white p-7 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700"><BrainCircuit className="h-4 w-4"/> Autonomous quality operations</div>
        <h1 className="mt-4 text-3xl font-black">Execute → Investigate → Recommend → Approve → Remediate → Verify → Learn</h1>
        <p className="mt-3 max-w-4xl text-slate-600">Every successful Data Quality execution is investigated deterministically. High-risk remediation is approval-gated, production mutation remains blocked, and fresh rule execution verifies whether tracked remediation was effective.</p>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-amber-700"><ShieldCheck className="h-4 w-4"/>Pending approval</div><p className="mt-2 text-3xl font-black">{pendingApproval}</p></div>
        <div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4"/>Verified outcomes</div><p className="mt-2 text-3xl font-black">{verified}</p></div>
        <div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-blue-700"><Sparkles className="h-4 w-4"/>Effective recommendations</div><p className="mt-2 text-3xl font-black">{effectiveLearning}</p></div>
        <div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-red-700"><CircleAlert className="h-4 w-4"/>Ineffective signals</div><p className="mt-2 text-3xl font-black">{ineffectiveLearning}</p></div>
      </section>

      <section className="mt-6 space-y-4">
        {investigations.length ? investigations.map((investigation) => {
          const outcome = investigation.workflow_instance_id ? outcomeByWorkflow.get(investigation.workflow_instance_id) : null
          const causes = Array.isArray(investigation.probable_root_causes) ? investigation.probable_root_causes : []
          const recommendations = Array.isArray(investigation.recommendations) ? investigation.recommendations : []
          return <article key={investigation.id} className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{datasetById.get(investigation.dataset_id)?.name ?? investigation.dataset_id.slice(0,8)}</p><h2 className="mt-1 text-xl font-bold">{investigation.summary}</h2></div>
              <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone(investigation.severity)}`}>{investigation.severity}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone(investigation.status)}`}>{investigation.status}</span></div>
            </div>
            {investigation.business_impact ? <p className="mt-3 text-sm leading-6 text-slate-600"><strong>Business impact:</strong> {investigation.business_impact}</p> : null}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Probable root causes</p><div className="mt-2 space-y-2">{causes.length ? causes.map((cause,index)=><div key={index} className="text-sm"><span className="font-semibold">{text(cause.cause) || 'Quality control breach'}</span>{cause.confidence ? <span className="ml-2 text-xs text-slate-500">{Math.round(number(cause.confidence)*100)}% confidence</span> : null}</div>) : <p className="text-sm text-slate-500">No failure root cause required.</p>}</div></div>
              <div className="rounded-2xl bg-blue-50/60 p-4"><p className="text-xs font-bold uppercase text-blue-700">Recommendations</p><div className="mt-2 space-y-2">{recommendations.length ? recommendations.map((recommendation,index)=><div key={index} className="text-sm"><span className="font-mono font-semibold">{text(recommendation.action)}</span>{recommendation.approval_required === true ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">approval</span> : null}<p className="mt-1 text-slate-600">{text(recommendation.rationale)}</p></div>) : <p className="text-sm text-slate-500">Continue monitoring.</p>}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
              {investigation.workflow_instance_id ? <Link href="/workflows" className="inline-flex items-center gap-1 font-bold text-violet-700">Open approval workflow <ExternalLink className="h-3.5 w-3.5"/></Link> : <span className="text-slate-500">No approval required</span>}
              {outcome ? <><span className={`rounded-full border px-2 py-1 text-xs font-bold ${tone(outcome.status)}`}>{outcome.status}</span><span className="text-xs text-slate-500">{outcome.production_mutation_performed ? 'production mutation recorded' : 'tracked governance action only'}</span></> : null}
              <Link href={`/agents/runs/${investigation.agent_run_id}`} className="ml-auto font-semibold text-blue-700">Run evidence →</Link>
            </div>
          </article>
        }) : <div className="rounded-3xl border border-dashed bg-white p-10 text-center text-slate-500">No autonomous Data Quality investigations yet. The next successful Data Quality run will populate this workspace automatically.</div>}
      </section>
    </div>
  </main>
}
