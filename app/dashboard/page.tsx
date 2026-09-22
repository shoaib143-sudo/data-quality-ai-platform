import Link from 'next/link'
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Database, FileWarning, Gauge, Layers3, ShieldCheck, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { createClient } from '@/lib/supabase/server'

type Dataset = { id: string; name: string; status: string; business_domain: string | null }
type Version = { id: string; dataset_id: string; status: string; version_number: number }
type Run = { id: string; dataset_version_id: string; status: string; started_at: string | null; row_count: number | null }
type Score = { profile_run_id: string; overall_score: number | null; completeness_score: number | null; validity_score: number | null; uniqueness_score: number | null; accuracy_score: number | null }
type Finding = { id: string; profile_run_id: string; severity: string; finding_type: string; title: string; description: string; recommendation: Record<string, unknown> | null }
type Source = { id: string; status: string }
type QualityRun = { id: string; status: string; passed: boolean | null }
type ObservabilityAlert = { id: string; category: string; severity: string; status: string; title: string }
type AgentRun = { id: string; status: string; error_code: string | null }

function percent(value: number | null | undefined) { return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'N/A' }
function scoreTone(value: number | null) { if (value === null) return 'text-slate-400'; if (value >= .9) return 'text-emerald-300'; if (value >= .75) return 'text-cyan-300'; if (value >= .6) return 'text-amber-300'; return 'text-rose-300' }

export default async function DashboardPage() {
  const user = await requireUser()
  const supabase = await createClient()
  const [datasetsResult, versionsResult, runsResult, scoresResult, findingsResult, sourcesResult, qualityRunsResult, alertsResult, agentRunsResult] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,name,status,business_domain').order('created_at', { ascending: false }),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,status,version_number').order('version_number', { ascending: false }),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,started_at,row_count').order('started_at', { ascending: false }).limit(100),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score,completeness_score,validity_score,uniqueness_score,accuracy_score').order('created_at', { ascending: false }).limit(100),
    supabase.schema('profiling').from('profile_findings').select('id,profile_run_id,severity,finding_type,title,description,recommendation').order('created_at', { ascending: false }).limit(100),
    supabase.schema('catalog').from('data_sources').select('id,status'),
    supabase.schema('profiling').from('quality_rule_runs').select('id,status,passed').order('started_at', { ascending: false }).limit(500),
    supabase.schema('profiling').from('observability_alerts').select('id,category,severity,status,title').order('last_observed_at', { ascending: false }).limit(100),
    supabase.schema('agent').from('agent_runs').select('id,status,error_code').order('created_at', { ascending: false }).limit(100),
  ])
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load dataset versions: ${versionsResult.error.message}`)
  if (runsResult.error) throw new Error(`Unable to load profiling runs: ${runsResult.error.message}`)
  if (scoresResult.error) throw new Error(`Unable to load quality scores: ${scoresResult.error.message}`)
  if (findingsResult.error) throw new Error(`Unable to load findings: ${findingsResult.error.message}`)
  if (sourcesResult.error) throw new Error(`Unable to load connections: ${sourcesResult.error.message}`)
  if (qualityRunsResult.error) throw new Error(`Unable to load quality control outcomes: ${qualityRunsResult.error.message}`)
  if (alertsResult.error) throw new Error(`Unable to load observability alerts: ${alertsResult.error.message}`)
  if (agentRunsResult.error) throw new Error(`Unable to load job health: ${agentRunsResult.error.message}`)

  const datasets = (datasetsResult.data ?? []) as Dataset[]
  const versions = (versionsResult.data ?? []) as Version[]
  const runs = (runsResult.data ?? []) as Run[]
  const scores = (scoresResult.data ?? []) as Score[]
  const findings = (findingsResult.data ?? []) as Finding[]
  const sources = (sourcesResult.data ?? []) as Source[]
  const qualityRuns = (qualityRunsResult.data ?? []) as QualityRun[]
  const observabilityAlerts = (alertsResult.data ?? []) as ObservabilityAlert[]
  const agentRuns = (agentRunsResult.data ?? []) as AgentRun[]
  const versionsById = new Map(versions.map(v => [v.id, v]))
  const scoresByRun = new Map(scores.map(s => [s.profile_run_id, s]))
  const latestRunByDataset = new Map<string, Run>()
  for (const run of runs) { const version = versionsById.get(run.dataset_version_id); if (version && !latestRunByDataset.has(version.dataset_id)) latestRunByDataset.set(version.dataset_id, run) }
  const completedRuns = runs.filter(r => r.status === 'COMPLETED')
  const scoredRuns = completedRuns.filter(r => typeof scoresByRun.get(r.id)?.overall_score === 'number')
  const overallScore = scoredRuns.length ? scoredRuns.reduce((sum, r) => sum + (scoresByRun.get(r.id)?.overall_score ?? 0), 0) / scoredRuns.length : null
  const highFindings = findings.filter(f => ['HIGH','CRITICAL'].includes(String(f.severity).toUpperCase()))
  const materialFindings = findings.filter(f => ['HIGH','CRITICAL','MEDIUM'].includes(String(f.severity).toUpperCase()))
  const affectedDatasetIds = new Set(findings.map(f => { const run = runs.find(r => r.id === f.profile_run_id); return run ? versionsById.get(run.dataset_version_id)?.dataset_id : undefined }).filter(Boolean))
  const readySources = sources.filter(s => s.status === 'ACTIVE').length
  const readyDatasets = datasets.filter(d => latestRunByDataset.get(d.id)?.status === 'COMPLETED').length
  const governanceCoverage = datasets.length ? Math.round((readyDatasets / datasets.length) * 100) : 0
  const topFindings = [...materialFindings].sort((a,b) => { const rank=(s:string)=>s==='CRITICAL'?4:s==='HIGH'?3:s==='MEDIUM'?2:1; return rank(String(b.severity).toUpperCase())-rank(String(a.severity).toUpperCase()) }).slice(0,5)
  const domainCounts = datasets.reduce<Record<string,number>>((a,d)=>{ const k=d.business_domain||'Unassigned'; a[k]=(a[k]??0)+1; return a },{})
  const sensitivityFindings = findings.filter(f => String(f.finding_type).toUpperCase().includes('SENSIT'))
  const failedQualityControls = qualityRuns.filter(run => run.status === 'FAILED').length
  const openGovernanceAlerts = observabilityAlerts.filter(alert => alert.status !== 'RESOLVED')
  const schemaDriftAlerts = openGovernanceAlerts.filter(alert => alert.category === 'SCHEMA_DRIFT').length
  const failedJobs = agentRuns.filter(run => run.status === 'FAILED').length
  const coverageGap = Math.max(0, datasets.length - readyDatasets)

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#050b17] text-slate-100">
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <GlobalUtilityBar contextLabel="Executive governance" />

      <section className="relative mt-4 overflow-hidden rounded-[28px] border border-cyan-300/12 bg-[#09192d] p-6 shadow-[0_24px_70px_rgba(0,0,0,.28)] sm:p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/[0.06] blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-violet-500/[0.07] blur-3xl" />
        <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-black text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Executive governance overview
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl">Know what is trusted, what is at risk, and where to act next.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
              A business-first view built from persisted profiling, quality, observability and governance evidence. No assumed business loss is presented as fact.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/data-quality" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-3 text-sm font-black text-white shadow-[0_0_20px_rgba(34,211,238,.10)] hover:from-blue-500 hover:to-cyan-500">
                Review priority risks <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/datasets" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-5 py-3 text-sm font-bold text-slate-200 hover:border-cyan-300/25 hover:bg-white/[0.055]">
                Improve evidence coverage
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-[#061321]/85 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Overall data health</p>
                <p className={`mt-2 text-5xl font-black ${scoreTone(overallScore)}`}>{percent(overallScore)}</p>
              </div>
              <span className="grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06]">
                <Gauge className={`h-8 w-8 ${scoreTone(overallScore)}`} aria-hidden="true" />
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              {overallScore === null ? 'Build the evidence base before relying on an aggregate health signal.' : overallScore >= .8 ? 'Current evidence is generally trusted for governed decision-making.' : 'Current evidence indicates material attention is required before broad reliance.'}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Coverage</p><p className="mt-1 text-xl font-black text-white">{governanceCoverage}%</p></div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Ready sources</p><p className="mt-1 text-xl font-black text-white">{readySources}/{sources.length}</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Governed datasets', value: datasets.length, detail: 'registered assets', icon: Database, tone: 'text-cyan-300 bg-cyan-300/[0.07] border-cyan-300/15' },
          { label: 'Datasets with findings', value: affectedDatasetIds.size, detail: 'require review', icon: AlertTriangle, tone: 'text-amber-300 bg-amber-300/[0.07] border-amber-300/15' },
          { label: 'High or critical issues', value: highFindings.length, detail: 'priority evidence', icon: FileWarning, tone: 'text-rose-300 bg-rose-300/[0.07] border-rose-300/15' },
          { label: 'Failed jobs', value: failedJobs, detail: 'recent automation', icon: Activity, tone: 'text-violet-300 bg-violet-300/[0.07] border-violet-300/15' },
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-white/[0.08] bg-[#09192d] p-4 shadow-[0_10px_28px_rgba(0,0,0,.18)]">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">{label}</p><p className="mt-2 text-3xl font-black text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
              <span className={`grid h-10 w-10 place-items-center rounded-xl border ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-[24px] border border-white/[0.08] bg-[#09192d] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-rose-300">Attention now</p>
              <h2 className="mt-1 text-xl font-black text-white">Evidence requiring action</h2>
              <p className="mt-1 text-sm text-slate-500">The highest-severity persisted findings and operational signals.</p>
            </div>
            <Link href="/data-quality" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-cyan-300 hover:border-cyan-300/25 hover:bg-white/[0.04]">Open Data Quality</Link>
          </div>

          <div className="mt-5 space-y-3">
            {topFindings.length ? topFindings.map((finding, index) => (
              <Link key={finding.id} href="/data-quality" className="group flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-[#061321] p-4 hover:border-cyan-300/25 hover:bg-[#08182b]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-400/[0.09] text-xs font-black text-rose-300">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-bold text-slate-100">{finding.title}</span>
                    <span className="rounded-lg bg-rose-400/[0.09] px-2 py-1 text-[10px] font-black text-rose-300">{finding.severity}</span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{finding.description}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-600 group-hover:text-cyan-300" aria-hidden="true" />
              </Link>
            )) : (
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4 text-sm text-emerald-200">No high or critical findings are currently persisted.</div>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link href="/data-quality/rules" className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 hover:border-cyan-300/20">
              <p className="text-2xl font-black text-white">{failedQualityControls}</p>
              <p className="mt-1 text-xs font-bold text-slate-300">Failed quality controls</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">Automated controls requiring review.</p>
            </Link>
            <Link href="/observability" className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 hover:border-cyan-300/20">
              <p className="text-2xl font-black text-white">{openGovernanceAlerts.length}</p>
              <p className="mt-1 text-xs font-bold text-slate-300">Open governance alerts</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">{schemaDriftAlerts} schema drift signal{schemaDriftAlerts === 1 ? '' : 's'}.</p>
            </Link>
            <Link href="/profiling" className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 hover:border-cyan-300/20">
              <p className="text-2xl font-black text-white">{coverageGap}</p>
              <p className="mt-1 text-xs font-bold text-slate-300">Coverage gaps</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">Datasets without completed profiling evidence.</p>
            </Link>
          </div>
        </article>

        <aside className="space-y-5">
          <article className="rounded-[24px] border border-white/[0.08] bg-[#09192d] p-5 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-300">Governance coverage</p>
            <h2 className="mt-1 text-xl font-black text-white">Evidence completeness</h2>
            <div className="mt-5">
              <div className="flex items-end justify-between gap-3"><p className="text-4xl font-black text-white">{governanceCoverage}%</p><p className="text-xs text-slate-500">{readyDatasets}/{datasets.length} datasets profiled</p></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${governanceCoverage}%` }} /></div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/[0.06] bg-[#061321] p-3"><p className="text-xs text-slate-500">Sensitive indicators</p><p className="mt-1 text-xl font-black text-white">{sensitivityFindings.length}</p></div>
              <div className="rounded-xl border border-white/[0.06] bg-[#061321] p-3"><p className="text-xs text-slate-500">Active connections</p><p className="mt-1 text-xl font-black text-white">{readySources}</p></div>
            </div>
          </article>

          <article className="rounded-[24px] border border-white/[0.08] bg-[#09192d] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-white">Business domains</h2><Link href="/catalog" className="text-xs font-bold text-cyan-300">Open catalog</Link></div>
            <div className="mt-4 space-y-2">
              {Object.entries(domainCounts).length ? Object.entries(domainCounts).slice(0,6).map(([domain, count]) => (
                <Link key={domain} href={`/catalog?q=${encodeURIComponent(domain)}`} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#061321] px-3 py-2.5 text-sm hover:border-cyan-300/20">
                  <span className="font-semibold text-slate-300">{domain}</span><span className="text-xs font-black text-slate-500">{count}</span>
                </Link>
              )) : <p className="text-sm text-slate-500">No business domains have been assigned yet.</p>}
            </div>
          </article>
        </aside>
      </section>

      <section className="mt-5 rounded-[24px] border border-white/[0.08] bg-[#09192d] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-300">Act next</p><h2 className="mt-1 text-xl font-black text-white">Primary governance workspaces</h2><p className="mt-1 text-sm text-slate-500">Start with the workspaces that most directly change trust, quality and operational confidence.</p></div>
          <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-violet-200">Production capabilities</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['/catalog','Data Catalog','Find governed assets and metadata.',Database],
            ['/data-quality','Data Quality','Review quality evidence and controls.',ShieldCheck],
            ['/lineage','Data Lineage','Understand impact and dependencies.',Layers3],
            ['/monitoring','Job Monitor','Track execution health and failures.',Activity],
            ['/profiling/explorer','Profiling Explorer','Inspect metrics, distributions and findings.',Gauge],
            ['/agents','AI Agents','Investigate and recommend governed next actions.',Sparkles],
          ].map(([href, title, description, Icon]) => {
            const WorkspaceIcon = Icon as typeof Database
            return <Link key={String(href)} href={String(href)} className="group rounded-2xl border border-white/[0.07] bg-[#061321] p-4 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-[#08182b]">
              <div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/12 bg-cyan-300/[0.05] text-cyan-300"><WorkspaceIcon className="h-5 w-5" aria-hidden="true" /></span><ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-cyan-300" aria-hidden="true" /></div>
              <p className="mt-4 font-black text-slate-100">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
            </Link>
          })}
        </div>

        <details className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-300">All governance workspaces</summary>
          <div className="grid gap-2 border-t border-white/[0.06] p-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['/glossary','Business Glossary'],['/stewardship','Stewardship'],['/classification','Classification & Policy'],['/issues','Remediation'],
              ['/data-quality/rules','Quality Rules'],['/schedules','Schedules'],['/observability/settings','Observability Settings'],['/audit','Audit Trail'],
              ['/reports','Reports'],['/admin','Administration'],['/retention','Retention'],['/datasets','Datasets'],
            ].map(([href,title]) => <Link key={href} href={href} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 hover:bg-white/[0.04] hover:text-cyan-200">{title}</Link>)}
          </div>
        </details>
      </section>

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-[#09192d] px-5 py-4 text-xs text-slate-600">
        <span>Signed in as {user.email ?? 'current user'}</span>
        <span>Governance decisions are based on persisted platform evidence.</span>
      </footer>
    </div>
  </main>
}
