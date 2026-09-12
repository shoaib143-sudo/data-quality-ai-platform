import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPersonaSlug, personas } from '@/lib/governance/personas'
import { resolveLandingAccess, isLandingPageEnabled } from '@/lib/governance/landing-access'
import { RoleLandingPage, type LandingActivity, type LandingDataset, type LandingDomain, type LandingImpact, type LandingTrendPoint, type RoleLandingData } from '@/components/governance/role-landing-page'

type Dataset = { id: string; project_id: string; name: string; business_domain: string | null }
type Version = { id: string; dataset_id: string; version_number: number }
type Run = { id: string; dataset_version_id: string; status: string; started_at: string; completed_at: string | null }
type Score = { profile_run_id: string; overall_score: number | null; completeness_score: number | null; uniqueness_score: number | null; validity_score: number | null; accuracy_score: number | null; created_at: string }
type Finding = { id: string; profile_run_id: string; severity: string; title: string; description: string; created_at: string }
type Source = { status: string }
type QualityRun = { status: string; passed: boolean | null; started_at: string }
type Alert = { status: string; last_observed_at: string | null }
type DatasetCatalog = { dataset_id: string; certification_status: string; criticality: string; business_owner_user_id: string | null; steward_user_id: string | null }
type StewardshipCoverage = { dataset_id: string; business_owner_count: number | string; data_steward_count: number | string; technical_owner_count: number | string; custodian_count: number | string; coverage_status: string }
type Classification = { dataset_id: string | null; status: string | null; authority_state: string | null }
type GlossaryMapping = { dataset_id: string | null; approved: boolean | null; mapping_status: string | null }
type CdeMapping = { dataset_id: string; status: string }
type CertificationRequest = { id: string; dataset_id: string; status: string; requested_at: string }
type Waiver = { id: string; status: string; requested_at: string }
type ControlEvaluation = { id: string; result: string; evaluated_at: string }
type Issue = { id: string; dataset_id: string | null; profile_run_id: string | null; finding_id: string | null; title: string; description: string; severity: string; status: string; updated_at: string }
type ContextAsset = { id: string; asset_type: string; name: string }
type ContextLink = { dataset_id: string; business_context_asset_id: string }

type SearchParams = Promise<{ domain?: string; datasetId?: string; dimension?: string; range?: string }>

const rangeDays = { '30d': 30, '90d': 90, '180d': 180, '365d': 365 } as const
const dimensions = ['overall', 'completeness', 'validity', 'accuracy', 'uniqueness'] as const
type Dimension = (typeof dimensions)[number]

function upper(value: unknown) { return String(value ?? '').trim().toUpperCase() }
function isMaterial(severity: string) { return ['CRITICAL', 'HIGH', 'MEDIUM'].includes(upper(severity)) }
function isHigh(severity: string) { return ['CRITICAL', 'HIGH'].includes(upper(severity)) }
function rank(severity: string) { const value = upper(severity); return value === 'CRITICAL' ? 4 : value === 'HIGH' ? 3 : value === 'MEDIUM' ? 2 : 1 }
function isPending(value: string) { return ['PENDING', 'REQUESTED', 'SUBMITTED', 'OPEN', 'IN_REVIEW'].includes(upper(value)) }
function isUnresolved(value: string) { return !['RESOLVED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(upper(value)) }
function isFailedControl(value: string) { return ['FAIL', 'FAILED', 'ERROR', 'NON_COMPLIANT', 'NON-COMPLIANT', 'NOT_MET'].includes(upper(value)) }
function isApprovedClassification(row: Classification) { return ['APPROVED', 'ACCEPTED', 'CONFIRMED'].includes(upper(row.status)) || ['AUTHORITATIVE', 'APPROVED', 'CONFIRMED'].includes(upper(row.authority_state)) }
function isApprovedGlossary(row: GlossaryMapping) { return row.approved === true || ['APPROVED', 'ACCEPTED', 'CONFIRMED'].includes(upper(row.mapping_status)) }
function scoreValue(score: Score, dimension: Dimension) {
  if (dimension === 'completeness') return score.completeness_score
  if (dimension === 'validity') return score.validity_score
  if (dimension === 'accuracy') return score.accuracy_score
  if (dimension === 'uniqueness') return score.uniqueness_score
  return score.overall_score
}
function readableAssetType(value: string) {
  return value.toLowerCase().split('_').map(part => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ')
}
function relativeDate(value: string | null) {
  if (!value) return ''
  const diff = Math.max(0, Date.now() - new Date(value).getTime())
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'recently'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default async function PersonaHomePage({ params, searchParams }: { params: Promise<{ persona: string }>; searchParams: SearchParams }) {
  const { persona: slug } = await params
  if (!isPersonaSlug(slug)) notFound()

  const user = await requireUser()
  const access = await resolveLandingAccess(user.id)
  if (slug !== access.persona) redirect('/home')
  const enabled = await isLandingPageEnabled(access.organizationId, slug)
  if (!enabled) redirect('/home/unavailable')

  const requested = await searchParams
  const selectedRange = requested.range && requested.range in rangeDays ? requested.range as keyof typeof rangeDays : '180d'
  const selectedDimension = dimensions.includes((requested.dimension ?? '') as Dimension) ? requested.dimension as Dimension : 'overall'

  const supabase = await createClient()
  const [datasetsResult, versionsResult, runsResult, scoresResult, findingsResult, sourcesResult, qualityRunsResult, alertsResult] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,business_domain').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number'),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,started_at,completed_at').order('started_at', { ascending: false }).limit(1200),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score,completeness_score,uniqueness_score,validity_score,accuracy_score,created_at').order('created_at', { ascending: false }).limit(2000),
    supabase.schema('profiling').from('profile_findings').select('id,profile_run_id,severity,title,description,created_at').order('created_at', { ascending: false }).limit(1500),
    supabase.schema('catalog').from('data_sources').select('status'),
    supabase.schema('profiling').from('quality_rule_runs').select('status,passed,started_at').order('started_at', { ascending: false }).limit(1000),
    supabase.schema('profiling').from('observability_alerts').select('status,last_observed_at').order('last_observed_at', { ascending: false }).limit(500),
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

  const datasetIds = datasets.map(dataset => dataset.id)
  const projectIds = [...new Set(datasets.map(dataset => dataset.project_id))]
  const admin = createAdminClient()
  const empty = { data: [], error: null }
  const [catalogResult, stewardshipResult, classificationsResult, glossaryResult, cdeResult, certificationResult, waiverResult, controlResult, issuesResult, contextAssetsResult, contextLinksResult] = await Promise.all([
    datasetIds.length ? admin.schema('governance').from('dataset_catalog').select('dataset_id,certification_status,criticality,business_owner_user_id,steward_user_id').in('dataset_id', datasetIds) : empty,
    datasetIds.length ? admin.schema('governance').from('stewardship_dataset_coverage').select('dataset_id,business_owner_count,data_steward_count,technical_owner_count,custodian_count,coverage_status').in('dataset_id', datasetIds) : empty,
    datasetIds.length ? admin.schema('governance').from('dataset_classifications').select('dataset_id,status,authority_state').in('dataset_id', datasetIds) : empty,
    datasetIds.length ? admin.schema('governance').from('glossary_mappings').select('dataset_id,approved,mapping_status').in('dataset_id', datasetIds) : empty,
    datasetIds.length ? admin.schema('governance').from('cde_mappings').select('dataset_id,status').in('dataset_id', datasetIds) : empty,
    projectIds.length ? admin.schema('governance').from('certification_requests').select('id,dataset_id,status,requested_at').in('project_id', projectIds) : empty,
    projectIds.length ? admin.schema('governance').from('control_waivers').select('id,status,requested_at').in('project_id', projectIds) : empty,
    projectIds.length ? admin.schema('governance').from('control_evaluations').select('id,result,evaluated_at').in('project_id', projectIds) : empty,
    projectIds.length ? admin.schema('governance').from('issues').select('id,dataset_id,profile_run_id,finding_id,title,description,severity,status,updated_at').in('project_id', projectIds).order('updated_at', { ascending: false }).limit(500) : empty,
    projectIds.length ? admin.schema('governance').from('business_context_assets').select('id,asset_type,name').in('project_id', projectIds) : empty,
    datasetIds.length ? admin.schema('governance').from('dataset_business_context_links').select('dataset_id,business_context_asset_id').in('dataset_id', datasetIds) : empty,
  ])

  for (const result of [catalogResult, stewardshipResult, classificationsResult, glossaryResult, cdeResult, certificationResult, waiverResult, controlResult, issuesResult, contextAssetsResult, contextLinksResult]) {
    if (result.error) throw new Error(`Unable to load governed landing evidence: ${result.error.message}`)
  }

  const datasetCatalog = (catalogResult.data ?? []) as DatasetCatalog[]
  const stewardshipCoverage = (stewardshipResult.data ?? []) as StewardshipCoverage[]
  const classifications = (classificationsResult.data ?? []) as Classification[]
  const glossaryMappings = (glossaryResult.data ?? []) as GlossaryMapping[]
  const cdeMappings = (cdeResult.data ?? []) as CdeMapping[]
  const certificationRequests = (certificationResult.data ?? []) as CertificationRequest[]
  const waivers = (waiverResult.data ?? []) as Waiver[]
  const controlEvaluations = (controlResult.data ?? []) as ControlEvaluation[]
  const issues = (issuesResult.data ?? []) as Issue[]
  const contextAssets = (contextAssetsResult.data ?? []) as ContextAsset[]
  const contextLinks = (contextLinksResult.data ?? []) as ContextLink[]

  const versionById = new Map(versions.map(version => [version.id, version]))
  const datasetById = new Map(datasets.map(dataset => [dataset.id, dataset]))
  const runById = new Map(runs.map(run => [run.id, run]))
  const latestRunByDataset = new Map<string, Run>()
  for (const run of runs) {
    const version = versionById.get(run.dataset_version_id)
    if (version && !latestRunByDataset.has(version.dataset_id)) latestRunByDataset.set(version.dataset_id, run)
  }

  const scoresByRun = new Map<string, Score[]>()
  for (const score of scores) {
    const existing = scoresByRun.get(score.profile_run_id) ?? []
    existing.push(score)
    scoresByRun.set(score.profile_run_id, existing)
  }
  const latestScoreByRun = new Map<string, Score>()
  for (const [runId, runScores] of scoresByRun) latestScoreByRun.set(runId, [...runScores].sort((a, b) => b.created_at.localeCompare(a.created_at))[0])

  const findingsByRun = new Map<string, Finding[]>()
  for (const finding of findings) {
    const existing = findingsByRun.get(finding.profile_run_id) ?? []
    existing.push(finding)
    findingsByRun.set(finding.profile_run_id, existing)
  }

  const catalogByDataset = new Map(datasetCatalog.map(item => [item.dataset_id, item]))
  const stewardshipByDataset = new Map(stewardshipCoverage.map(item => [item.dataset_id, item]))
  const glossaryByDataset = new Map<string, number>()
  for (const item of glossaryMappings) if (item.dataset_id && isApprovedGlossary(item)) glossaryByDataset.set(item.dataset_id, (glossaryByDataset.get(item.dataset_id) ?? 0) + 1)
  const classificationsByDataset = new Map<string, number>()
  for (const item of classifications) if (item.dataset_id && isApprovedClassification(item)) classificationsByDataset.set(item.dataset_id, (classificationsByDataset.get(item.dataset_id) ?? 0) + 1)
  const cdeByDataset = new Map<string, number>()
  for (const item of cdeMappings) cdeByDataset.set(item.dataset_id, (cdeByDataset.get(item.dataset_id) ?? 0) + 1)

  const datasetSummaries: LandingDataset[] = datasets.map(dataset => {
    const latestRun = latestRunByDataset.get(dataset.id)
    const latestScore = latestRun ? latestScoreByRun.get(latestRun.id) : undefined
    const latestFindings = latestRun ? findingsByRun.get(latestRun.id) ?? [] : []
    const governance = catalogByDataset.get(dataset.id)
    const stewardship = stewardshipByDataset.get(dataset.id)
    return {
      id: dataset.id,
      projectId: dataset.project_id,
      name: dataset.name,
      domain: dataset.business_domain || 'Unassigned',
      confidence: latestScore?.overall_score ?? null,
      completeness: latestScore?.completeness_score ?? null,
      uniqueness: latestScore?.uniqueness_score ?? null,
      validity: latestScore?.validity_score ?? null,
      accuracy: latestScore?.accuracy_score ?? null,
      certificationStatus: governance?.certification_status || 'UNCERTIFIED',
      criticality: governance?.criticality || 'UNSET',
      hasOwner: Boolean(stewardship && upper(stewardship.coverage_status) === 'ACCOUNTABLE'),
      findingCount: latestFindings.length,
      highFindingCount: latestFindings.filter(item => isHigh(item.severity)).length,
      latestRunId: latestRun?.id ?? null,
      approvedGlossaryMappings: glossaryByDataset.get(dataset.id) ?? 0,
      approvedClassifications: classificationsByDataset.get(dataset.id) ?? 0,
      cdeMappings: cdeByDataset.get(dataset.id) ?? 0,
    }
  })

  const requestedDataset = requested.datasetId && datasetSummaries.some(item => item.id === requested.datasetId) ? requested.datasetId : ''
  const requestedDomain = requested.domain && requested.domain !== 'overall' && datasetSummaries.some(item => item.domain === requested.domain) ? requested.domain : 'overall'

  const completedLatestRuns = [...latestRunByDataset.values()].filter(run => upper(run.status) === 'COMPLETED')
  const scoredLatestRuns = completedLatestRuns.filter(run => typeof latestScoreByRun.get(run.id)?.overall_score === 'number')
  const confidence = scoredLatestRuns.length ? scoredLatestRuns.reduce((sum, run) => sum + Number(latestScoreByRun.get(run.id)?.overall_score ?? 0), 0) / scoredLatestRuns.length : null

  const domainNames = [...new Set(datasetSummaries.map(item => item.domain))]
  const domains: LandingDomain[] = domainNames.map(name => {
    const members = datasetSummaries.filter(item => item.domain === name)
    const scored = members.filter(item => typeof item.confidence === 'number')
    return {
      name,
      assets: members.length,
      confidence: scored.length ? scored.reduce((sum, item) => sum + Number(item.confidence), 0) / scored.length : null,
      highFindings: members.reduce((sum, item) => sum + item.highFindingCount, 0),
    }
  }).sort((a, b) => b.assets - a.assets || a.name.localeCompare(b.name))

  const cutoff = Date.now() - rangeDays[selectedRange] * 86_400_000
  const trendBuckets = new Map<string, number[]>()
  for (const score of scores) {
    if (new Date(score.created_at).getTime() < cutoff) continue
    const run = runById.get(score.profile_run_id)
    const version = run ? versionById.get(run.dataset_version_id) : undefined
    const dataset = version ? datasetById.get(version.dataset_id) : undefined
    if (!dataset) continue
    if (requestedDataset && dataset.id !== requestedDataset) continue
    if (!requestedDataset && requestedDomain !== 'overall' && (dataset.business_domain || 'Unassigned') !== requestedDomain) continue
    const value = scoreValue(score, selectedDimension)
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const date = new Date(score.created_at)
    const bucket = selectedRange === '30d' ? date.toISOString().slice(0, 10) : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    const existing = trendBuckets.get(bucket) ?? []
    existing.push(value)
    trendBuckets.set(bucket, existing)
  }
  const trend: LandingTrendPoint[] = [...trendBuckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([label, values]) => ({
    label: selectedRange === '30d' ? new Date(`${label}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : new Date(`${label}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }),
    value: values.reduce((sum, value) => sum + value, 0) / values.length,
  }))

  const currentMaterial = datasetSummaries.flatMap(dataset => {
    const runId = dataset.latestRunId
    if (!runId) return []
    return (findingsByRun.get(runId) ?? []).filter(item => isMaterial(item.severity)).map(item => ({ ...item, dataset }))
  })
  const currentHigh = currentMaterial.filter(item => isHigh(item.severity))
  const topFindings = [...currentMaterial].sort((a, b) => rank(b.severity) - rank(a.severity) || b.created_at.localeCompare(a.created_at)).slice(0, 5).map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    severity: item.severity,
    href: `/profiling/explorer?runId=${encodeURIComponent(item.profile_run_id)}&findingId=${encodeURIComponent(item.id)}`,
  }))

  const assetById = new Map(contextAssets.map(asset => [asset.id, asset]))
  const impactByType = new Map<string, Set<string>>()
  for (const link of contextLinks) {
    const asset = assetById.get(link.business_context_asset_id)
    if (!asset) continue
    const existing = impactByType.get(asset.asset_type) ?? new Set<string>()
    existing.add(asset.id)
    impactByType.set(asset.asset_type, existing)
  }
  const businessImpact: LandingImpact[] = [...impactByType.entries()].map(([type, ids]) => {
    const normalized = upper(type)
    const href = normalized.includes('REPORT') || normalized.includes('KPI') || normalized.includes('DECISION') ? '/reports' : normalized.includes('PROCESS') || normalized.includes('DEPEND') ? '/lineage' : '/catalog'
    return { label: readableAssetType(type), count: ids.size, href }
  }).sort((a, b) => b.count - a.count)

  const activity: LandingActivity[] = []
  for (const item of currentMaterial.slice(0, 4)) activity.push({ id: `finding-${item.id}`, label: item.title, detail: `${item.dataset.name} · ${item.severity}`, when: relativeDate(item.created_at), href: `/profiling/explorer?runId=${encodeURIComponent(item.profile_run_id)}&findingId=${encodeURIComponent(item.id)}`, tone: isHigh(item.severity) ? 'warn' : 'info' })
  for (const run of runs.filter(item => upper(item.status) === 'COMPLETED').slice(0, 4)) {
    const version = versionById.get(run.dataset_version_id)
    const dataset = version ? datasetById.get(version.dataset_id) : undefined
    if (dataset) activity.push({ id: `run-${run.id}`, label: 'Profiling evidence completed', detail: dataset.name, when: relativeDate(run.completed_at || run.started_at), href: `/profiling/explorer?runId=${encodeURIComponent(run.id)}`, tone: 'good' })
  }
  activity.sort((a, b) => a.when.localeCompare(b.when))

  const assignedDomains = datasets.filter(dataset => Boolean(dataset.business_domain)).length
  const ownedDatasets = datasetSummaries.filter(dataset => dataset.hasOwner).length
  const data: RoleLandingData = {
    confidence,
    governedAssets: datasets.length,
    activeSources: sources.filter(source => upper(source.status) === 'ACTIVE').length,
    materialFindings: currentMaterial.length,
    highFindings: currentHigh.length,
    failedControls: qualityRuns.filter(run => upper(run.status) === 'FAILED' || run.passed === false).length,
    openAlerts: alerts.filter(alert => upper(alert.status) !== 'RESOLVED').length,
    coverage: datasets.length ? Math.round((completedLatestRuns.length / datasets.length) * 100) : 0,
    affectedDomains: domains.filter(domain => domain.name !== 'Unassigned').length,
    certifiedDatasets: datasetSummaries.filter(dataset => upper(dataset.certificationStatus) === 'CERTIFIED').length,
    pendingCertifications: certificationRequests.filter(request => isPending(request.status)).length,
    pendingWaivers: waivers.filter(waiver => isPending(waiver.status)).length,
    unresolvedIssues: issues.filter(issue => isUnresolved(issue.status)).length,
    ownershipCoverage: datasets.length ? Math.round((ownedDatasets / datasets.length) * 100) : 0,
    domainAssignedCoverage: datasets.length ? Math.round((assignedDomains / datasets.length) * 100) : 0,
    approvedGlossaryMappings: glossaryMappings.filter(isApprovedGlossary).length,
    approvedClassifications: classifications.filter(isApprovedClassification).length,
    cdeMappings: cdeMappings.length,
    failedControlEvaluations: controlEvaluations.filter(item => isFailedControl(item.result)).length,
    topFindings,
    domains,
    datasets: datasetSummaries,
    trend,
    activity: activity.slice(0, 8),
    businessImpact,
    defaultProjectId: datasetSummaries[0]?.projectId ?? projectIds[0] ?? null,
    selectedDomain: requestedDomain,
    selectedDatasetId: requestedDataset,
    selectedDimension,
    selectedRange,
  }

  const email = user.email ?? ''
  const userLabel = email ? email.split('@')[0].split(/[._-]/).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ') : 'there'
  const canAdmin = Boolean(access.organizationRole && /^(OWNER|ADMIN)$/i.test(access.organizationRole))

  return <RoleLandingPage persona={personas[slug]} data={data} userLabel={userLabel} canAdmin={canAdmin} />
}
