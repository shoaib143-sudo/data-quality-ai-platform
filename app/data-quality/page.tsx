import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, Gauge, Layers3, ShieldCheck, Sparkles } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { QualityRunButton } from './quality-run-button'

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
type QualityRule = { id: string; dataset_id: string; dataset_version_id: string | null; column_name: string | null; rule_key: string; name: string; dimension: string; severity: string; metric_key: string; operator: string; threshold: number | null; enabled: boolean }
type QualityRuleRun = { id: string; rule_definition_id: string; profile_run_id: string | null; status: string; passed: boolean | null; observed_value: number | null; threshold: number | null; completed_at: string | null }

const surface = 'rounded-[22px] border border-white/10 bg-[#0a1d33] shadow-[10px_10px_28px_rgba(0,0,0,.24),-7px_-7px_22px_rgba(30,74,114,.08)]'
const inset = 'rounded-2xl border border-white/[0.07] bg-[#08182b]'
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]'
const interactive = `${focus} transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.04] active:translate-y-0`

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function formatScore(value: number | null | undefined) { return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'N/A' }
function scoreTone(value: number | null | undefined) {
  if (typeof value !== 'number') return 'text-slate-400'
  if (value >= 0.9) return 'text-emerald-300'
  if (value >= 0.75) return 'text-cyan-300'
  if (value >= 0.6) return 'text-amber-300'
  return 'text-rose-300'
}
function severityTone(value: string) {
  const severity = value.toUpperCase()
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'bg-rose-400/10 text-rose-300'
  if (severity === 'MEDIUM') return 'bg-amber-400/10 text-amber-300'
  return 'bg-slate-400/10 text-slate-300'
}

export default async function DataQualityPage() {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const supabase = await createClient()

  const canProfiling = canAccessWorkspace(landing.persona, 'profiling', landing.organizationRole)
  const canObservability = canAccessWorkspace(landing.persona, 'observability', landing.organizationRole)
  const canMonitoring = canAccessWorkspace(landing.persona, 'monitoring', landing.organizationRole)
  const canLineage = canAccessWorkspace(landing.persona, 'lineage', landing.organizationRole)
  const canReports = canAccessWorkspace(landing.persona, 'reports', landing.organizationRole)
  const canDatasets = canAccessWorkspace(landing.persona, 'datasets', landing.organizationRole)

  const { data: profileRuns, error: runsError } = await supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,row_count,column_count,summary,started_at,completed_at,error_code').order('started_at', { ascending: false }).limit(30)
  if (runsError) throw new Error(`Unable to load profiling runs: ${runsError.message}`)

  const runs = (profileRuns ?? []) as ProfileRun[]
  const runIds = runs.map(run => run.id)
  const versionIds = [...new Set(runs.map(run => run.dataset_version_id))]
  const [scoresResult, findingsResult, versionsResult] = await Promise.all([
    runIds.length ? supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,completeness_score,uniqueness_score,validity_score,accuracy_score,overall_score').in('profile_run_id', runIds) : Promise.resolve({ data: [], error: null }),
    runIds.length ? supabase.schema('profiling').from('profile_findings').select('id,profile_run_id,finding_type,severity,title,description,confidence,recommendation').in('profile_run_id', runIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    versionIds.length ? supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number').in('id', versionIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (scoresResult.error) throw new Error(`Unable to load quality scores: ${scoresResult.error.message}`)
  if (findingsResult.error) throw new Error(`Unable to load quality findings: ${findingsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load dataset versions: ${versionsResult.error.message}`)

  const versions = (versionsResult.data ?? []) as DatasetVersion[]
  const datasetIds = [...new Set(versions.map(version => version.dataset_id))]
  const { data: datasetRows, error: datasetsError } = datasetIds.length ? await supabase.schema('catalog').from('datasets').select('id,project_id,name').in('id', datasetIds) : { data: [], error: null }
  if (datasetsError) throw new Error(`Unable to load datasets: ${datasetsError.message}`)

  const datasets = (datasetRows ?? []) as Dataset[]
  const projectIds = [...new Set(datasets.map(dataset => dataset.project_id))]
  const capabilityRows = await Promise.all(projectIds.map(async projectId => {
    const [execute, manage] = await Promise.all([
      hasProjectCapability(user.id, projectId, 'quality.execute'),
      hasProjectCapability(user.id, projectId, 'quality.manage'),
    ])
    return [projectId, { execute, manage }] as const
  }))
  const capabilitiesByProject = new Map(capabilityRows)
  const canAnyExecute = capabilityRows.some(([, capability]) => capability.execute)
  const canAnyManage = capabilityRows.some(([, capability]) => capability.manage)

  const { data: qualityRuleRows, error: qualityRulesError } = datasetIds.length
    ? await supabase.schema('profiling').from('quality_rule_definitions').select('id,dataset_id,dataset_version_id,column_name,rule_key,name,dimension,severity,metric_key,operator,threshold,enabled').in('dataset_id', datasetIds).order('severity').limit(200)
    : { data: [], error: null }
  if (qualityRulesError) throw new Error(`Unable to load quality rules: ${qualityRulesError.message}`)
  const qualityRules = (qualityRuleRows ?? []) as QualityRule[]
  const qualityRuleIds = qualityRules.map(rule => rule.id)
  const { data: qualityRunRows, error: qualityRunsError } = qualityRuleIds.length
    ? await supabase.schema('profiling').from('quality_rule_runs').select('id,rule_definition_id,profile_run_id,status,passed,observed_value,threshold,completed_at').in('rule_definition_id', qualityRuleIds).order('started_at', { ascending: false }).limit(500)
    : { data: [], error: null }
  if (qualityRunsError) throw new Error(`Unable to load quality rule executions: ${qualityRunsError.message}`)

  const scores = (scoresResult.data ?? []) as Score[]
  const findings = (findingsResult.data ?? []) as Finding[]
  const qualityRuleRuns = (qualityRunRows ?? []) as QualityRuleRun[]
  const versionsById = new Map(versions.map(version => [version.id, version]))
  const datasetsById = new Map(datasets.map(dataset => [dataset.id, dataset]))
  const scoresByRunId = new Map(scores.map(score => [score.profile_run_id, score]))
  const findingsByRunId = new Map<string, Finding[]>()
  for (const finding of findings) findingsByRunId.set(finding.profile_run_id, [...(findingsByRunId.get(finding.profile_run_id) ?? []), finding])

  const completedRuns = runs.filter(run => String(run.status).toUpperCase() === 'COMPLETED')
  const scoredRuns = completedRuns.filter(run => typeof scoresByRunId.get(run.id)?.overall_score === 'number')
  const averageScore = scoredRuns.length ? scoredRuns.reduce((sum, run) => sum + Number(scoresByRunId.get(run.id)?.overall_score ?? 0), 0) / scoredRuns.length : null
  const criticalFindings = findings.filter(finding => ['CRITICAL', 'HIGH'].includes(String(finding.severity).toUpperCase()))
  const latestQualityRunByRule = new Map<string, QualityRuleRun>()
  for (const result of qualityRuleRuns) if (!latestQualityRunByRule.has(result.rule_definition_id)) latestQualityRunByRule.set(result.rule_definition_id, result)
  const enabledQualityRules = qualityRules.filter(rule => rule.enabled)
  const failedQualityRules = enabledQualityRules.filter(rule => { const latest = latestQualityRunByRule.get(rule.id); return latest?.passed === false || String(latest?.status ?? '').toUpperCase() === 'FAILED' })
  const latestCompletedRunByVersion = new Map<string, ProfileRun>()
  for (const run of completedRuns) if (!latestCompletedRunByVersion.has(run.dataset_version_id)) latestCompletedRunByVersion.set(run.dataset_version_id, run)

  const recentDatasetRuns = completedRuns.slice(0, 8).map(run => {
    const version = versionsById.get(run.dataset_version_id)
    const dataset = version ? datasetsById.get(version.dataset_id) : undefined
    return { run, version, dataset, score: scoresByRunId.get(run.id) }
  }).filter(item => item.version && item.dataset)

  const controlRunHref = canMonitoring ? '/monitoring' : '/data-quality/rules'
  const impactHref = canLineage ? '/lineage' : canReports ? '/reports' : '/catalog'
  const prepareHref = canDatasets ? '/datasets' : '/catalog'

  return <main className="min-h-screen bg-[#061426] text-slate-100">
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <nav className={`${surface} mb-6 flex flex-wrap items-center justify-between gap-4 px-5 py-3`}>
        <Link href="/home" className={`flex items-center gap-3 text-sm font-bold text-white ${focus}`}><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600"><Layers3 className="h-5 w-5" /></span>DataNexus AI</Link>
        <div className="flex flex-wrap gap-2">{canProfiling ? <Link href="/profiling/explorer" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Profiling Explorer</Link> : null}<Link href="/data-quality/rules" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Quality Rules</Link>{canObservability ? <Link href="/observability" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`}>Observability</Link> : null}</div>
      </nav>

      <header className={`${surface} p-6 sm:p-7`}><div className="flex flex-wrap items-start justify-between gap-5"><div><div className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-300"><Sparkles className="h-3.5 w-3.5" />Evidence-backed data quality</div><h1 className="mt-4 text-3xl font-black tracking-tight text-white">Data Quality</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Understand current quality, open the evidence behind a score, investigate findings, and review governed controls. Business impact is shown only when persisted governance evidence provides it.</p></div>{canProfiling ? <Link href="/profiling/explorer" className={`rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 ${focus}`}>Open profiling evidence <ArrowRight className="ml-1 inline h-4 w-4" /></Link> : null}</div></header>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/profiling/explorer" className={`${surface} ${interactive} p-5`}><Gauge className={`h-5 w-5 ${scoreTone(averageScore)}`} /><p className="mt-3 text-3xl font-black text-white">{formatScore(averageScore)}</p><p className="mt-1 text-sm font-bold text-slate-200">Average quality</p><p className="mt-1 text-xs text-slate-500">Across scored completed runs</p></Link>
        <Link href="/issues" className={`${surface} ${interactive} p-5`}><AlertTriangle className="h-5 w-5 text-rose-300"/><p className="mt-3 text-3xl font-black text-white">{criticalFindings.length}</p><p className="mt-1 text-sm font-bold text-slate-200">High-priority findings</p><p className="mt-1 text-xs text-slate-500">Critical and high persisted findings</p></Link>
        <Link href="/data-quality/rules" className={`${surface} ${interactive} p-5`}><ShieldCheck className="h-5 w-5 text-cyan-300"/><p className="mt-3 text-3xl font-black text-white">{enabledQualityRules.length}</p><p className="mt-1 text-sm font-bold text-slate-200">Enabled controls</p><p className="mt-1 text-xs text-slate-500">Governed deterministic quality rules</p></Link>
        <Link href={controlRunHref} className={`${surface} ${interactive} p-5`}><CheckCircle2 className="h-5 w-5 text-amber-300"/><p className="mt-3 text-3xl font-black text-white">{failedQualityRules.length}</p><p className="mt-1 text-sm font-bold text-slate-200">Current control failures</p><p className="mt-1 text-xs text-slate-500">Latest failed or non-passing executions</p></Link>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">Dataset evidence</p><h2 className="mt-1 text-xl font-black text-white">Latest scored datasets</h2></div><Link href="/profiling/explorer" className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link></div><div className="mt-4 space-y-2">{recentDatasetRuns.map(({run,version,dataset,score}) => <Link key={run.id} href={`/profiling/explorer?runId=${encodeURIComponent(run.id)}`} className={`${inset} ${interactive} flex items-center gap-3 p-4`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-400/10 text-blue-300"><Gauge className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-200">{dataset?.name}</span><span className="mt-0.5 block text-xs text-slate-500">Version {version?.version_number} · {run.row_count ?? 'N/A'} rows · {run.column_count ?? 'N/A'} columns</span></span><span className={`text-lg font-black ${scoreTone(score?.overall_score)}`}>{formatScore(score?.overall_score)}</span><ArrowRight className="h-4 w-4 text-slate-500" /></Link>)}{recentDatasetRuns.length===0?<p className={`${inset} p-5 text-sm text-slate-500`}>No completed profiling evidence is available yet.</p>:null}</div></article>

        <article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-rose-300">Needs investigation</p><h2 className="mt-1 text-xl font-black text-white">Latest findings</h2></div><Link href="/issues" className={`text-xs font-bold text-blue-300 ${focus}`}>Open issues</Link></div><div className="mt-4 space-y-2">{findings.slice(0,8).map(finding => <Link key={finding.id} href={`/profiling/explorer?runId=${encodeURIComponent(finding.profile_run_id)}&findingId=${encodeURIComponent(finding.id)}`} className={`${inset} ${interactive} flex items-start gap-3 p-4`}><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${severityTone(finding.severity)}`}>{finding.severity}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-200">{finding.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{finding.description}</span></span><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-500" /></Link>)}{findings.length===0?<p className={`${inset} p-5 text-sm text-slate-500`}>No persisted findings are available.</p>:null}</div></article>
      </section>

      <section className={`${surface} mt-5 p-5`}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.15em] text-emerald-300">Governed controls</p><h2 className="mt-1 text-xl font-black text-white">Automated quality controls</h2><p className="mt-1 text-sm text-slate-500">Review approved controls and persisted execution evidence.{canAnyExecute ? ' Your current project access also permits governed execution where shown.' : ''}</p></div><Link href="/data-quality/rules" className={`rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/[0.05] ${focus}`}>{canAnyManage ? 'Manage rules' : 'View rules'} <ArrowRight className="ml-1 inline h-4 w-4" /></Link></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><Link href="/data-quality/rules" className={`${inset} ${interactive} p-4`}><p className="text-xs font-bold text-slate-500">Enabled controls</p><p className="mt-1 text-2xl font-black text-emerald-300">{enabledQualityRules.length}</p></Link><Link href={controlRunHref} className={`${inset} ${interactive} p-4`}><p className="text-xs font-bold text-slate-500">Current failures</p><p className="mt-1 text-2xl font-black text-rose-300">{failedQualityRules.length}</p></Link><Link href={controlRunHref} className={`${inset} ${interactive} p-4`}><p className="text-xs font-bold text-slate-500">Persisted executions</p><p className="mt-1 text-2xl font-black text-cyan-300">{qualityRuleRuns.length}</p></Link></div>
        <div className="mt-4 grid gap-2">{versions.slice(0,10).map(version => { const dataset=datasetsById.get(version.dataset_id); const latestProfile=latestCompletedRunByVersion.get(version.id); const datasetRules=enabledQualityRules.filter(rule=>rule.dataset_id===version.dataset_id); if(!dataset||!latestProfile)return null; const canExecute=capabilitiesByProject.get(dataset.project_id)?.execute===true; return <div key={version.id} className={`${inset} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}><Link href={`/profiling/explorer?runId=${encodeURIComponent(latestProfile.id)}`} className={`min-w-0 flex-1 rounded-xl ${focus}`}><span className="block truncate text-sm font-bold text-slate-200">{dataset.name} <span className="text-xs text-slate-500">v{version.version_number}</span></span><span className="mt-1 block text-xs text-slate-500">{datasetRules.length} enabled controls · open latest evidence</span></Link>{canExecute ? <QualityRunButton datasetVersionId={version.id} profileRunId={latestProfile.id}/> : null}</div>})}</div>
      </section>

      <section className="mt-5 space-y-4">{runs.slice(0,8).map(run => {
        const version=versionsById.get(run.dataset_version_id); const dataset=version?datasetsById.get(version.dataset_id):undefined; const score=scoresByRunId.get(run.id); const runFindings=findingsByRunId.get(run.id)??[]; const investigation=asRecord(asRecord(run.summary).investigation); const businessImpact=typeof investigation.business_impact==='string'?investigation.business_impact:null; const recommendations=Array.isArray(investigation.recommendations)?investigation.recommendations:[]
        return <article key={run.id} className={`${surface} overflow-hidden`}><div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] p-5"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-white">{dataset?.name??'Unknown dataset'}</h2>{version?<span className="rounded-lg bg-blue-400/10 px-2 py-1 text-xs font-bold text-blue-300">v{version.version_number}</span>:null}<span className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs font-bold text-slate-400">{run.status}</span></div><Link href={`/profiling/explorer?runId=${encodeURIComponent(run.id)}`} className={`mt-2 inline-flex items-center gap-1 text-xs font-bold text-cyan-300 ${focus}`}>Open run evidence <ArrowRight className="h-3 w-3" /></Link></div><p className={`text-3xl font-black ${scoreTone(score?.overall_score)}`}>{formatScore(score?.overall_score)}</p></div>
          <div className="p-5"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{[['Completeness',score?.completeness_score],['Validity',score?.validity_score],['Uniqueness',score?.uniqueness_score],['Accuracy',score?.accuracy_score],['Rows / columns',`${run.row_count??'N/A'} / ${run.column_count??'N/A'}`]].map(([name,value])=><Link key={String(name)} href={`/profiling/explorer?runId=${encodeURIComponent(run.id)}`} className={`${inset} ${interactive} p-3`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{name}</p><p className="mt-1 text-lg font-black text-slate-200">{typeof value==='number'?formatScore(value):String(value)}</p></Link>)}</div>
          {businessImpact?<Link href={impactHref} className={`${inset} ${interactive} mt-4 block p-4`}><p className="text-xs font-black uppercase tracking-wide text-violet-300">Persisted business impact</p><p className="mt-2 text-sm leading-6 text-slate-300">{businessImpact}</p><p className="mt-2 text-xs font-bold text-blue-300">Review related governed context →</p></Link>:null}
          {runFindings.length?<div className="mt-4 flex flex-wrap gap-2">{runFindings.slice(0,6).map(finding=><Link key={finding.id} href={`/profiling/explorer?runId=${encodeURIComponent(run.id)}&findingId=${encodeURIComponent(finding.id)}`} className={`rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-400/30 hover:text-white ${focus}`}>{finding.severity}: {finding.title}</Link>)}</div>:null}
          {recommendations.length?<div className="mt-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Persisted recommendations</p><div className="mt-2 grid gap-2 md:grid-cols-2">{recommendations.slice(0,4).map((recommendation,index)=><Link key={index} href="/issues" className={`${inset} ${interactive} p-3 text-xs leading-5 text-slate-300`}>{typeof recommendation==='string'?recommendation:JSON.stringify(recommendation)} <ArrowRight className="ml-1 inline h-3 w-3 text-blue-300" /></Link>)}</div></div>:null}
          {run.error_code?<div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300"><AlertTriangle className="h-4 w-4" />{run.error_code}</div>:null}</div></article>
      })}</section>

      {runs.length===0?<section className={`${surface} mt-5 p-9 text-center`}><Gauge className="mx-auto h-8 w-8 text-cyan-300"/><h2 className="mt-3 text-xl font-black text-white">No quality evidence yet</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Prepare or discover a governed dataset to establish the evidence base for quality decisions.</p><Link href={prepareHref} className={`mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white ${focus}`}>{canDatasets ? 'Prepare a dataset' : 'Open governed data'} <ArrowRight className="ml-2 h-4 w-4" /></Link></section>:null}
    </div>
  </main>
}
