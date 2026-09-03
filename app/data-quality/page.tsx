import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Gauge, Layers3, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type ProfileRun = {
  id: string
  dataset_version_id: string
  status: string
  row_count: number | null
  column_count: number | null
  summary: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  error_code: string | null
}
type DatasetVersion = { id: string; dataset_id: string; version_number: number }
type Dataset = { id: string; project_id: string; name: string }
type Score = { profile_run_id: string; completeness_score: number | null; uniqueness_score: number | null; validity_score: number | null; accuracy_score: number | null; overall_score: number | null }
type Finding = { id: string; profile_run_id: string; finding_type: string; severity: string; title: string; description: string; confidence: number | null; recommendation: Record<string, unknown> | null }

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function formatScore(value: number | null | undefined) { return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'Not available' }
function scoreTone(value: number | null | undefined) {
  if (typeof value !== 'number') return 'text-slate-400'
  if (value >= 0.9) return 'text-emerald-600'
  if (value >= 0.75) return 'text-blue-600'
  if (value >= 0.6) return 'text-amber-600'
  return 'text-red-600'
}
function severityTone(value: string) {
  const severity = value.toUpperCase()
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'border-red-200 bg-red-50 text-red-700'
  if (severity === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}
function impactForFinding(finding: Finding) {
  const text = `${finding.finding_type} ${finding.title} ${finding.description}`.toLowerCase()
  if (text.includes('null') || text.includes('missing')) return 'Incomplete information can lead to missed customers, reporting gaps and manual rework.'
  if (text.includes('duplicate')) return 'Duplicate records can inflate volumes, create duplicate actions and weaken the customer view.'
  if (text.includes('valid') || text.includes('format')) return 'Invalid values can disrupt reporting, integrations and business rules.'
  if (text.includes('outlier') || text.includes('range')) return 'Unexpected values can distort KPIs, forecasts and operational decisions.'
  return 'Recurring data issues reduce confidence in decisions and increase remediation effort.'
}

export default async function DataQualityPage() {
  await requireUser()
  const supabase = await createClient()

  const { data: profileRuns, error: runsError } = await supabase.schema('profiling').from('profile_runs').select('id, dataset_version_id, status, row_count, column_count, summary, started_at, completed_at, error_code').order('started_at', { ascending: false }).limit(20)
  if (runsError) throw new Error(`Unable to load profiling runs: ${runsError.message}`)

  const runs = (profileRuns ?? []) as ProfileRun[]
  const runIds = runs.map(run => run.id)
  const versionIds = runs.map(run => run.dataset_version_id)
  const [scoresResult, findingsResult, versionsResult] = await Promise.all([
    runIds.length ? supabase.schema('profiling').from('data_quality_scores').select('profile_run_id, completeness_score, uniqueness_score, validity_score, accuracy_score, overall_score').in('profile_run_id', runIds) : Promise.resolve({ data: [], error: null }),
    runIds.length ? supabase.schema('profiling').from('profile_findings').select('id, profile_run_id, finding_type, severity, title, description, confidence, recommendation').in('profile_run_id', runIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    versionIds.length ? supabase.schema('catalog').from('dataset_versions').select('id, dataset_id, version_number').in('id', versionIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (scoresResult.error) throw new Error(`Unable to load quality scores: ${scoresResult.error.message}`)
  if (findingsResult.error) throw new Error(`Unable to load quality findings: ${findingsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load dataset versions: ${versionsResult.error.message}`)

  const versions = (versionsResult.data ?? []) as DatasetVersion[]
  const datasetIds = versions.map(version => version.dataset_id)
  const { data: datasetRows, error: datasetsError } = datasetIds.length ? await supabase.schema('catalog').from('datasets').select('id, project_id, name').in('id', datasetIds) : { data: [], error: null }
  if (datasetsError) throw new Error(`Unable to load datasets: ${datasetsError.message}`)

  const scores = (scoresResult.data ?? []) as Score[]
  const findings = (findingsResult.data ?? []) as Finding[]
  const versionsById = new Map(versions.map(version => [version.id, version]))
  const datasetsById = new Map((datasetRows ?? []).map(dataset => [dataset.id, dataset as Dataset]))
  const scoresByRunId = new Map(scores.map(score => [score.profile_run_id, score]))
  const findingsByRunId = new Map<string, Finding[]>()
  for (const finding of findings) findingsByRunId.set(finding.profile_run_id, [...(findingsByRunId.get(finding.profile_run_id) ?? []), finding])

  const completedRuns = runs.filter(run => run.status === 'COMPLETED')
  const scoredRuns = completedRuns.filter(run => typeof scoresByRunId.get(run.id)?.overall_score === 'number')
  const averageScore = scoredRuns.length ? scoredRuns.reduce((sum, run) => sum + (scoresByRunId.get(run.id)?.overall_score ?? 0), 0) / scoredRuns.length : null
  const criticalCount = findings.filter(finding => ['CRITICAL', 'HIGH'].includes(String(finding.severity).toUpperCase())).length
  const mediumCount = findings.filter(finding => String(finding.severity).toUpperCase() === 'MEDIUM').length

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_4%_0%,_rgba(219,234,254,0.82),_transparent_30%),radial-gradient(circle_at_96%_3%,_rgba(243,232,255,0.78),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_48%,_#f8fafc_100%)] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/90 px-5 py-3 shadow-sm backdrop-blur">
          <Link href="/dashboard" className="flex items-center gap-3 text-sm font-bold text-slate-800 hover:text-blue-700"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5" /></span>Data Governance PowerHouse</Link>
          <div className="flex flex-wrap gap-2"><Link href="/datasets" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">Datasets</Link><Link href="/profiling" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">Profiling</Link><Link href="/observability" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Observability</Link></div>
        </nav>

        <section className="relative overflow-hidden rounded-3xl border border-blue-100 bg-white/95 p-7 shadow-[0_24px_80px_rgba(37,99,235,0.10)] sm:p-9">
          <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-blue-100/70 blur-3xl" /><div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-purple-100/60 blur-3xl" />
          <div className="relative grid gap-7 lg:grid-cols-[1fr_260px] lg:items-center">
            <div><div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><Sparkles className="h-3.5 w-3.5" /> Business quality intelligence</div><h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Can the organisation trust its data for decisions?</h1><p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">This workspace turns profiling evidence into a practical view of data quality, business exposure and the actions needed to restore confidence.</p></div>
            <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-sm"><Gauge className={`h-8 w-8 ${scoreTone(averageScore)}`} /></div><p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Average quality</p><p className={`mt-1 text-4xl font-black ${scoreTone(averageScore)}`}>{formatScore(averageScore)}</p><p className="mt-1 text-xs text-slate-500">Across scored completed runs</p></div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Evidence</p><p className="mt-2 text-3xl font-black">{completedRuns.length}</p><p className="text-sm text-slate-500">Completed profiling runs</p></div>
          <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-red-500">Priority exposure</p><p className="mt-2 text-3xl font-black text-red-600">{criticalCount}</p><p className="text-sm text-slate-500">High or critical findings</p></div>
          <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-amber-600">Attention</p><p className="mt-2 text-3xl font-black text-amber-600">{mediumCount}</p><p className="text-sm text-slate-500">Medium findings</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Decision confidence</p><p className="mt-2 text-3xl font-black text-emerald-600">{averageScore !== null && averageScore >= 0.8 ? 'Strong' : averageScore !== null ? 'Review' : 'Building'}</p><p className="text-sm text-slate-500">Based on persisted evidence</p></div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600" /><h2 className="text-xl font-bold">What the findings mean for the business</h2></div><p className="mt-1 text-sm text-slate-500">Use these signals to prioritise remediation by business consequence, not just technical severity.</p></div><Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-bold text-blue-600">Executive view <ArrowRight className="h-4 w-4" /></Link></div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-5"><div className="flex items-center gap-2 font-bold text-slate-800"><TrendingDown className="h-5 w-5 text-orange-600" /> Financial decisions</div><p className="mt-2 text-sm leading-6 text-slate-600">Poor completeness or validity can distort reporting, forecasting, pricing and revenue operations.</p></div>
            <div className="rounded-2xl border border-pink-100 bg-pink-50/70 p-5"><div className="flex items-center gap-2 font-bold text-slate-800"><CircleAlert className="h-5 w-5 text-pink-600" /> Customer outcomes</div><p className="mt-2 text-sm leading-6 text-slate-600">Duplicates and missing information can create service friction, inaccurate customer views and repeat work.</p></div>
            <div className="rounded-2xl border border-purple-100 bg-purple-50/70 p-5"><div className="flex items-center gap-2 font-bold text-slate-800"><TrendingUp className="h-5 w-5 text-purple-600" /> Operational confidence</div><p className="mt-2 text-sm leading-6 text-slate-600">Unreliable data can slow processes, weaken controls and increase the cost of manual reconciliation.</p></div>
          </div>
        </section>

        {runs.length === 0 ? <section className="mt-6 rounded-3xl border border-blue-100 bg-white p-10 text-center shadow-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Gauge className="h-7 w-7" /></div><h2 className="mt-4 text-xl font-bold">No quality evidence yet</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Register a dataset, make it ready and run profiling to establish the evidence base for data quality decisions.</p><Link href="/datasets" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">Prepare a dataset <ArrowRight className="h-4 w-4" /></Link></section> : (
          <section className="mt-6 space-y-5">
            {runs.map(run => {
              const version = versionsById.get(run.dataset_version_id)
              const dataset = version ? datasetsById.get(version.dataset_id) : undefined
              const score = scoresByRunId.get(run.id)
              const runFindings = findingsByRunId.get(run.id) ?? []
              const investigation = asRecord(asRecord(run.summary).investigation)
              const recommendations = Array.isArray(investigation.recommendations) ? investigation.recommendations : []
              const rootCauses = Array.isArray(investigation.probable_root_causes) ? investigation.probable_root_causes : []
              const businessImpact = typeof investigation.business_impact === 'string' ? investigation.business_impact : null
              return <article key={run.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-gradient-to-r from-white via-blue-50/40 to-purple-50/30 p-6 sm:p-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{dataset?.name ?? 'Unknown dataset'}</h2>{version && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">v{version.version_number}</span>}<span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">{run.status}</span></div><p className="mt-2 text-xs text-slate-400">Profile run {run.id}</p></div><div className="text-right"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overall quality</p><p className={`text-3xl font-black ${scoreTone(score?.overall_score)}`}>{formatScore(score?.overall_score)}</p></div></div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Completeness', score?.completeness_score], ['Validity', score?.validity_score], ['Uniqueness', score?.uniqueness_score], ['Accuracy', score?.accuracy_score], ['Rows / columns', `${run.row_count ?? 'N/A'} / ${run.column_count ?? 'N/A'}`]].map(([name, value]) => <div key={String(name)} className="rounded-2xl border border-white bg-white/80 p-4 shadow-sm"><p className="text-xs font-semibold text-slate-400">{name}</p><p className="mt-1 text-lg font-black">{typeof value === 'number' ? formatScore(value) : String(value)}</p></div>)}</div>
                </div>
                <div className="p-6 sm:p-7">
                  {businessImpact && <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-5"><p className="text-xs font-bold uppercase tracking-wider text-purple-700">Business impact</p><p className="mt-2 text-sm leading-6 text-slate-700">{businessImpact}</p></div>}
                  {runFindings.length > 0 && <div className="mt-6"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">Findings requiring attention</h3><span className="text-xs font-semibold text-slate-400">{runFindings.length} total</span></div><div className="mt-4 grid gap-3 md:grid-cols-2">{runFindings.map(finding => <div key={finding.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between gap-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${severityTone(finding.severity)}`}>{finding.severity}</span><span className="text-xs text-slate-400">{finding.finding_type}</span></div><h4 className="mt-3 font-bold">{finding.title}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{finding.description}</p><div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><strong className="text-slate-800">Business consequence:</strong> {impactForFinding(finding)}</div>{typeof finding.confidence === 'number' && <p className="mt-3 text-xs font-semibold text-slate-400">Evidence confidence {formatScore(finding.confidence)}</p>}</div>)}</div></div>}
                  {investigation && <div className="mt-6 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Issue interpretation</p><p className="mt-2 text-sm leading-6 text-slate-700">{String(investigation.business_issue ?? investigation.technical_summary ?? 'Evidence interpretation is not available.')}</p></div><div className="rounded-2xl border border-slate-200 p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Risk</p><p className="mt-2 text-sm leading-6 text-slate-700">{String(investigation.risk ?? 'Not classified')}</p><p className="mt-3 text-xs text-slate-400">Confidence {formatScore(typeof investigation.confidence === 'number' ? investigation.confidence : null)}</p></div></div>}
                  {(rootCauses.length > 0 || recommendations.length > 0) && <div className="mt-6 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Probable root causes</p><ul className="mt-3 space-y-2 text-sm text-slate-600">{rootCauses.slice(0, 5).map((cause, index) => <li key={index} className="rounded-xl bg-slate-50 p-3">{typeof cause === 'string' ? cause : JSON.stringify(cause)}</li>)}</ul></div><div className="rounded-2xl border border-slate-200 p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Recommended next actions</p><ul className="mt-3 space-y-2 text-sm text-slate-600">{recommendations.slice(0, 5).map((recommendation, index) => <li key={index} className="rounded-xl bg-blue-50/60 p-3">{typeof recommendation === 'string' ? recommendation : JSON.stringify(recommendation)}</li>)}</ul></div></div>}
                  {run.error_code && <div className="mt-6 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="h-5 w-5" />{run.error_code}</div>}
                </div>
              </article>
            })}
          </section>
        )}

        <div className="flex items-center gap-2 pb-4 text-xs text-slate-400"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Quality observations are based on persisted profiling evidence. Production changes remain approval gated.</div>
      </div>
    </main>
  )
}
