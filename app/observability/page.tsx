import Link from 'next/link'
import { Activity, AlertTriangle, ArrowRight, BellRing, CheckCircle2, Database, Eye, Gauge, GitCompareArrows, Layers3, ShieldCheck, TimerReset } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { AlertActions } from './alert-actions'

type Dataset = { id: string; project_id: string; name: string; business_domain: string | null }
type Version = { id: string; dataset_id: string; version_number: number }
type ProfileRun = { id: string; dataset_version_id: string; status: string; row_count: number | null; column_count: number | null; schema_hash: string | null; started_at: string | null; completed_at: string | null; error_code: string | null }
type Score = { profile_run_id: string; overall_score: number | null }
type Source = { id: string; project_id: string; name: string; source_type: string; status: string }
type AgentRun = { id: string; dataset_id: string | null; status: string; created_at: string; started_at: string | null; completed_at: string | null; error_code: string | null; agent_definition_id: string }
type AgentDefinition = { id: string; name: string; agent_key: string; version: string }
type QualityRun = { id: string; status: string; passed: boolean | null; completed_at: string | null }
type Alert = { id: string; project_id: string; dataset_id: string; profile_run_id: string | null; category: string; severity: string; title: string; description: string; status: string; evidence: Record<string, unknown>; first_observed_at: string; last_observed_at: string }

const surface='rounded-[22px] border border-white/10 bg-[#0a1d33] shadow-[10px_10px_28px_rgba(0,0,0,.24),-7px_-7px_22px_rgba(30,74,114,.08)]'
const inset='rounded-2xl border border-white/[0.07] bg-[#08182b]'
const focus='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]'
const interactive=`${focus} transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.04] active:translate-y-0`

function percent(value: number | null | undefined) { return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'N/A' }
function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) : 'N/A' }
function severityClass(value: string) {
  const normalized = value.toUpperCase()
  if (normalized === 'CRITICAL' || normalized === 'HIGH') return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
  if (normalized === 'MEDIUM') return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
  return 'border-blue-400/20 bg-blue-400/10 text-blue-300'
}
function statusClass(value: string) {
  const normalized = value.toUpperCase()
  if (['COMPLETED','SUCCEEDED','ACTIVE','PASSED','RESOLVED'].includes(normalized)) return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (['FAILED','ERROR'].includes(normalized)) return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
  return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
}

export default async function ObservabilityPage() {
  const user=await requireUser()
  const landing=await resolveLandingAccess(user.id)
  const supabase = await createClient()

  const canDatasets=canAccessWorkspace(landing.persona,'datasets',landing.organizationRole)
  const canMonitoring=canAccessWorkspace(landing.persona,'monitoring',landing.organizationRole)
  const canDataQuality=canAccessWorkspace(landing.persona,'data-quality',landing.organizationRole)
  const canManageWorkspace=canAccessWorkspace(landing.persona,'observability-manage',landing.organizationRole)

  const [datasetsResult, versionsResult, runsResult, scoresResult, sourcesResult, agentRunsResult, agentsResult, qualityRunsResult, alertsResult] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,business_domain').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number').order('version_number', { ascending: false }),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,row_count,column_count,schema_hash,started_at,completed_at,error_code').order('started_at', { ascending: false }).limit(250),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score').order('created_at', { ascending: false }).limit(250),
    supabase.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status').order('name'),
    supabase.schema('agent').from('agent_runs').select('id,dataset_id,status,created_at,started_at,completed_at,error_code,agent_definition_id').order('created_at', { ascending: false }).limit(100),
    supabase.schema('agent').from('agent_definitions').select('id,name,agent_key,version').eq('enabled', true),
    supabase.schema('profiling').from('quality_rule_runs').select('id,status,passed,completed_at').order('started_at', { ascending: false }).limit(500),
    supabase.schema('profiling').from('observability_alerts').select('id,project_id,dataset_id,profile_run_id,category,severity,title,description,status,evidence,first_observed_at,last_observed_at').order('last_observed_at', { ascending: false }).limit(200),
  ])

  for (const [name, result] of [
    ['datasets', datasetsResult], ['versions', versionsResult], ['profile runs', runsResult], ['scores', scoresResult],
    ['sources', sourcesResult], ['agent runs', agentRunsResult], ['agents', agentsResult], ['quality runs', qualityRunsResult], ['alerts', alertsResult],
  ] as const) {
    if (result.error) throw new Error(`Unable to load observability ${name}: ${result.error.message}`)
  }

  const datasets = (datasetsResult.data ?? []) as Dataset[]
  const versions = (versionsResult.data ?? []) as Version[]
  const profileRuns = (runsResult.data ?? []) as ProfileRun[]
  const scores = (scoresResult.data ?? []) as Score[]
  const sources = (sourcesResult.data ?? []) as Source[]
  const agentRuns = (agentRunsResult.data ?? []) as AgentRun[]
  const agents = (agentsResult.data ?? []) as AgentDefinition[]
  const qualityRuns = (qualityRunsResult.data ?? []) as QualityRun[]
  const alerts = (alertsResult.data ?? []) as Alert[]

  const projectIds=[...new Set([...datasets.map(dataset=>dataset.project_id),...sources.map(source=>source.project_id)])]
  const manageRows=canManageWorkspace?await Promise.all(projectIds.map(async projectId=>[projectId,await hasProjectCapability(user.id,projectId,'observability.manage')] as const)):[]
  const manageableProjects=new Set(manageRows.filter(([,allowed])=>allowed).map(([projectId])=>projectId))

  const versionsById = new Map(versions.map((version) => [version.id, version]))
  const datasetsById = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  const scoreByRun = new Map(scores.map((score) => [score.profile_run_id, score.overall_score]))
  const agentById = new Map(agents.map((agent) => [agent.id, agent]))

  const runsByDataset = new Map<string, ProfileRun[]>()
  for (const run of profileRuns) {
    const datasetId = versionsById.get(run.dataset_version_id)?.dataset_id
    if (!datasetId) continue
    const current = runsByDataset.get(datasetId) ?? []
    current.push(run)
    runsByDataset.set(datasetId, current)
  }

  const datasetSignals = datasets.map((dataset) => {
    const completed = (runsByDataset.get(dataset.id) ?? []).filter((run) => run.status === 'COMPLETED')
    const latest = completed[0]
    const previous = completed[1]
    const latestScore = latest ? scoreByRun.get(latest.id) ?? null : null
    const previousScore = previous ? scoreByRun.get(previous.id) ?? null : null
    const scoreChange = typeof latestScore === 'number' && typeof previousScore === 'number' ? latestScore - previousScore : null
    const schemaChanged = Boolean(latest?.schema_hash && previous?.schema_hash && latest.schema_hash !== previous.schema_hash)
    return { dataset, latest, previous, latestScore, scoreChange, schemaChanged }
  })

  const openAlerts = alerts.filter((alert) => alert.status !== 'RESOLVED')
  const highAlerts = openAlerts.filter((alert) => ['HIGH','CRITICAL'].includes(alert.severity))
  const freshnessAlerts=openAlerts.filter(alert=>String(alert.category).toUpperCase().includes('FRESH'))
  const readySources = sources.filter((source) => source.status === 'ACTIVE').length
  const failedJobs = agentRuns.filter((run) => run.status === 'FAILED').length
  const activeJobs = agentRuns.filter((run) => ['RUNNING','QUEUED','PENDING'].includes(run.status)).length
  const evaluatedRules = qualityRuns.filter((run) => run.status === 'PASSED' || run.status === 'FAILED')
  const passedRules = evaluatedRules.filter((run) => run.status === 'PASSED').length
  const rulePassRate = evaluatedRules.length ? passedRules / evaluatedRules.length : null
  const schemaDriftCount = datasetSignals.filter((signal) => signal.schemaChanged).length

  const sourceHref=canDatasets?'/datasets':'#source-health'
  const jobsHref=canMonitoring?'/monitoring':'#execution-health'

  const kpis=[
    {label:'Ready sources',value:`${readySources}/${sources.length}`,href:sourceHref,Icon:Database,tone:'text-blue-300'},
    {label:'Freshness SLA alerts',value:freshnessAlerts.length,href:'#alerts',Icon:TimerReset,tone:freshnessAlerts.length?'text-amber-300':'text-emerald-300'},
    {label:'Schema drift',value:schemaDriftCount,href:'#dataset-health',Icon:GitCompareArrows,tone:schemaDriftCount?'text-rose-300':'text-emerald-300'},
    {label:'Quality pass rate',value:percent(rulePassRate),href:'#quality-controls',Icon:ShieldCheck,tone:'text-emerald-300'},
    {label:'Active jobs',value:activeJobs,href:jobsHref,Icon:Activity,tone:'text-violet-300'},
    {label:'Failed jobs',value:failedJobs,href:jobsHref,Icon:AlertTriangle,tone:failedJobs?'text-rose-300':'text-emerald-300'},
  ]

  return (
    <main className="min-h-screen bg-[#061426] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <nav className={`${surface} mb-6 flex flex-wrap items-center justify-between gap-4 px-5 py-3`}>
          <Link href="/home" className={`flex items-center gap-3 ${focus}`}><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><Layers3 className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-white">DataNexus AI</span><span className="block text-xs text-slate-500">Operational observability</span></span></Link>
          <div className="flex flex-wrap gap-2 text-sm">{canDatasets?<Link href="/datasets" className={`rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Datasets</Link>:null}<Link href="/profiling/explorer" className={`rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Profiling evidence</Link>{canDataQuality?<Link href="/data-quality" className={`rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Data Quality</Link>:null}{canMonitoring?<Link href="/monitoring" className={`rounded-xl bg-white/[0.06] px-4 py-2 font-semibold text-white ${focus}`}>Job Monitor</Link>:null}{canManageWorkspace?<Link href="/observability/settings" className={`rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Settings</Link>:null}</div>
        </nav>

        <header className={`${surface} p-7 sm:p-9`}>
          <div className="grid gap-7 lg:grid-cols-[1fr_280px] lg:items-center">
            <div><div className="inline-flex items-center gap-2 rounded-full bg-violet-400/10 px-3 py-1.5 text-xs font-bold text-violet-300"><Activity className="h-3.5 w-3.5" /> Live governance observability</div><h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Is governed data staying healthy after onboarding?</h1><p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">This workspace uses persisted connection, profiling, quality-control and job evidence to identify material changes. Freshness breaches are taken from persisted observability policy evaluation, not a frontend threshold.</p></div>
            <Link href="#alerts" className={`${inset} ${interactive} p-6 text-center`}><Eye className="mx-auto h-9 w-9 text-emerald-300" /><p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Open governance alerts</p><p className="mt-1 text-5xl font-black text-white">{openAlerts.length}</p><p className="mt-2 text-sm text-slate-500">{highAlerts.length} high or critical</p></Link>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {kpis.map(({label,value,href,Icon,tone})=><Link key={label} href={href} className={`${surface} ${interactive} p-5`}><Icon className={`h-5 w-5 ${tone}`}/><p className="mt-4 text-2xl font-black text-white">{String(value)}</p><p className="text-xs font-semibold text-slate-500">{label}</p></Link>)}
        </section>

        <section id="source-health" className={`${surface} mt-6 scroll-mt-6 p-6 sm:p-7`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">Source health evidence</h2><p className="mt-1 text-sm text-slate-500">Lifecycle status reported from registered source evidence.</p></div>{canDatasets?<Link href="/datasets" className={`text-sm font-bold text-blue-300 ${focus}`}>Open source workspace →</Link>:null}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sources.map(source=><div key={source.id} className={`${inset} p-4`}><div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-200">{source.name}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(source.status)}`}>{source.status}</span></div><p className="mt-1 text-xs text-slate-500">{source.source_type}</p></div>)}</div>
        </section>

        <section id="dataset-health" className={`${surface} mt-6 scroll-mt-6 p-6 sm:p-7`}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-cyan-300" /><h2 className="text-xl font-bold text-white">Dataset health and change</h2></div><p className="mt-1 text-sm text-slate-500">Latest evidence compared with the immediately preceding completed profile for the same governed dataset.</p></div><Link href="/profiling/explorer" className={`inline-flex items-center gap-1 text-sm font-bold text-blue-300 ${focus}`}>Open profiling evidence <ArrowRight className="h-4 w-4" /></Link></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Dataset</th><th className="px-3 py-2">Latest quality</th><th className="px-3 py-2">Change</th><th className="px-3 py-2">Schema</th><th className="px-3 py-2">Rows</th><th className="px-3 py-2">Last evidence</th></tr></thead><tbody>
            {datasetSignals.map((signal) => <tr key={signal.dataset.id} className="border-b border-white/[0.06]"><td className="px-3 py-3"><Link href={`/catalog/dataset/${encodeURIComponent(signal.dataset.id)}`} className={`font-bold text-slate-200 hover:text-cyan-300 ${focus}`}>{signal.dataset.name}</Link><div className="text-xs text-slate-500">{signal.dataset.business_domain ?? 'Unassigned domain'}</div></td><td className="px-3 py-3 font-bold text-slate-200">{percent(signal.latestScore)}</td><td className={`px-3 py-3 font-semibold ${typeof signal.scoreChange === 'number' ? signal.scoreChange < 0 ? 'text-amber-300' : signal.scoreChange > 0 ? 'text-emerald-300' : 'text-slate-400' : 'text-slate-500'}`}>{typeof signal.scoreChange === 'number' ? `${signal.scoreChange >= 0 ? '+' : ''}${Math.round(signal.scoreChange * 100)} pp` : 'No baseline'}</td><td className="px-3 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${signal.schemaChanged ? 'border-rose-400/20 bg-rose-400/10 text-rose-300' : signal.previous ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.04] text-slate-500'}`}>{signal.schemaChanged ? 'CHANGED' : signal.previous ? 'STABLE' : 'NO BASELINE'}</span></td><td className="px-3 py-3 text-slate-300">{signal.latest?.row_count ?? 'N/A'}</td><td className="px-3 py-3 text-slate-500">{date(signal.latest?.completed_at ?? signal.latest?.started_at)}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div id="alerts" className={`${surface} scroll-mt-6 p-6 sm:p-7`}>
            <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-rose-300" /><h2 className="text-xl font-bold text-white">Governance alerts</h2></div><p className="mt-1 text-sm text-slate-500">Persisted material changes from policy evaluation, quality, schema, volume and automated rule execution.</p></div><span className="rounded-full bg-rose-400/10 px-3 py-1 text-xs font-bold text-rose-300">{openAlerts.length} open</span></div>
            <div className="mt-5 space-y-3">
              {alerts.length ? alerts.slice(0, 30).map((alert) => {
                const dataset = datasetsById.get(alert.dataset_id)
                const canManage=manageableProjects.has(alert.project_id)
                return <article key={alert.id} className={`${inset} p-4`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${severityClass(alert.severity)}`}>{alert.severity}</span><span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(alert.status)}`}>{alert.status}</span><span className="text-xs font-semibold text-slate-500">{alert.category.replaceAll('_',' ')}</span></div><Link href={alert.profile_run_id?`/profiling/explorer?runId=${encodeURIComponent(alert.profile_run_id)}`:`/catalog/dataset/${encodeURIComponent(alert.dataset_id)}`} className={`mt-2 block font-bold text-slate-200 hover:text-cyan-300 ${focus}`}>{alert.title}</Link><p className="mt-1 text-sm leading-6 text-slate-400">{alert.description}</p><p className="mt-2 text-xs text-slate-500">{dataset?.name ?? 'Dataset'} · last observed {date(alert.last_observed_at)}</p></div>{canManage?<AlertActions alertId={alert.id} currentStatus={alert.status} />:null}</div></article>
              }) : <div className={`${inset} p-5 text-sm text-emerald-300`}><CheckCircle2 className="mr-2 inline h-4 w-4" />No persisted observability alerts are currently available.</div>}
            </div>
          </div>

          <div className="space-y-5">
            <section id="quality-controls" className={`${surface} scroll-mt-6 p-6`}><h2 className="text-xl font-bold text-white">Quality control automation</h2><p className="mt-1 text-sm text-slate-500">Rule outcomes are produced from persisted profiling metrics.</p><div className="mt-5 grid grid-cols-2 gap-3"><Link href={canDataQuality?'/data-quality/rules':'#quality-controls'} className={`${inset} ${canDataQuality?interactive:''} p-4`}><p className="text-3xl font-black text-emerald-300">{passedRules}</p><p className="text-xs font-semibold text-slate-500">Passed controls</p></Link><Link href={canDataQuality?'/data-quality/rules':'#quality-controls'} className={`${inset} ${canDataQuality?interactive:''} p-4`}><p className="text-3xl font-black text-rose-300">{evaluatedRules.length - passedRules}</p><p className="text-xs font-semibold text-slate-500">Failed controls</p></Link></div>{canDataQuality?<Link href="/data-quality" className={`mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-300 ${focus}`}>Open quality evidence <ArrowRight className="h-4 w-4" /></Link>:null}</section>
            <section id="execution-health" className={`${surface} scroll-mt-6 p-6`}><h2 className="text-xl font-bold text-white">Execution health</h2><p className="mt-1 text-sm text-slate-500">Profiling, quality automation and registered agent jobs share operational evidence.</p><div className="mt-4 space-y-2">{agentRuns.slice(0, 8).map((run) => { const agent = agentById.get(run.agent_definition_id); const href=canMonitoring?`/monitoring?run=${encodeURIComponent(run.id)}#job-logs`:'#execution-health'; return <Link key={run.id} href={href} className={`${inset} ${canMonitoring?interactive:''} flex items-center justify-between px-3 py-3`}><span><span className="block text-sm font-semibold text-slate-200">{agent?.name ?? 'Agent job'}</span><span className="block text-xs text-slate-500">{date(run.started_at ?? run.created_at)}</span></span><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(run.status)}`}>{run.status}</span></Link> })}</div>{canMonitoring?<Link href="/monitoring" className={`mt-5 inline-flex items-center gap-2 text-sm font-bold text-violet-300 ${focus}`}>Open all jobs <ArrowRight className="h-4 w-4" /></Link>:null}</section>
          </div>
        </section>
      </div>
    </main>
  )
}
