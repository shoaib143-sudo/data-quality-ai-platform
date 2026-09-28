import Link from 'next/link'
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Database, FileWarning, Gauge, Network, ShieldCheck, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { createClient } from '@/lib/supabase/server'
import './dashboard.css'

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
  const failedQualityControls = qualityRuns.filter(run => run.status === 'FAILED').length
  const openGovernanceAlerts = observabilityAlerts.filter(alert => alert.status !== 'RESOLVED')
  const schemaDriftAlerts = openGovernanceAlerts.filter(alert => alert.category === 'SCHEMA_DRIFT').length
  const failedJobs = agentRuns.filter(run => run.status === 'FAILED').length
  const coverageGap = Math.max(0, datasets.length - readyDatasets)

  const quickLinks = [
    { href: '/catalog', label: 'Data catalog', detail: 'Explore governed assets', icon: Database },
    { href: '/data-quality', label: 'Data quality', detail: 'Review findings and scores', icon: ShieldCheck },
    { href: '/lineage', label: 'Lineage', detail: 'Trace upstream impact', icon: Network },
    { href: '/monitoring', label: 'Job monitor', detail: 'Follow live execution', icon: Activity },
  ]

  return (
    <main id="main-content" tabIndex={-1} className="dashboard-shell">
      <div className="dashboard-frame">
        <div className="dashboard-workspace">
          <GlobalUtilityBar contextLabel="Governance overview" />
          <div className="dashboard-content">
            <div className="dashboard-heading">
              <div><p className="dashboard-eyebrow">DATA GOVERNANCE / OVERVIEW</p><h1>Good to see you, {user.email?.split('@')[0] ?? 'there'}.</h1><p>Your governance workspace at a glance, based on recorded platform evidence.</p></div>
              <Link href="/monitoring" className="dashboard-primary-action">Open job monitor <ArrowRight aria-hidden="true" /></Link>
            </div>

            <section className="dashboard-hero" aria-labelledby="dashboard-health-title">
              <div className="dashboard-hero-copy"><span className="dashboard-chip"><Sparkles aria-hidden="true" /> GOVERNANCE PULSE</span><h2 id="dashboard-health-title">Make confident decisions from trusted data.</h2><p>Follow quality, coverage and execution from one place. Each signal below comes from persisted platform evidence.</p><div className="dashboard-hero-actions"><Link href="/data-quality">Explore quality <ArrowRight aria-hidden="true" /></Link><Link href="/datasets">View datasets</Link></div></div>
              <div className="dashboard-health" aria-label={`Overall data health ${percent(overallScore)}`}><div className="dashboard-health-ring"><Gauge aria-hidden="true" /><strong>{percent(overallScore)}</strong></div><span>OVERALL DATA HEALTH</span><p>{overallScore === null ? 'Build the evidence base' : overallScore >= .8 ? 'Generally trusted for decisions' : 'Attention required'}</p></div>
            </section>

            <section className="dashboard-section" aria-labelledby="dashboard-signals-title"><div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">LIVE SIGNALS</p><h2 id="dashboard-signals-title">What needs attention</h2></div><Link href="/observability">View observability <ArrowRight aria-hidden="true" /></Link></div>
              <div className="dashboard-stat-grid" aria-label="Attention now">
                <Link href="/data-quality" className="dashboard-stat"><span className="dashboard-stat-icon risk"><FileWarning aria-hidden="true" /></span><span className="dashboard-stat-value">{highFindings.length}</span><strong>High priority findings</strong><small>High and critical severity</small></Link>
                <Link href="/observability" className="dashboard-stat"><span className="dashboard-stat-icon warn"><AlertTriangle aria-hidden="true" /></span><span className="dashboard-stat-value">{openGovernanceAlerts.length}</span><strong>Open alerts</strong><small>{schemaDriftAlerts} schema drift signals</small></Link>
                <Link href="/monitoring" className="dashboard-stat"><span className="dashboard-stat-icon violet"><Activity aria-hidden="true" /></span><span className="dashboard-stat-value">{failedJobs}</span><strong>Failed recent jobs</strong><small>Inspect execution evidence</small></Link>
                <Link href="/datasets" className="dashboard-stat"><span className="dashboard-stat-icon blue"><Database aria-hidden="true" /></span><span className="dashboard-stat-value">{coverageGap}</span><strong>Coverage gaps</strong><small>Datasets awaiting profiling</small></Link>
              </div>
            </section>

            <div className="dashboard-columns">
              <section className="dashboard-panel" aria-labelledby="dashboard-workspaces-title"><div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">YOUR WORKSPACE</p><h2 id="dashboard-workspaces-title">Pick up where you need to</h2></div></div><div className="dashboard-link-grid">{quickLinks.map(({ href, label, detail, icon: Icon }) => <Link href={href} key={href} className="dashboard-workspace-link"><span className="dashboard-workspace-icon"><Icon aria-hidden="true" /></span><span><strong>{label}</strong><small>{detail}</small></span><ArrowRight className="dashboard-link-arrow" aria-hidden="true" /></Link>)}</div></section>
              <section className="dashboard-panel" aria-labelledby="dashboard-coverage-title"><div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">EVIDENCE COVERAGE</p><h2 id="dashboard-coverage-title">Platform snapshot</h2></div></div><div className="dashboard-evidence-list"><div><span><Database aria-hidden="true" /> Governed datasets</span><strong>{datasets.length}</strong></div><div><span><CheckCircle2 aria-hidden="true" /> Profiling coverage</span><strong>{governanceCoverage}%</strong></div><div><span><ShieldCheck aria-hidden="true" /> Ready connections</span><strong>{readySources}/{sources.length}</strong></div><div><span><FileWarning aria-hidden="true" /> Datasets with findings</span><strong>{affectedDatasetIds.size}</strong></div><div><span><Activity aria-hidden="true" /> Failed quality controls</span><strong>{failedQualityControls}</strong></div></div><Link href="/profiling" className="dashboard-panel-footer">Inspect profiling evidence <ArrowRight aria-hidden="true" /></Link></section>
            </div>

            <section className="dashboard-panel dashboard-findings" aria-labelledby="dashboard-findings-title"><div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">EVIDENCE LED</p><h2 id="dashboard-findings-title">Priority findings</h2><p>Highest severity findings recorded by profiling.</p></div><Link href="/data-quality">View all findings <ArrowRight aria-hidden="true" /></Link></div><div className="dashboard-finding-list">{topFindings.length ? topFindings.map(f => <div key={f.id} className="dashboard-finding"><span className="dashboard-finding-dot" aria-hidden="true" /><div><strong>{f.title}</strong><p>{f.description}</p></div><span className="dashboard-severity">{f.severity}</span></div>) : <p className="dashboard-empty">No high or critical findings are currently persisted.</p>}</div></section>
            <footer className="dashboard-footer">Signed in as {user.email ?? 'current user'} · Governance decisions are based on persisted platform evidence.</footer>
          </div>
        </div>
      </div>
    </main>
  )
}
