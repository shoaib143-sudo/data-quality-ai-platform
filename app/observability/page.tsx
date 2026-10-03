import Link from 'next/link'
import { Activity, AlertTriangle, ArrowRight, BellRing, CheckCircle2, Database, Eye, Gauge, GitCompareArrows, ShieldCheck, TimerReset } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AlertActions } from './alert-actions'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'

type Dataset = { id: string; project_id: string; name: string; business_domain: string | null }
type Version = { id: string; dataset_id: string; version_number: number }
type ProfileRun = { id: string; dataset_version_id: string; status: string; row_count: number | null; column_count: number | null; schema_hash: string | null; started_at: string | null; completed_at: string | null; error_code: string | null }
type Score = { profile_run_id: string; overall_score: number | null }
type Source = { id: string; project_id: string; name: string; source_type: string; status: string; connection_metadata: unknown }
type AgentRun = { id: string; dataset_id: string | null; status: string; created_at: string; started_at: string | null; completed_at: string | null; error_code: string | null; agent_definition_id: string }
type AgentDefinition = { id: string; name: string; agent_key: string; version: string }
type QualityRun = { id: string; status: string; passed: boolean | null; completed_at: string | null }
type Alert = { id: string; project_id: string; dataset_id: string; profile_run_id: string | null; category: string; severity: string; title: string; description: string; status: string; evidence: Record<string, unknown>; first_observed_at: string; last_observed_at: string }
type AiSystem = { id:string; project_id:string; system_key:string; name:string; system_type:string; lifecycle_status:string; current_version_id:string|null; ai_system_versions?: any }
type AiTelemetry = { project_id:string; event_type:string; operation:string; status:string; provider_id:string|null; model_name:string|null; ai_system_id:string|null; ai_system_version_id:string|null; latency_ms:number|null; input_tokens:number|null; output_tokens:number|null; cost_usd:number|null; trace_id:string|null; span_id:string|null; observed_at:string }
type StorageObject = { provider:string; state:string; size_bytes:number|null }
type DiscoveryRun = { id:string; source_id:string; status:string; completed_at:string|null; objects_observed:number|null; objects_added:number|null; objects_changed:number|null; objects_missing:number|null; objects_removed:number|null; error_message:string|null }

const surface='rounded-[22px] border border-white/10 bg-[#0a1d33] shadow-[10px_10px_28px_rgba(0,0,0,.24),-7px_-7px_22px_rgba(30,74,114,.08)]'
const inset='rounded-2xl border border-white/[0.07] bg-[#08182b]'
const focus='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1422]'
const interactive=`${focus} transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.04] active:translate-y-0`

function percent(value: number | null | undefined) { return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'N/A' }
function record(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
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
  const canProfiling=canAccessWorkspace(landing.persona,'profiling',landing.organizationRole)
  const canManageWorkspace=canAccessWorkspace(landing.persona,'observability-manage',landing.organizationRole)

  const [datasetsResult, versionsResult, runsResult, scoresResult, sourcesResult, agentRunsResult, agentsResult, qualityRunsResult, alertsResult, discoveryRunsResult] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,business_domain').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number').order('version_number', { ascending: false }),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,row_count,column_count,schema_hash,started_at,completed_at,error_code').order('started_at', { ascending: false }).limit(250),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score').order('created_at', { ascending: false }).limit(250),
    supabase.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status,connection_metadata').order('name'),
    supabase.schema('agent').from('agent_runs').select('id,dataset_id,status,created_at,started_at,completed_at,error_code,agent_definition_id').order('created_at', { ascending: false }).limit(100),
    supabase.schema('agent').from('agent_definitions').select('id,name,agent_key,version').eq('enabled', true),
    supabase.schema('profiling').from('quality_rule_runs').select('id,status,passed,completed_at').order('started_at', { ascending: false }).limit(500),
    supabase.schema('profiling').from('observability_alerts').select('id,project_id,dataset_id,profile_run_id,category,severity,title,description,status,evidence,first_observed_at,last_observed_at').order('last_observed_at', { ascending: false }).limit(200),
    supabase.schema('catalog').from('discovery_runs').select('id,source_id,status,completed_at,objects_observed,objects_added,objects_changed,objects_missing,objects_removed,error_message').order('observed_from',{ascending:false}).limit(500),
  ])

  for (const [name, result] of [
    ['datasets', datasetsResult], ['versions', versionsResult], ['profile runs', runsResult], ['scores', scoresResult],
    ['sources', sourcesResult], ['agent runs', agentRunsResult], ['agents', agentsResult], ['quality runs', qualityRunsResult], ['alerts', alertsResult], ['metadata discovery runs', discoveryRunsResult],
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
  const discoveryRuns = (discoveryRunsResult.data ?? []) as DiscoveryRun[]

  const projectIds=[...new Set([...datasets.map(dataset=>dataset.project_id),...sources.map(source=>source.project_id)])]

  const [aiSystemsResult, aiTelemetryResult] = projectIds.length ? await Promise.all([
    supabase.schema('governance').from('ai_systems').select('id,project_id,system_key,name,system_type,lifecycle_status,current_version_id,ai_system_versions!ai_systems_current_version_fk(id,version_number,provider,model_name,intended_use,risk_tier,human_oversight)').in('project_id',projectIds).not('current_version_id','is',null),
    supabase.schema('governance').from('ai_telemetry_events').select('project_id,event_type,operation,status,provider_id,model_name,ai_system_id,ai_system_version_id,latency_ms,input_tokens,output_tokens,cost_usd,trace_id,span_id,observed_at').in('project_id',projectIds).order('observed_at',{ascending:false}).limit(1000),
  ]) : [{data:[],error:null},{data:[],error:null}]
  const aiSystems = aiSystemsResult.error ? [] : (aiSystemsResult.data ?? []) as AiSystem[]
  const aiTelemetry = aiTelemetryResult.error ? [] : (aiTelemetryResult.data ?? []) as AiTelemetry[]

  const infrastructureAdmin = Boolean(landing.organizationRole && /^(OWNER|ADMIN)$/i.test(landing.organizationRole))
  const sourceHealthStaleAfterHours = Math.max(1, Number(process.env.SOURCE_HEALTH_STALE_AFTER_HOURS ?? 24) || 24)
  let storageObjects: StorageObject[] = []
  let cloudflareCanary: any = null
  if (infrastructureAdmin && projectIds.length) {
    const admin = createAdminClient()
    const [storageResult, canaryResult] = await Promise.all([
      admin.schema('catalog').from('storage_objects').select('provider,state,size_bytes').in('project_id',projectIds).limit(10000),
      admin.schema('orchestration').rpc('get_cloudflare_observability_canary_status'),
    ])
    if (!storageResult.error) storageObjects = (storageResult.data ?? []) as StorageObject[]
    if (!canaryResult.error) cloudflareCanary = canaryResult.data
  }
  const manageRows=canManageWorkspace?await Promise.all(projectIds.map(async projectId=>[projectId,await hasProjectCapability(user.id,projectId,'observability.manage')] as const)):[]
  const manageableProjects=new Set(manageRows.filter(([,allowed])=>allowed).map(([projectId])=>projectId))

  const versionsById = new Map(versions.map((version) => [version.id, version]))
  const datasetsById = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  const scoreByRun = new Map(scores.map((score) => [score.profile_run_id, score.overall_score]))
  const agentById = new Map(agents.map((agent) => [agent.id, agent]))
  const latestDiscoveryBySource = new Map<string,DiscoveryRun>()
  for (const run of discoveryRuns) if (!latestDiscoveryBySource.has(run.source_id)) latestDiscoveryBySource.set(run.source_id,run)

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

  const aiTelemetryBySystem = new Map<string,AiTelemetry[]>()
  for (const event of aiTelemetry) {
    const key = event.ai_system_id || event.model_name || event.provider_id || 'unassigned'
    aiTelemetryBySystem.set(key,[...(aiTelemetryBySystem.get(key)??[]),event])
  }
  const aiModelHealth = aiSystems.map(system => {
    const version = Array.isArray(system.ai_system_versions) ? system.ai_system_versions[0] : system.ai_system_versions
    const events = aiTelemetryBySystem.get(system.id) ?? aiTelemetry.filter(event => event.ai_system_version_id === version?.id || (event.model_name && event.model_name === version?.model_name))
    const latencies = events.map(event => Number(event.latency_ms)).filter(value => Number.isFinite(value) && value >= 0).sort((a,b)=>a-b)
    const p95 = latencies.length ? latencies[Math.min(latencies.length-1,Math.floor(latencies.length*0.95))] : null
    const errors = events.filter(event => String(event.status).toUpperCase() === 'ERROR').length
    const inputTokens = events.reduce((sum,event)=>sum+Number(event.input_tokens??0),0)
    const outputTokens = events.reduce((sum,event)=>sum+Number(event.output_tokens??0),0)
    const cost = events.reduce((sum,event)=>sum+Number(event.cost_usd??0),0)
    const traced = events.filter(event=>Boolean(event.trace_id&&event.span_id)).length
    const traceCoverage = events.length ? traced/events.length : null
    const success = events.filter(event=>String(event.status).toUpperCase()==='SUCCESS').length
    const successRate = events.length ? success/events.length : null
    const operations = [...new Set(events.map(event=>event.operation).filter(Boolean))].slice(0,4)
    return {system,version,events,p95,errors,inputTokens,outputTokens,cost,traced,traceCoverage,successRate,operations,lastObserved:events[0]?.observed_at??null}
  })

  const storageSummary = storageObjects.reduce((acc,row)=>{
    const provider=String(row.provider||'unknown').toLowerCase()
    const current=acc.get(provider)??{objects:0,ready:0,bytes:0}
    current.objects += 1
    current.bytes += Number(row.size_bytes??0)
    if(String(row.state).toUpperCase()==='READY') current.ready += 1
    acc.set(provider,current)
    return acc
  },new Map<string,{objects:number;ready:number;bytes:number}>())

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
    <main id="main-content" tabIndex={-1} className="dn-light-workspace dn-operations-v3 min-h-screen bg-[#0b1422] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Observability" contextLabel="Operational governance health" homeHref="/home" />
        <nav className={`${surface} mb-6 mt-4 flex flex-wrap items-center justify-end gap-4 px-5 py-3`}>
          <div className="flex flex-wrap gap-2 text-sm">{canDatasets?<Link href="/datasets" className={`rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Datasets</Link>:null}{canProfiling?<Link href="/profiling/explorer" className={`rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Profiling evidence</Link>:null}{canDataQuality?<Link href="/data-quality" className={`rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Data Quality</Link>:null}{canMonitoring?<Link href="/monitoring" className={`rounded-xl bg-white/[0.06] px-4 py-2 font-semibold text-white ${focus}`}>Job Monitor</Link>:null}{canManageWorkspace?<Link href="/observability/settings" className={`rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Settings</Link>:null}</div>
        </nav>

        <header className={`${surface} p-7 sm:p-9`}>
          <div className="grid gap-7 lg:grid-cols-[1fr_280px] lg:items-center">
            <div><div className="inline-flex items-center gap-2 rounded-full bg-violet-400/10 px-3 py-1.5 text-xs font-bold text-violet-300"><Activity className="h-3.5 w-3.5" /> Live governance observability</div><h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Is governed data staying healthy after onboarding?</h1><p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">This workspace uses persisted connection, profiling, quality-control and job evidence to identify material changes. Freshness breaches are taken from persisted observability policy evaluation, not a frontend threshold.</p></div>
            <Link href="#alerts" className={`${inset} ${interactive} p-6 text-center`}><Eye className="mx-auto h-9 w-9 text-emerald-300" /><p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Open governance alerts</p><p className="mt-1 text-5xl font-black text-white">{openAlerts.length}</p><p className="mt-2 text-sm text-slate-500">{highAlerts.length} high or critical</p></Link>
          </div>
        </header>

        <section className="mt-6 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {kpis.map(({label,value,href,Icon,tone})=><Link key={label} href={href} className={`${surface} ${interactive} p-5`}><Icon className={`h-5 w-5 ${tone}`}/><p className="mt-4 text-2xl font-black text-white">{String(value)}</p><p className="text-xs font-semibold text-slate-500">{label}</p></Link>)}
        </section>

        <section id="source-health" className={`${surface} mt-6 scroll-mt-6 p-6 sm:p-7`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">Source health evidence</h2><p className="mt-1 text-sm text-slate-500">Lifecycle status reported from registered source evidence.</p></div>{canDatasets?<Link href="/datasets" className={`text-sm font-bold text-blue-300 ${focus}`}>Open source workspace →</Link>:null}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sources.map(source=>{const scan=latestDiscoveryBySource.get(source.id);const scanFailed=scan&&['FAILED','INCOMPLETE'].includes(scan.status.toUpperCase());const metadata=record(source.connection_metadata);const health=record(metadata.connection_health);const connectionStatusRaw=typeof health.status==='string'?health.status:'NO EVIDENCE';const checkedAt=typeof health.checked_at==='string'?health.checked_at:null;const stale=Boolean(checkedAt&&Date.now()-new Date(checkedAt).getTime()>sourceHealthStaleAfterHours*60*60*1000);const connectionStatus=stale&&connectionStatusRaw==='HEALTHY'?'STALE':connectionStatusRaw;return <div key={source.id} className={`${inset} p-4`}><div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-200">{source.name}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(source.status)}`}>{source.status}</span></div><p className="mt-1 text-xs text-slate-500">{source.source_type}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-white/[0.05] bg-[#07182a] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Connection health</p><p className={`mt-1 text-xs font-bold ${connectionStatus==='HEALTHY'?'text-emerald-300':connectionStatus==='STALE'?'text-amber-300':'text-rose-300'}`}>{connectionStatus}</p><p className="mt-1 text-[10px] text-slate-600">{checkedAt?`${date(checkedAt)}${stale?` · stale after ${sourceHealthStaleAfterHours}h`:''}`:'No persisted connection check'}</p></div><div className="rounded-xl border border-white/[0.05] bg-[#07182a] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Metadata scan</p><p className={`mt-1 text-xs font-bold ${scan?(scanFailed?'text-rose-300':'text-emerald-300'):'text-slate-500'}`}>{scan?.status??'NO EVIDENCE'}</p><p className="mt-1 text-[10px] text-slate-600">{scan?.completed_at?date(scan.completed_at):scan?'In progress':'No scan observed'}</p></div></div><div className="mt-3 border-t border-white/[0.06] pt-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-slate-600">Latest metadata scan</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${scan?statusClass(scan.status):'border-slate-700 text-slate-500'}`}>{scan?.status??'NO EVIDENCE'}</span></div>{scan?<><p className="mt-2 text-[11px] text-slate-500">Observed {scan.objects_observed??0} · +{scan.objects_added??0} added · {scan.objects_changed??0} changed · {scan.objects_removed??0} removed</p>{scanFailed&&scan.error_message?<p className="mt-2 line-clamp-2 text-[11px] text-rose-300">{scan.error_message}</p>:null}</>:<p className="mt-2 text-[11px] text-slate-600">No metadata discovery run has been observed for this source.</p>}</div></div>})}</div>
        </section>

        <section id="ai-model-health" className={`${surface} mt-6 scroll-mt-6 p-6 sm:p-7`}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-violet-300" /><h2 className="text-xl font-bold text-white">AI model health and usage</h2></div><p className="mt-1 text-sm text-slate-500">Governed model registry state combined with persisted invocation telemetry. No prompts, completions or hidden reasoning are exposed.</p></div><Link href="/agents" className={`text-sm font-bold text-blue-300 ${focus}`}>Open AI operations →</Link></div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {aiModelHealth.length ? aiModelHealth.map(({system,version,events,p95,errors,inputTokens,outputTokens,cost,traced,traceCoverage,successRate,operations,lastObserved}) => <article key={system.id} className={`${inset} p-4`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-slate-200">{system.name}</p><p className="mt-1 text-xs text-slate-500">{version?.provider??'Provider unavailable'} · {version?.model_name??'Model unavailable'} · {version?.risk_tier??'Risk tier N/A'}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(system.lifecycle_status)}`}>{system.lifecycle_status}</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6"><div><p className="text-[10px] uppercase text-slate-600">Invocations</p><p className="mt-1 font-black text-white">{events.length}</p></div><div><p className="text-[10px] uppercase text-slate-600">Errors</p><p className={`mt-1 font-black ${errors?'text-rose-300':'text-emerald-300'}`}>{errors}</p></div><div><p className="text-[10px] uppercase text-slate-600">Success rate</p><p className="mt-1 font-black text-white">{successRate==null?'N/A':`${Math.round(successRate*100)}%`}</p></div><div><p className="text-[10px] uppercase text-slate-600">Trace coverage</p><p className="mt-1 font-black text-white">{traceCoverage==null?'N/A':`${Math.round(traceCoverage*100)}%`}</p><p className="text-[10px] text-slate-600">{traced} traced</p></div><div><p className="text-[10px] uppercase text-slate-600">P95 latency</p><p className="mt-1 font-black text-white">{p95==null?'N/A':`${Math.round(p95)} ms`}</p></div><div><p className="text-[10px] uppercase text-slate-600">Token volume</p><p className="mt-1 font-black text-white">{(inputTokens+outputTokens).toLocaleString()}</p></div></div><div className="mt-3 rounded-xl border border-white/[0.05] bg-[#07182a] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Governance posture</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>Oversight: {version?.human_oversight??'N/A'}</span><span>Risk: {version?.risk_tier??'N/A'}</span><span>Operations: {operations.length?operations.join(', '):'No telemetry'}</span><span>Cost ${cost.toFixed(4)}</span><span>Last observed: {date(lastObserved)}</span></div></div></article>) : <p className={`${inset} p-5 text-sm text-slate-500 lg:col-span-2`}>No governed AI systems or invocation telemetry are visible for the current scope.</p>}
          </div>
        </section>

        {infrastructureAdmin ? <section id="infrastructure-health" className={`${surface} mt-6 scroll-mt-6 p-6 sm:p-7`}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Database className="h-5 w-5 text-cyan-300"/><h2 className="text-xl font-bold text-white">Connected infrastructure health</h2></div><p className="mt-1 text-sm text-slate-500">Read-only health summary for storage and the Cloudflare observability execution boundary. Secret values are never displayed.</p></div><Link href="/admin/infrastructure" className={`text-sm font-bold text-blue-300 ${focus}`}>Open infrastructure detail →</Link></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{['supabase','r2'].map(provider=>{const state=storageSummary.get(provider)??{objects:0,ready:0,bytes:0};return <article key={provider} className={`${inset} p-4`}><p className="text-xs font-black uppercase tracking-wide text-slate-500">{provider==='r2'?'Cloudflare R2':'Supabase Storage'}</p><p className="mt-2 text-2xl font-black text-white">{state.ready}/{state.objects}</p><p className="text-xs text-slate-500">objects ready</p></article>})}<article className={`${inset} p-4`}><p className="text-xs font-black uppercase tracking-wide text-slate-500">Cloudflare worker</p><p className={`mt-2 text-lg font-black ${cloudflareCanary?.enabled&&cloudflareCanary?.runtime_configured?'text-emerald-300':'text-amber-300'}`}>{cloudflareCanary?.enabled?'Enabled':'Not confirmed'}</p><p className="mt-1 text-xs text-slate-500">{cloudflareCanary?.cron_active?'Cron active':'Cron inactive or unavailable'}</p></article><article className={`${inset} p-4`}><p className="text-xs font-black uppercase tracking-wide text-slate-500">Canary jobs</p><p className="mt-2 text-2xl font-black text-white">{Number(cloudflareCanary?.running??0)}</p><p className="text-xs text-slate-500">running · {Number(cloudflareCanary?.failed??0)} failed</p></article></div></section> : null}

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