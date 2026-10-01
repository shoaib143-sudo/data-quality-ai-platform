import Link from 'next/link'
import { Activity, AlertTriangle, BrainCircuit, CheckCircle2, Database, GitBranch, Layers3, ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'

function pct(value:number|null){return value==null?'N/A':`${Math.round(value*100)}%`}

export default async function ExecutiveSummaryPage() {
  const user = await requireUser()
  const [supabase, landing] = await Promise.all([createClient(), resolveLandingAccess(user.id)])

  const [datasetsResult,sourcesResult,runsResult,scoresResult,findingsResult,issuesResult,lineageResult,modelsResult] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,status',{count:'exact'}),
    supabase.schema('catalog').from('data_sources').select('id,status',{count:'exact'}),
    supabase.schema('profiling').from('profile_runs').select('id,status,started_at,completed_at').order('started_at',{ascending:false}).limit(500),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score,created_at').order('created_at',{ascending:false}).limit(1000),
    supabase.schema('profiling').from('profile_findings').select('id,severity',{count:'exact'}).limit(1000),
    supabase.schema('governance').from('issues').select('id,status,severity',{count:'exact'}).limit(1000),
    supabase.schema('governance').from('lineage_column_mappings').select('id',{count:'exact',head:true}),
    supabase.schema('governance').from('ai_systems').select('id,lifecycle_status,current_version_id',{count:'exact'}).limit(500),
  ])

  const datasets = datasetsResult.error ? [] : datasetsResult.data ?? []
  const sources = sourcesResult.error ? [] : sourcesResult.data ?? []
  const runs = runsResult.error ? [] : runsResult.data ?? []
  const scores = scoresResult.error ? [] : scoresResult.data ?? []
  const findings = findingsResult.error ? [] : findingsResult.data ?? []
  const issues = issuesResult.error ? [] : issuesResult.data ?? []
  const models = modelsResult.error ? [] : modelsResult.data ?? []

  const latestScores = new Map<string,number>()
  for (const score of scores as any[]) if (!latestScores.has(score.profile_run_id) && typeof score.overall_score==='number') latestScores.set(score.profile_run_id,score.overall_score)
  const scoreValues = [...latestScores.values()]
  const averageQuality = scoreValues.length ? scoreValues.reduce((a,b)=>a+b,0)/scoreValues.length : null
  const completedRuns = (runs as any[]).filter(run=>String(run.status).toUpperCase()==='COMPLETED').length
  const failedRuns = (runs as any[]).filter(run=>String(run.status).toUpperCase()==='FAILED').length
  const highFindings = (findings as any[]).filter(row=>['CRITICAL','HIGH'].includes(String(row.severity).toUpperCase())).length
  const openIssues = (issues as any[]).filter(row=>!['RESOLVED','CLOSED','CANCELLED','REJECTED'].includes(String(row.status).toUpperCase())).length
  const activeSources = (sources as any[]).filter(row=>String(row.status).toUpperCase()==='ACTIVE').length
  const activeModels = (models as any[]).filter(row=>['ACTIVE','PRODUCTION','APPROVED'].includes(String(row.lifecycle_status).toUpperCase())).length
  const totalDatasets = datasetsResult.count ?? datasets.length
  const lineageMappings = lineageResult.count ?? 0

  const pillars=[
    {label:'Catalog & Metadata',detail:`${totalDatasets} governed datasets`,Icon:Database,href:'/catalog'},
    {label:'Data Quality',detail:`${pct(averageQuality)} average scored quality`,Icon:CheckCircle2,href:'/data-quality'},
    {label:'Lineage',detail:`${lineageMappings} persisted field mappings`,Icon:GitBranch,href:'/lineage'},
    {label:'Governance',detail:`${openIssues} unresolved governed issues`,Icon:ShieldCheck,href:'/issues'},
    {label:'AI Operations',detail:`${activeModels} active governed AI systems`,Icon:BrainCircuit,href:'/agents'},
    {label:'Operations',detail:`${completedRuns} completed · ${failedRuns} failed runs`,Icon:Activity,href:'/monitoring'},
  ]

  return <main id="main-content" tabIndex={-1} className="dn-light-workspace min-h-screen bg-[#08111f] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Executive Summary" contextLabel="Enterprise data estate summary" homeHref="/home" />
    <header className="mt-4 rounded-3xl border border-white/10 bg-[#102036] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">DataNexus executive summary</p><h1 className="mt-2 text-4xl font-black">Governed data estate intelligence</h1><p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">Current evidence-backed view of the catalog, quality, lineage, governance, AI and execution estate. Counts come from the governed records visible to your current access scope.</p></header>

    <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Link href="/catalog" className="rounded-2xl border border-white/10 bg-[#102036] p-5 hover:border-cyan-400/30"><Database className="h-5 w-5 text-cyan-300"/><p className="mt-3 text-3xl font-black">{totalDatasets}</p><p className="text-xs text-slate-500">Governed datasets</p></Link>
      <Link href="/data-quality" className="rounded-2xl border border-white/10 bg-[#102036] p-5 hover:border-cyan-400/30"><CheckCircle2 className="h-5 w-5 text-emerald-300"/><p className="mt-3 text-3xl font-black">{pct(averageQuality)}</p><p className="text-xs text-slate-500">Average quality score</p></Link>
      <Link href="/issues" className="rounded-2xl border border-white/10 bg-[#102036] p-5 hover:border-cyan-400/30"><AlertTriangle className="h-5 w-5 text-rose-300"/><p className="mt-3 text-3xl font-black">{highFindings}</p><p className="text-xs text-slate-500">High-priority findings</p></Link>
      <Link href="/datasets" className="rounded-2xl border border-white/10 bg-[#102036] p-5 hover:border-cyan-400/30"><Layers3 className="h-5 w-5 text-violet-300"/><p className="mt-3 text-3xl font-black">{activeSources}/{sourcesResult.count??sources.length}</p><p className="text-xs text-slate-500">Active connected sources</p></Link>
    </section>

    <section className="mt-5 rounded-3xl border border-white/10 bg-[#102036] p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-violet-300">Core capability pillars</p><h2 className="mt-1 text-2xl font-black">One governed operating model</h2></div><Link href="/reports" className="text-sm font-bold text-blue-300">Reports →</Link></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pillars.map(({label,detail,Icon,href})=><Link key={label} href={href} className="rounded-2xl border border-white/[0.07] bg-[#0d1c30] p-4 hover:border-violet-400/30"><Icon className="h-5 w-5 text-violet-300"/><p className="mt-3 font-black text-white">{label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></Link>)}</div></section>

    <section className="mt-5 grid gap-5 lg:grid-cols-2">
      <article className="rounded-3xl border border-white/10 bg-[#102036] p-6"><p className="text-xs font-black uppercase tracking-[.15em] text-emerald-300">Current state</p><h2 className="mt-1 text-xl font-black">Implemented foundations</h2><div className="mt-4 space-y-2 text-sm text-slate-300">{['Governed catalog and business metadata','Profiling and data-quality evidence','Table and field-level lineage model','Governed workflows, approvals and audit','AI model registry, routing and telemetry','Job monitoring, recovery and observability'].map(item=><div key={item} className="rounded-xl border border-white/[0.06] bg-[#0d1c30] px-4 py-3">{item}</div>)}</div></article>
      <article className="rounded-3xl border border-white/10 bg-[#102036] p-6"><p className="text-xs font-black uppercase tracking-[.15em] text-amber-300">Expansion focus</p><h2 className="mt-1 text-xl font-black">Capabilities being advanced</h2><div className="mt-4 space-y-2 text-sm text-slate-300">{['Expanded source and ETL connector coverage','Source-to-report lineage and richer visualization','Metadata federation and BI metadata integration','Infrastructure and AI health observability','Metadata and lineage version comparison and correction','Excel source-to-target lineage validation exports'].map(item=><div key={item} className="rounded-xl border border-white/[0.06] bg-[#0d1c30] px-4 py-3">{item}</div>)}</div></article>
    </section>
  </div></main>
}
