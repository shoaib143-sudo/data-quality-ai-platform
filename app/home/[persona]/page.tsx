import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { isPersonaSlug, personas } from '@/lib/governance/personas'
import { resolveLandingAccess, isLandingPageEnabled } from '@/lib/governance/landing-access'
import { RoleLandingPage, type RoleLandingData } from '@/components/governance/role-landing-page'

type Dataset = { id: string; business_domain: string | null }
type Version = { id: string; dataset_id: string }
type Run = { id: string; dataset_version_id: string; status: string }
type Score = { profile_run_id: string; overall_score: number | null }
type Finding = { id: string; profile_run_id: string; severity: string; title: string; description: string }
type Source = { status: string }
type QualityRun = { status: string; passed: boolean | null }
type Alert = { status: string }

export default async function PersonaHomePage({ params }: { params: Promise<{ persona: string }> }) {
  const { persona: slug } = await params
  if (!isPersonaSlug(slug)) notFound()

  const user = await requireUser()
  const access = await resolveLandingAccess(user.id)

  if (slug !== access.persona) redirect('/home')
  const enabled = await isLandingPageEnabled(access.organizationId, slug)
  if (!enabled) redirect('/home/unavailable')

  const supabase = await createClient()

  const [datasetsResult, versionsResult, runsResult, scoresResult, findingsResult, sourcesResult, qualityRunsResult, alertsResult] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,business_domain').order('created_at', { ascending: false }),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id'),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status').order('started_at', { ascending: false }).limit(250),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score').order('created_at', { ascending: false }).limit(250),
    supabase.schema('profiling').from('profile_findings').select('id,profile_run_id,severity,title,description').order('created_at', { ascending: false }).limit(250),
    supabase.schema('catalog').from('data_sources').select('status'),
    supabase.schema('profiling').from('quality_rule_runs').select('status,passed').order('started_at', { ascending: false }).limit(500),
    supabase.schema('profiling').from('observability_alerts').select('status').order('last_observed_at', { ascending: false }).limit(250),
  ])

  for (const result of [datasetsResult, versionsResult, runsResult, scoresResult, findingsResult, sourcesResult, qualityRunsResult, alertsResult]) {
    if (result.error) throw new Error(`Unable to load role landing data: ${result.error.message}`)
  }

  const datasets = (datasetsResult.data ?? []) as Dataset[]
  const versions = (versionsResult.data ?? []) as Version[]
  const runs = (runsResult.data ?? []) as Run[]
  const scores = (scoresResult.data ?? []) as Score[]
  const findings = (findingsResult.data ?? []) as Finding[]
  const sources = (sourcesResult.data ?? []) as Source[]
  const qualityRuns = (qualityRunsResult.data ?? []) as QualityRun[]
  const alerts = (alertsResult.data ?? []) as Alert[]

  const versionById = new Map(versions.map(v => [v.id, v]))
  const latestRunByDataset = new Map<string, Run>()
  for (const run of runs) {
    const version = versionById.get(run.dataset_version_id)
    if (version && !latestRunByDataset.has(version.dataset_id)) latestRunByDataset.set(version.dataset_id, run)
  }

  const scoreByRun = new Map(scores.map(s => [s.profile_run_id, s]))
  const completedLatestRuns = [...latestRunByDataset.values()].filter(run => run.status === 'COMPLETED')
  const scoredLatestRuns = completedLatestRuns.filter(run => typeof scoreByRun.get(run.id)?.overall_score === 'number')
  const confidence = scoredLatestRuns.length
    ? scoredLatestRuns.reduce((sum, run) => sum + (scoreByRun.get(run.id)?.overall_score ?? 0), 0) / scoredLatestRuns.length
    : null

  const material = findings.filter(f => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(String(f.severity).toUpperCase()))
  const high = findings.filter(f => ['CRITICAL', 'HIGH'].includes(String(f.severity).toUpperCase()))
  const rank = (severity: string) => severity === 'CRITICAL' ? 4 : severity === 'HIGH' ? 3 : severity === 'MEDIUM' ? 2 : 1
  const topFindings = [...material]
    .sort((a, b) => rank(String(b.severity).toUpperCase()) - rank(String(a.severity).toUpperCase()))
    .slice(0, 5)
    .map(f => ({ id: f.id, title: f.title, description: f.description, severity: f.severity }))

  const domainCounts = datasets.reduce<Record<string, number>>((acc, dataset) => {
    const key = dataset.business_domain || 'Unassigned'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const domains = Object.entries(domainCounts).map(([name, assets]) => ({ name, assets })).sort((a, b) => b.assets - a.assets)

  const data: RoleLandingData = {
    confidence,
    governedAssets: datasets.length,
    activeSources: sources.filter(source => source.status === 'ACTIVE').length,
    materialFindings: material.length,
    highFindings: high.length,
    failedControls: qualityRuns.filter(run => run.status === 'FAILED' || run.passed === false).length,
    openAlerts: alerts.filter(alert => alert.status !== 'RESOLVED').length,
    coverage: datasets.length ? Math.round((completedLatestRuns.length / datasets.length) * 100) : 0,
    affectedDomains: domains.filter(domain => domain.name !== 'Unassigned').length,
    topFindings,
    domains,
  }

  const email = user.email ?? ''
  const userLabel = email ? email.split('@')[0].split(/[._-]/).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ') : 'there'
  const canAdmin = Boolean(access.organizationRole && /^(OWNER|ADMIN)$/i.test(access.organizationRole))

  return <RoleLandingPage persona={personas[slug]} data={data} userLabel={userLabel} canAdmin={canAdmin} />
}
