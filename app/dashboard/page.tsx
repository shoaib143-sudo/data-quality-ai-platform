import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FileWarning,
  Gauge,
  Layers3,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Dataset = { id: string; name: string; status: string; business_domain: string | null }
type Version = { id: string; dataset_id: string; status: string; version_number: number }
type Run = { id: string; dataset_version_id: string; status: string; started_at: string | null; row_count: number | null }
type Score = { profile_run_id: string; overall_score: number | null; completeness_score: number | null; validity_score: number | null; uniqueness_score: number | null; accuracy_score: number | null }
type Finding = { id: string; profile_run_id: string; severity: string; finding_type: string; title: string; description: string; recommendation: Record<string, unknown> | null }
type Source = { id: string; status: string }

function percent(value: number | null | undefined) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'N/A'
}

function scoreTone(value: number | null) {
  if (value === null) return 'text-slate-400'
  if (value >= 0.9) return 'text-emerald-600'
  if (value >= 0.75) return 'text-blue-600'
  if (value >= 0.6) return 'text-amber-600'
  return 'text-red-600'
}

function impactForFinding(finding: Finding) {
  const text = `${finding.finding_type} ${finding.title} ${finding.description}`.toLowerCase()
  if (text.includes('null') || text.includes('missing')) return 'Incomplete data can cause missed customers, incorrect decisions and downstream process failures.'
  if (text.includes('duplicate')) return 'Duplicate records can inflate volumes, distort customer views and create duplicate operational actions.'
  if (text.includes('valid') || text.includes('format')) return 'Invalid values can break integrations, reporting and business rules that depend on trusted formats.'
  if (text.includes('outlier') || text.includes('range')) return 'Unexpected values can distort KPIs, forecasts and operational decisions.'
  return 'A recurring data issue can reduce confidence in reporting and increase manual remediation effort.'
}

export default async function DashboardPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const [datasetsResult, versionsResult, runsResult, scoresResult, findingsResult, sourcesResult] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id, name, status, business_domain').order('created_at', { ascending: false }),
    supabase.schema('catalog').from('dataset_versions').select('id, dataset_id, status, version_number').order('version_number', { ascending: false }),
    supabase.schema('profiling').from('profile_runs').select('id, dataset_version_id, status, started_at, row_count').order('started_at', { ascending: false }).limit(50),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id, overall_score, completeness_score, validity_score, uniqueness_score, accuracy_score').limit(100),
    supabase.schema('profiling').from('profile_findings').select('id, profile_run_id, severity, finding_type, title, description, recommendation').order('created_at', { ascending: false }).limit(100),
    supabase.schema('catalog').from('data_sources').select('id, status'),
  ])

  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load dataset versions: ${versionsResult.error.message}`)
  if (runsResult.error) throw new Error(`Unable to load profiling runs: ${runsResult.error.message}`)
  if (scoresResult.error) throw new Error(`Unable to load quality scores: ${scoresResult.error.message}`)
  if (findingsResult.error) throw new Error(`Unable to load findings: ${findingsResult.error.message}`)
  if (sourcesResult.error) throw new Error(`Unable to load connections: ${sourcesResult.error.message}`)

  const datasets = (datasetsResult.data ?? []) as Dataset[]
  const versions = (versionsResult.data ?? []) as Version[]
  const runs = (runsResult.data ?? []) as Run[]
  const scores = (scoresResult.data ?? []) as Score[]
  const findings = (findingsResult.data ?? []) as Finding[]
  const sources = (sourcesResult.data ?? []) as Source[]

  const versionsById = new Map(versions.map(version => [version.id, version]))
  const datasetsById = new Map(datasets.map(dataset => [dataset.id, dataset]))
  const scoresByRun = new Map(scores.map(score => [score.profile_run_id, score]))
  const latestRunByDataset = new Map<string, Run>()
  for (const run of runs) {
    const version = versionsById.get(run.dataset_version_id)
    if (version && !latestRunByDataset.has(version.dataset_id)) latestRunByDataset.set(version.dataset_id, run)
  }

  const completedRuns = runs.filter(run => run.status === 'COMPLETED')
  const scoredRuns = completedRuns.filter(run => typeof scoresByRun.get(run.id)?.overall_score === 'number')
  const overallScore = scoredRuns.length
    ? scoredRuns.reduce((sum, run) => sum + (scoresByRun.get(run.id)?.overall_score ?? 0), 0) / scoredRuns.length
    : null
  const materialFindings = findings.filter(finding => ['HIGH', 'CRITICAL', 'MEDIUM'].includes(String(finding.severity).toUpperCase()))
  const highFindings = findings.filter(finding => ['HIGH', 'CRITICAL'].includes(String(finding.severity).toUpperCase()))
  const affectedDatasetIds = new Set(findings.map(finding => versionsById.get(runs.find(run => run.id === finding.profile_run_id)?.dataset_version_id ?? '')?.dataset_id).filter(Boolean))
  const readySources = sources.filter(source => source.status === 'ACTIVE').length
  const readyDatasets = datasets.filter(dataset => latestRunByDataset.has(dataset.id) && latestRunByDataset.get(dataset.id)?.status === 'COMPLETED').length
  const governanceCoverage = datasets.length ? Math.round((readyDatasets / datasets.length) * 100) : 0

  const topFindings = [...materialFindings]
    .sort((a, b) => {
      const rank = (value: string) => value === 'CRITICAL' ? 4 : value === 'HIGH' ? 3 : value === 'MEDIUM' ? 2 : 1
      return rank(String(b.severity).toUpperCase()) - rank(String(a.severity).toUpperCase())
    })
    .slice(0, 5)

  const domainCounts = datasets.reduce<Record<string, number>>((acc, dataset) => {
    const domain = dataset.business_domain || 'Unassigned'
    acc[domain] = (acc[domain] ?? 0) + 1
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,_rgba(219,234,254,0.95),_transparent_28%),radial-gradient(circle_at_95%_5%,_rgba(243,232,255,0.9),_transparent_26%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_45%,_#f8fafc_100%)] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/90 px-5 py-3 shadow-sm backdrop-blur">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-sm"><Layers3 className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-slate-900">Data Governance PowerHouse</span><span className="block text-xs text-slate-500">Executive governance view</span></span>
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/datasets" className="rounded-xl px-3 py-2 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700">Connections & Datasets</Link>
            <Link href="/data-quality" className="rounded-xl px-3 py-2 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700">Data Quality</Link>
            <Link href="/observability" className="rounded-xl px-3 py-2 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700">Observability</Link>
            <Link href="/agents" className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-blue-700">AI Agents</Link>
          </div>
        </nav>

        <section className="relative overflow-hidden rounded-3xl border border-blue-100 bg-white/95 p-7 shadow-[0_24px_80px_rgba(37,99,235,0.12)] sm:p-9">
          <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-blue-100/80 blur-3xl" />
          <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-purple-100/70 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_300px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><Sparkles className="h-3.5 w-3.5" /> Executive governance summary</div>
              <h1 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">Is poor data quality putting the business at risk?</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">A business-first view of where data can affect revenue, customers, regulatory confidence and operational decisions. The page translates technical observations into actions executives can understand.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/data-quality" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700">Review business risks <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/datasets" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50">Improve governance coverage</Link>
              </div>
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-6 text-center shadow-sm">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white shadow-md"><Gauge className={`h-10 w-10 ${scoreTone(overallScore)}`} /></div>
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Overall data health</p>
              <p className={`mt-1 text-4xl font-black ${scoreTone(overallScore)}`}>{percent(overallScore)}</p>
              <p className="mt-2 text-sm font-medium text-slate-600">{overallScore === null ? 'Build the evidence base' : overallScore >= 0.8 ? 'Generally trusted for decisions' : 'Attention required before relying on it broadly'}</p>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Database className="h-5 w-5" /></span><span className="text-xs font-semibold text-slate-400">ASSETS</span></div><p className="mt-4 text-3xl font-black">{datasets.length}</p><p className="text-sm font-medium text-slate-500">Governed datasets</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></span><span className="text-xs font-semibold text-slate-400">COVERAGE</span></div><p className="mt-4 text-3xl font-black">{governanceCoverage}%</p><p className="text-sm font-medium text-slate-500">Datasets with profiling evidence</p></div>
          <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><AlertTriangle className="h-5 w-5" /></span><span className="text-xs font-semibold text-slate-400">EXPOSURE</span></div><p className="mt-4 text-3xl font-black">{affectedDatasetIds.size}</p><p className="text-sm font-medium text-slate-500">Datasets with findings</p></div>
          <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600"><FileWarning className="h-5 w-5" /></span><span className="text-xs font-semibold text-slate-400">PRIORITY</span></div><p className="mt-4 text-3xl font-black">{highFindings.length}</p><p className="text-sm font-medium text-slate-500">High or critical issues</p></div>
          <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-600"><ShieldCheck className="h-5 w-5" /></span><span className="text-xs font-semibold text-slate-400">TRUST</span></div><p className="mt-4 text-3xl font-black">{readySources}/{sources.length}</p><p className="text-sm font-medium text-slate-500">Connections ready for use</p></div>
        </section>

        <section className="mt-7 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-blue-600" /><h2 className="text-xl font-bold">Business impact signals</h2></div><p className="mt-1 text-sm text-slate-500">What poor data can mean for the organisation, expressed without technical jargon.</p></div><Link href="/data-quality" className="text-sm font-bold text-blue-600 hover:text-blue-700">Explore evidence</Link></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-orange-600"><CircleDollarSign className="h-5 w-5" /></span><div className="font-bold">Revenue & financial decisions</div></div><p className="mt-3 text-sm leading-6 text-slate-600">Incorrect, duplicate or incomplete records can distort financial reporting, forecasting, pricing and revenue operations.</p></div>
              <div className="rounded-2xl border border-pink-100 bg-pink-50/70 p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-pink-600"><Users className="h-5 w-5" /></span><div className="font-bold">Customer experience</div></div><p className="mt-3 text-sm leading-6 text-slate-600">Poor customer data can create duplicate contacts, missed interactions, incorrect segmentation and avoidable service friction.</p></div>
              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-red-600"><ShieldCheck className="h-5 w-5" /></span><div className="font-bold">Risk & compliance</div></div><p className="mt-3 text-sm leading-6 text-slate-600">Incomplete lineage, inconsistent definitions or unreliable records can weaken control evidence and increase compliance exposure.</p></div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-600"><BarChart3 className="h-5 w-5" /></span><div className="font-bold">Operational productivity</div></div><p className="mt-3 text-sm leading-6 text-slate-600">Data issues create manual investigation, reconciliation and remediation work that slows teams and increases operating cost.</p></div>
            </div>
          </div>

          <div className="rounded-3xl border border-red-100 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Priority business risks</h2><p className="mt-1 text-sm text-slate-500">Highest-severity evidence detected.</p></div><span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">{materialFindings.length} material</span></div>
            <div className="mt-5 space-y-3">
              {topFindings.length === 0 ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm font-medium text-emerald-800">No material findings are currently recorded. Continue profiling critical datasets to maintain this position.</div> : topFindings.map(finding => <div key={finding.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{finding.severity} · {finding.finding_type}</p><p className="mt-1 font-bold text-slate-800">{finding.title}</p></div><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" /></div><p className="mt-2 text-sm leading-5 text-slate-600">{impactForFinding(finding)}</p></div>)}
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Data health by dimension</h2><p className="mt-1 text-sm text-slate-500">Latest scored profiling evidence.</p></div><Link href="/data-quality" className="text-sm font-bold text-blue-600">View quality</Link></div><div className="mt-6 space-y-5">{[
            ['Completeness', scoredRuns.length ? scoredRuns.reduce((s, r) => s + (scoresByRun.get(r.id)?.completeness_score ?? 0), 0) / scoredRuns.length : null],
            ['Validity', scoredRuns.length ? scoredRuns.reduce((s, r) => s + (scoresByRun.get(r.id)?.validity_score ?? 0), 0) / scoredRuns.length : null],
            ['Uniqueness', scoredRuns.length ? scoredRuns.reduce((s, r) => s + (scoresByRun.get(r.id)?.uniqueness_score ?? 0), 0) / scoredRuns.length : null],
            ['Accuracy', scoredRuns.length ? scoredRuns.reduce((s, r) => s + (scoresByRun.get(r.id)?.accuracy_score ?? 0), 0) / scoredRuns.length : null],
          ].map(([label, value]) => <div key={String(label)}><div className="flex items-center justify-between text-sm font-semibold"><span>{label}</span><span className={scoreTone(value as number | null)}>{percent(value as number | null)}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${scoreTone(value as number | null).replace('text-', 'bg-')}`} style={{ width: `${Math.max(0, Math.min(100, Number(value ?? 0) * 100))}%` }} /></div></div>)}</div></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Governance coverage</h2><p className="mt-1 text-sm text-slate-500">Where the organisation has evidence versus where it still has blind spots.</p></div><Link href="/datasets" className="text-sm font-bold text-blue-600">Close gaps</Link></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{Object.entries(domainCounts).map(([domain, count]) => <div key={domain} className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><div className="text-sm font-bold text-slate-800">{domain}</div><div className="mt-2 text-2xl font-black text-blue-600">{count}</div><div className="text-xs font-medium text-slate-500">dataset{count === 1 ? '' : 's'} in scope</div></div>)}</div><div className="mt-5 rounded-2xl border border-purple-100 bg-purple-50/60 p-5"><p className="text-sm font-bold text-purple-900">Executive interpretation</p><p className="mt-2 text-sm leading-6 text-purple-800">A dataset without current profiling evidence is a governance blind spot. Prioritise critical business domains first, then use the quality findings to direct remediation where business impact is highest.</p></div></div>
        </section>

        <section className="mt-7 rounded-3xl border border-purple-100 bg-gradient-to-r from-white via-purple-50/70 to-blue-50/70 p-6 shadow-sm sm:p-7"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-center"><div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-purple-600" /><h2 className="text-lg font-bold">Move from visibility to action</h2></div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Use the technical modules only when needed. The executive view tells you <strong>where the business is exposed</strong>; Data Quality explains <strong>why</strong>; Profiling provides the evidence; Governance workflows drive remediation.</p></div><div className="flex flex-wrap gap-2"><Link href="/data-quality" className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-700">Investigate risks</Link><Link href="/datasets" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-blue-50">Manage coverage</Link></div></div></section>

        <footer className="flex flex-col justify-between gap-2 pb-6 pt-2 text-xs text-slate-400 sm:flex-row"><span>Signed in as {user.email ?? 'authenticated user'}</span><span>Evidence is derived from persisted profiling and quality results. Business impact statements are decision-support interpretations, not financial estimates.</span></footer>
      </div>
    </main>
  )
}
