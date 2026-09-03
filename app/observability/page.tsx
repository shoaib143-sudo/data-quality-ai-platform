import Link from 'next/link'
import { Activity, AlertTriangle, ArrowRight, BellRing, CheckCircle2, Database, Eye, Gauge, GitCompareArrows, Layers3, ShieldCheck, TimerReset } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { AlertActions } from './alert-actions'

type Dataset = { id: string; project_id: string; name: string; business_domain: string | null }
type Version = { id: string; dataset_id: string; version_number: number }
type ProfileRun = { id: string; dataset_version_id: string; status: string; row_count: number | null; column_count: number | null; schema_hash: string | null; started_at: string | null; completed_at: string | null; error_code: string | null }
type Score = { profile_run_id: string; overall_score: number | null }
type Source = { id: string; name: string; source_type: string; status: string }
type AgentRun = { id: string; dataset_id: string | null; status: string; created_at: string; started_at: string | null; completed_at: string | null; error_code: string | null; agent_definition_id: string }
type AgentDefinition = { id: string; name: string; agent_key: string; version: string }
type QualityRun = { id: string; status: string; passed: boolean | null; completed_at: string | null }
type Alert = { id: string; dataset_id: string; profile_run_id: string | null; category: string; severity: string; title: string; description: string; status: string; evidence: Record<string, unknown>; first_observed_at: string; last_observed_at: string }

function percent(value: number | null | undefined) { return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'N/A' }
function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) : 'N/A' }
function severityClass(value: string) {
  const normalized = value.toUpperCase()
  if (normalized === 'CRITICAL' || normalized === 'HIGH') return 'border-red-200 bg-red-50 text-red-700'
  if (normalized === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}
function statusClass(value: string) {
  const normalized = value.toUpperCase()
  if (['COMPLETED','SUCCEEDED','ACTIVE','PASSED','RESOLVED'].includes(normalized)) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (['FAILED','ERROR'].includes(normalized)) return 'border-red-200 bg-red-50 text-red-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

export default async function ObservabilityPage() {
  await requireUser()
  const supabase = await createClient()

  const [datasetsResult, versionsResult, runsResult, scoresResult, sourcesResult, agentRunsResult, agentsResult, qualityRunsResult, alertsResult] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,business_domain').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number').order('version_number', { ascending: false }),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,row_count,column_count,schema_hash,started_at,completed_at,error_code').order('started_at', { ascending: false }).limit(250),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score').order('created_at', { ascending: false }).limit(250),
    supabase.schema('catalog').from('data_sources').select('id,name,source_type,status').order('name'),
    supabase.schema('agent').from('agent_runs').select('id,dataset_id,status,created_at,started_at,completed_at,error_code,agent_definition_id').order('created_at', { ascending: false }).limit(100),
    supabase.schema('agent').from('agent_definitions').select('id,name,agent_key,version').eq('enabled', true),
    supabase.schema('profiling').from('quality_rule_runs').select('id,status,passed,completed_at').order('started_at', { ascending: false }).limit(500),
    supabase.schema('profiling').from('observability_alerts').select('id,dataset_id,profile_run_id,category,severity,title,description,status,evidence,first_observed_at,last_observed_at').order('last_observed_at', { ascending: false }).limit(200),
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
    const lastEvidence = latest?.completed_at ?? latest?.started_at ?? null
    const evidenceAgeHours = lastEvidence ? (Date.now() - new Date(lastEvidence).getTime()) / 3_600_000 : null
    return { dataset, latest, previous, latestScore, scoreChange, schemaChanged, evidenceAgeHours }
  })

  const openAlerts = alerts.filter((alert) => alert.status !== 'RESOLVED')
  const highAlerts = openAlerts.filter((alert) => ['HIGH','CRITICAL'].includes(alert.severity))
  const readySources = sources.filter((source) => source.status === 'ACTIVE').length
  const failedJobs = agentRuns.filter((run) => run.status === 'FAILED').length
  const activeJobs = agentRuns.filter((run) => ['RUNNING','QUEUED','PENDING'].includes(run.status)).length
  const evaluatedRules = qualityRuns.filter((run) => run.status === 'PASSED' || run.status === 'FAILED')
  const passedRules = evaluatedRules.filter((run) => run.status === 'PASSED').length
  const rulePassRate = evaluatedRules.length ? passedRules / evaluatedRules.length : null
  const staleEvidence = datasetSignals.filter((signal) => signal.evidenceAgeHours === null || signal.evidenceAgeHours > 24).length
  const schemaDriftCount = datasetSignals.filter((signal) => signal.schemaChanged).length

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,_rgba(219,234,254,0.88),_transparent_28%),radial-gradient(circle_at_95%_5%,_rgba(243,232,255,0.86),_transparent_26%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_45%,_#f8fafc_100%)] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/90 px-5 py-3 shadow-sm backdrop-blur">
          <Link href="/dashboard" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5" /></span><span><span className="block text-sm font-bold">Data Governance PowerHouse</span><span className="block text-xs text-slate-500">Operational observability</span></span></Link>
          <div className="flex flex-wrap gap-2 text-sm"><Link href="/datasets" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">Datasets</Link><Link href="/profiling" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">Profiling</Link><Link href="/data-quality" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700">Data Quality</Link><Link href="/monitoring" className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white">Job Monitor</Link></div>
        </nav>

        <header className="rounded-3xl border border-blue-100 bg-white/95 p-7 shadow-[0_24px_80px_rgba(37,99,235,0.10)] sm:p-9">
          <div className="grid gap-7 lg:grid-cols-[1fr_280px] lg:items-center">
            <div><div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700"><Activity className="h-3.5 w-3.5" /> Live governance observability</div><h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Is governed data staying healthy after onboarding?</h1><p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">This workspace uses persisted connection, profiling, quality-control and job evidence to identify material changes. It does not manufacture trends when history is unavailable.</p></div>
            <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-6 text-center"><Eye className="mx-auto h-9 w-9 text-emerald-600" /><p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Open governance alerts</p><p className="mt-1 text-5xl font-black text-slate-950">{openAlerts.length}</p><p className="mt-2 text-sm text-slate-500">{highAlerts.length} high or critical</p></div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Ready sources', `${readySources}/${sources.length}`, Database, 'text-blue-600', 'bg-blue-50'],
            ['Profile evidence stale', staleEvidence, TimerReset, staleEvidence ? 'text-amber-600' : 'text-emerald-600', staleEvidence ? 'bg-amber-50' : 'bg-emerald-50'],
            ['Schema drift', schemaDriftCount, GitCompareArrows, schemaDriftCount ? 'text-red-600' : 'text-emerald-600', schemaDriftCount ? 'bg-red-50' : 'bg-emerald-50'],
            ['Quality pass rate', percent(rulePassRate), ShieldCheck, 'text-emerald-600', 'bg-emerald-50'],
            ['Active jobs', activeJobs, Activity, 'text-violet-600', 'bg-violet-50'],
            ['Failed jobs', failedJobs, AlertTriangle, failedJobs ? 'text-red-600' : 'text-emerald-600', failedJobs ? 'bg-red-50' : 'bg-emerald-50'],
          ].map(([label, value, Icon, tone, bg]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-xl ${bg} ${tone}`}><Icon className="h-5 w-5" /></span><p className="mt-4 text-2xl font-black">{String(value)}</p><p className="text-xs font-semibold text-slate-500">{String(label)}</p></div>)}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-blue-600" /><h2 className="text-xl font-bold">Dataset health and change</h2></div><p className="mt-1 text-sm text-slate-500">Latest evidence compared with the immediately preceding completed profile for the same governed dataset.</p></div><Link href="/profiling" className="inline-flex items-center gap-1 text-sm font-bold text-blue-600">Open profiling evidence <ArrowRight className="h-4 w-4" /></Link></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wider text-slate-400"><th className="px-3 py-2">Dataset</th><th className="px-3 py-2">Latest quality</th><th className="px-3 py-2">Change</th><th className="px-3 py-2">Schema</th><th className="px-3 py-2">Rows</th><th className="px-3 py-2">Last evidence</th></tr></thead><tbody>
            {datasetSignals.map((signal) => <tr key={signal.dataset.id} className="border-b border-slate-100"><td className="px-3 py-3"><div className="font-bold">{signal.dataset.name}</div><div className="text-xs text-slate-400">{signal.dataset.business_domain ?? 'Unassigned domain'}</div></td><td className="px-3 py-3 font-bold">{percent(signal.latestScore)}</td><td className={`px-3 py-3 font-semibold ${typeof signal.scoreChange === 'number' ? signal.scoreChange < -0.1 ? 'text-red-600' : signal.scoreChange > 0 ? 'text-emerald-600' : 'text-slate-600' : 'text-slate-400'}`}>{typeof signal.scoreChange === 'number' ? `${signal.scoreChange >= 0 ? '+' : ''}${Math.round(signal.scoreChange * 100)} pp` : 'No baseline'}</td><td className="px-3 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${signal.schemaChanged ? 'border-red-200 bg-red-50 text-red-700' : signal.previous ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{signal.schemaChanged ? 'DRIFT' : signal.previous ? 'STABLE' : 'NO BASELINE'}</span></td><td className="px-3 py-3">{signal.latest?.row_count ?? 'N/A'}</td><td className="px-3 py-3 text-slate-500">{date(signal.latest?.completed_at ?? signal.latest?.started_at)}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-red-100 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-red-600" /><h2 className="text-xl font-bold">Governance alerts</h2></div><p className="mt-1 text-sm text-slate-500">Persisted material changes from quality score, schema, volume and automated rule execution.</p></div><span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">{openAlerts.length} open</span></div>
            <div className="mt-5 space-y-3">
              {alerts.length ? alerts.slice(0, 30).map((alert) => {
                const dataset = datasetsById.get(alert.dataset_id)
                return <article key={alert.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${severityClass(alert.severity)}`}>{alert.severity}</span><span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(alert.status)}`}>{alert.status}</span><span className="text-xs font-semibold text-slate-400">{alert.category.replaceAll('_',' ')}</span></div><h3 className="mt-2 font-bold text-slate-900">{alert.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{alert.description}</p><p className="mt-2 text-xs text-slate-400">{dataset?.name ?? 'Dataset'} · last observed {date(alert.last_observed_at)}</p></div><AlertActions alertId={alert.id} currentStatus={alert.status} /></div></article>
              }) : <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />No persisted observability alerts are currently available.</div>}
            </div>
          </div>

          <div className="space-y-5">
            <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Quality control automation</h2><p className="mt-1 text-sm text-slate-500">Rule outcomes are produced by the Data Quality Agent from persisted profiling metrics.</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-3xl font-black text-emerald-700">{passedRules}</p><p className="text-xs font-semibold text-emerald-700">Passed controls</p></div><div className="rounded-2xl bg-red-50 p-4"><p className="text-3xl font-black text-red-700">{evaluatedRules.length - passedRules}</p><p className="text-xs font-semibold text-red-700">Failed controls</p></div></div><Link href="/data-quality" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-600">Manage quality controls <ArrowRight className="h-4 w-4" /></Link></section>
            <section className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Execution health</h2><p className="mt-1 text-sm text-slate-500">Profiling, quality automation and other registered agent jobs share the same operational monitor.</p><div className="mt-4 space-y-2">{agentRuns.slice(0, 8).map((run) => { const agent = agentById.get(run.agent_definition_id); return <Link key={run.id} href={`/monitoring?run=${run.id}#job-logs`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 hover:bg-violet-50"><span><span className="block text-sm font-semibold">{agent?.name ?? 'Agent job'}</span><span className="block text-xs text-slate-400">{date(run.started_at ?? run.created_at)}</span></span><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(run.status)}`}>{run.status}</span></Link> })}</div><Link href="/monitoring" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-violet-600">Open all jobs <ArrowRight className="h-4 w-4" /></Link></section>
          </div>
        </section>
      </div>
    </main>
  )
}
