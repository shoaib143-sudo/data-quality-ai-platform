import Link from 'next/link'
import { BrainCircuit, Gauge, Lightbulb, ShieldAlert, Sparkles } from 'lucide-react'

import { authorizeProject } from '@/lib/auth/authorize'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }
type Dataset = { id: string; name: string; project_id: string }
type Version = { id: string; dataset_id: string; version_number: number; status: string }
type ProfileRun = { id: string; dataset_version_id: string; row_count: number | null; column_count: number | null; completed_at: string | null }
type Score = { overall_score: number | null; completeness_score: number | null; uniqueness_score: number | null; validity_score: number | null; accuracy_score: number | null }
type Finding = { id: string; severity: string; title: string; description: string; confidence: number | null }
type Investigation = { severity: string; status: string; summary: string; probable_root_causes: unknown; business_impact: string; recommendations: unknown; approval_required: boolean; created_at: string }
type Prediction = { prediction_type: string; horizon_days: number; probability: number; risk_level: string; confidence: number; explanation: string; calculated_at: string }
type Rule = { id: string; name: string; column_name: string | null; severity: string; approval_status: string; enabled: boolean; description: string | null }
type Suggestion = { id: string; suggestion_type: string; suggestion: unknown; evidence: unknown; confidence: number | null; created_at: string }

const surface='rounded-[22px] border border-white/10 bg-[#0a1d33] shadow-[10px_10px_28px_rgba(0,0,0,.24),-7px_-7px_22px_rgba(30,74,114,.08)]'
const inset='rounded-2xl border border-white/[0.07] bg-[#08182b]'
const focus='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]'
const interactive=`${focus} transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.04] active:translate-y-0`

function pct(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A'
}

function jsonText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(jsonText).filter(Boolean).join(' · ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return ''
}

function riskTone(level: string) {
  const normalized = level.toUpperCase()
  if (normalized === 'CRITICAL' || normalized === 'HIGH') return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
  if (normalized === 'MEDIUM') return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
  return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
}

export default async function AIInsightsPage({ searchParams }: { searchParams: Promise<{ projectId?: string; datasetId?: string; prompt?: string }> }) {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const canAICapabilities = canAccessWorkspace(landing.persona, 'ai-capabilities', landing.organizationRole)
  const canDataQuality = canAccessWorkspace(landing.persona, 'data-quality', landing.organizationRole)
  const params = await searchParams
  const landingPrompt = (params.prompt ?? '').trim().slice(0, 1000)
  const supabase = await createClient()

  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId) ? params.projectId! : projects[0]?.id

  const datasetsResult = selectedProjectId
    ? await supabase.schema('catalog').from('datasets').select('id,name,project_id').eq('project_id', selectedProjectId).order('name')
    : { data: [], error: null }
  if (datasetsResult.error) throw new Error(`Unable to load datasets: ${datasetsResult.error.message}`)
  const datasets = (datasetsResult.data ?? []) as Dataset[]
  const selectedDatasetId = datasets.some((dataset) => dataset.id === params.datasetId) ? params.datasetId! : datasets[0]?.id
  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId)

  let version: Version | null = null
  let profile: ProfileRun | null = null
  let score: Score | null = null
  let findings: Finding[] = []
  let investigation: Investigation | null = null
  let predictions: Prediction[] = []
  let rules: Rule[] = []
  let suggestions: Suggestion[] = []

  if (selectedProjectId) await authorizeProject(user.id, selectedProjectId, 'catalog.read')
  const evidenceClient = selectedProjectId ? createAdminClient() : null

  if (selectedDatasetId && evidenceClient) {
    const versionResult = await evidenceClient.schema('catalog').from('dataset_versions')
      .select('id,dataset_id,version_number,status').eq('dataset_id', selectedDatasetId)
      .order('version_number', { ascending: false }).limit(1).maybeSingle()
    if (versionResult.error) throw new Error(`Unable to load latest dataset version: ${versionResult.error.message}`)
    version = versionResult.data as Version | null
  }

  if (version && evidenceClient) {
    const profileResult = await evidenceClient.schema('profiling').from('profile_runs')
      .select('id,dataset_version_id,row_count,column_count,completed_at')
      .eq('dataset_version_id', version.id).eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false }).limit(1).maybeSingle()
    if (profileResult.error) throw new Error(`Unable to load latest profile: ${profileResult.error.message}`)
    profile = profileResult.data as ProfileRun | null

    const [investigationResult, predictionResult, ruleResult, suggestionResult] = await Promise.all([
      evidenceClient.schema('governance').from('data_quality_investigations')
        .select('severity,status,summary,probable_root_causes,business_impact,recommendations,approval_required,created_at')
        .eq('dataset_version_id', version.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      evidenceClient.schema('governance').from('governance_risk_predictions')
        .select('prediction_type,horizon_days,probability,risk_level,confidence,explanation,calculated_at')
        .eq('dataset_id', selectedDatasetId).order('calculated_at', { ascending: false }).limit(8),
      evidenceClient.schema('profiling').from('quality_rule_definitions')
        .select('id,name,column_name,severity,approval_status,enabled,description')
        .eq('dataset_version_id', version.id).order('created_at', { ascending: false }).limit(50),
      evidenceClient.schema('governance').from('ai_governance_suggestions')
        .select('id,suggestion_type,suggestion,evidence,confidence,created_at')
        .eq('project_id', selectedProjectId!).eq('subject_id', selectedDatasetId).order('created_at', { ascending: false }).limit(100),
    ])
    if (investigationResult.error) throw new Error(`Unable to load AI investigation: ${investigationResult.error.message}`)
    if (predictionResult.error) throw new Error(`Unable to load risk predictions: ${predictionResult.error.message}`)
    if (ruleResult.error) throw new Error(`Unable to load quality recommendations: ${ruleResult.error.message}`)
    if (suggestionResult.error) throw new Error(`Unable to load governance suggestions: ${suggestionResult.error.message}`)
    investigation = investigationResult.data as Investigation | null
    predictions = (predictionResult.data ?? []) as Prediction[]
    rules = (ruleResult.data ?? []) as Rule[]
    suggestions = (suggestionResult.data ?? []) as Suggestion[]

    if (profile) {
      const [scoreResult, findingResult] = await Promise.all([
        evidenceClient.schema('profiling').from('data_quality_scores')
          .select('overall_score,completeness_score,uniqueness_score,validity_score,accuracy_score')
          .eq('profile_run_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        evidenceClient.schema('profiling').from('profile_findings')
          .select('id,severity,title,description,confidence').eq('profile_run_id', profile.id)
          .order('created_at', { ascending: false }).limit(50),
      ])
      if (scoreResult.error) throw new Error(`Unable to load quality score: ${scoreResult.error.message}`)
      if (findingResult.error) throw new Error(`Unable to load profile findings: ${findingResult.error.message}`)
      score = scoreResult.data as Score | null
      findings = (findingResult.data ?? []) as Finding[]
    }
  }

  const pendingRules = rules.filter((rule) => String(rule.approval_status).toUpperCase() === 'PENDING')
  const materialFindings = findings.filter((finding) => ['CRITICAL', 'HIGH'].includes(String(finding.severity).toUpperCase()))
  const latestPredictionByType = new Map<string, Prediction>()
  for (const prediction of predictions) if (!latestPredictionByType.has(prediction.prediction_type)) latestPredictionByType.set(prediction.prediction_type, prediction)
  const currentPredictions = [...latestPredictionByType.values()]
  const latestSuggestionByType = new Map<string, Suggestion>()
  for (const suggestion of suggestions) if (!latestSuggestionByType.has(suggestion.suggestion_type)) latestSuggestionByType.set(suggestion.suggestion_type, suggestion)
  const currentSuggestions = [...latestSuggestionByType.values()]
  const profileHref = profile ? `/profiling/explorer?runId=${encodeURIComponent(profile.id)}` : '/profiling/explorer'

  return (
    <main className="min-h-screen bg-[#061426] p-5 text-slate-100 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/home" className={`text-sm font-medium text-slate-300 hover:text-white ${focus}`}>← Role home</Link>
          {canAICapabilities ? <Link href="/ai-capabilities" className={`rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400/30 ${focus}`}>AI capability coverage</Link> : null}
        </div>

        <header className={`${surface} p-7`}>
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-white"><BrainCircuit className="h-6 w-6" /></span>
            <div><h1 className="text-3xl font-black tracking-tight text-white">DataNexus AI Insights</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A single evidence-backed view of profiling intelligence, investigation, predictive risk, proposed controls and governance recommendations. Suggestions remain advisory until the applicable governance approval is recorded.</p></div>
          </div>
        </header>

        {landingPrompt ? <section className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.08] p-5"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-300"/><div><p className="text-xs font-black uppercase tracking-wide text-violet-300">Question from your landing page</p><p className="mt-2 font-semibold text-white">{landingPrompt}</p><p className="mt-2 text-xs leading-5 text-slate-400">The evidence below is scoped to the selected governed project and dataset. Your question remains context, not governance authority.</p></div></div></section> : null}

        <form className={`${surface} grid gap-3 p-5 sm:grid-cols-2`} method="get">
          {landingPrompt ? <input type="hidden" name="prompt" value={landingPrompt}/> : null}
          <label className="text-sm font-semibold text-slate-300">Project<select name="projectId" defaultValue={selectedProjectId} className="mt-2 w-full rounded-xl border border-white/10 bg-[#08182b] px-3 py-2 font-normal text-slate-200">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-300">Dataset<select name="datasetId" defaultValue={selectedDatasetId} className="mt-2 w-full rounded-xl border border-white/10 bg-[#08182b] px-3 py-2 font-normal text-slate-200">{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select></label>
          <button className={`rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-bold text-white sm:col-span-2 ${focus}`}>Load AI evidence</button>
        </form>

        {!selectedDataset ? <section className={`${surface} p-8 text-sm text-slate-500`}>No governed datasets are available for this project.</section> : <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href={profileHref} className={`${surface} ${interactive} p-5`}><Gauge className="h-5 w-5 text-cyan-300"/><p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Data health</p><p className="mt-1 text-3xl font-black text-white">{pct(score?.overall_score)}</p><p className="mt-1 text-xs text-slate-500">{profile ? `${profile.row_count ?? 'N/A'} rows · ${profile.column_count ?? 'N/A'} columns sampled` : 'No completed profile'}</p></Link>
            <Link href={profileHref} className={`${surface} ${interactive} p-5`}><ShieldAlert className="h-5 w-5 text-amber-300"/><p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Material findings</p><p className="mt-1 text-3xl font-black text-white">{materialFindings.length}</p><p className="mt-1 text-xs text-slate-500">{findings.length} total deterministic findings</p></Link>
            {canDataQuality ? <Link href="/data-quality/rules" className={`${surface} ${interactive} p-5`}><Lightbulb className="h-5 w-5 text-violet-300"/><p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Proposed controls</p><p className="mt-1 text-3xl font-black text-white">{pendingRules.length}</p><p className="mt-1 text-xs text-slate-500">{rules.filter((rule) => rule.enabled).length} enabled · human governance preserved</p></Link> : <div className={`${surface} p-5`}><Lightbulb className="h-5 w-5 text-violet-300"/><p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Proposed controls</p><p className="mt-1 text-3xl font-black text-white">{pendingRules.length}</p><p className="mt-1 text-xs text-slate-500">Governed control evidence is shown without exposing a technical control workspace.</p></div>}
            <Link href="#governance-recommendations" className={`${surface} ${interactive} p-5`}><Sparkles className="h-5 w-5 text-fuchsia-300"/><p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">AI governance suggestions</p><p className="mt-1 text-3xl font-black text-white">{currentSuggestions.length}</p><p className="mt-1 text-xs text-slate-500">Current advisory recommendation types</p></Link>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <article className={`${surface} p-6`}><h2 className="text-lg font-black text-white">AI investigation</h2>{investigation ? <div className="mt-4 space-y-4"><div className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${riskTone(investigation.severity)}`}>{investigation.severity} · {investigation.status}</div><p className="text-sm leading-6 text-slate-300">{investigation.summary}</p><div><p className="text-xs font-bold uppercase text-slate-500">Business impact</p><p className="mt-1 text-sm text-slate-300">{investigation.business_impact || 'No business impact narrative was produced.'}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Probable root causes</p><p className="mt-1 text-sm text-slate-300">{jsonText(investigation.probable_root_causes) || 'No probable root cause was asserted.'}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Recommended actions</p><p className="mt-1 text-sm text-slate-300">{jsonText(investigation.recommendations) || 'No remediation is currently recommended.'}</p></div></div> : <p className="mt-4 text-sm text-slate-500">No Data Quality investigation exists for the latest version.</p>}</article>

            <article className={`${surface} p-6`}><h2 className="text-lg font-black text-white">Predictive risk</h2><div className="mt-4 space-y-3">{currentPredictions.length ? currentPredictions.map((prediction) => <div key={prediction.prediction_type} className={`${inset} p-4`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-slate-200">{prediction.prediction_type.replaceAll('_', ' ')}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(prediction.risk_level)}`}>{prediction.risk_level}</span></div><p className="mt-2 text-2xl font-black text-white">{pct(Number(prediction.probability))}</p><p className="mt-1 text-xs text-slate-500">{prediction.horizon_days}-day horizon · confidence {pct(Number(prediction.confidence))}</p><p className="mt-3 text-sm leading-6 text-slate-400">{prediction.explanation}</p></div>) : <p className="text-sm text-slate-500">No predictive-risk evidence is available.</p>}</div></article>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <article id="governance-recommendations" className={`${surface} scroll-mt-6 p-6`}><h2 className="text-lg font-black text-white">Governance recommendations</h2><p className="mt-1 text-xs text-slate-500">These are AI suggestions, not governance authority. The latest current recommendation per type is shown while historical versions remain preserved as audit evidence.</p><div className="mt-4 space-y-3">{currentSuggestions.length ? currentSuggestions.map((suggestion) => <div key={suggestion.id} className={`${inset} p-4`}><div className="flex justify-between gap-3"><span className="text-sm font-bold text-slate-200">{suggestion.suggestion_type.replaceAll('_', ' ')}</span><span className="text-xs text-slate-500">{pct(suggestion.confidence)}</span></div><p className="mt-2 text-sm leading-6 text-slate-300">{jsonText(suggestion.suggestion)}</p></div>) : <div className={`${inset} border-dashed p-4 text-sm text-slate-500`}>No dataset-level AI governance suggestion has been persisted yet. This is a truthful empty state, not a fabricated recommendation.</div>}</div></article>

            <article className={`${surface} p-6`}><h2 className="text-lg font-black text-white">Pending control review</h2><p className="mt-1 text-xs text-slate-500">Candidate quality controls remain disabled until governed approval.</p><div className="mt-4 space-y-3">{pendingRules.slice(0, 12).map((rule) => canDataQuality ? <Link href="/data-quality/rules" key={rule.id} className={`${inset} ${interactive} block p-4`}><div className="flex flex-wrap justify-between gap-2"><span className="text-sm font-bold text-slate-200">{rule.name}</span><span className="rounded-full bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-300">{rule.approval_status}</span></div><p className="mt-1 text-xs text-slate-500">{rule.column_name || 'Dataset'} · {rule.severity}</p>{rule.description && <p className="mt-2 text-sm text-slate-400">{rule.description}</p>}</Link> : <div key={rule.id} className={`${inset} p-4`}><div className="flex flex-wrap justify-between gap-2"><span className="text-sm font-bold text-slate-200">{rule.name}</span><span className="rounded-full bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-300">{rule.approval_status}</span></div><p className="mt-1 text-xs text-slate-500">{rule.column_name || 'Dataset'} · {rule.severity}</p>{rule.description && <p className="mt-2 text-sm text-slate-400">{rule.description}</p>}</div>)}{pendingRules.length === 0 && <p className="text-sm text-slate-500">No pending quality-control proposals.</p>}</div></article>
          </section>

          <section className={`${surface} p-6`}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-white">Deterministic evidence behind the AI view</h2>{profile ? <Link href={profileHref} className={`text-sm font-semibold text-blue-300 ${focus}`}>Open profiling evidence →</Link> : null}</div><div className="mt-4 grid gap-3 md:grid-cols-2">{findings.slice(0, 12).map((finding) => <Link key={finding.id} href={profile ? `${profileHref}&findingId=${encodeURIComponent(finding.id)}` : profileHref} className={`${inset} ${interactive} block p-4`}><div className="flex justify-between gap-3"><span className="text-sm font-bold text-slate-200">{finding.title}</span><span className="text-xs font-semibold text-slate-500">{finding.severity}</span></div><p className="mt-2 text-sm leading-6 text-slate-400">{finding.description}</p></Link>)}{findings.length === 0 && <p className="text-sm text-slate-500">No persisted findings for the latest profile.</p>}</div></section>
        </>}
      </div>
    </main>
  )
}