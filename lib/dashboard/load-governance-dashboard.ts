import { createClient } from '@/lib/supabase/server'
import {
  isDashboardPersona,
  resolveDashboardPersona,
  type DashboardPersona,
} from '@/lib/dashboard/personas'

type DatasetRow = {
  id: string
  project_id: string
  data_source_id: string | null
  name: string
  status: string
  business_domain: string | null
  owner_user_id: string | null
}
type VersionRow = { id: string; dataset_id: string; status: string; version_number: number }
type RunRow = { id: string; dataset_version_id: string; status: string; started_at: string | null; row_count: number | null }
type ScoreRow = { profile_run_id: string; overall_score: number | null; completeness_score: number | null; validity_score: number | null; uniqueness_score: number | null; accuracy_score: number | null }
type FindingRow = { id: string; profile_run_id: string; severity: string; finding_type: string; title: string; description: string; created_at: string }
type SourceRow = { id: string; project_id: string; name: string; status: string }
type QualityRunRow = { id: string; status: string; passed: boolean | null; started_at: string | null }
type AlertRow = { id: string; category: string; severity: string; status: string; title: string; last_observed_at: string | null }
type AgentRunRow = { id: string; status: string; error_code: string | null; created_at: string }
type IssueRow = { id: string; dataset_id: string | null; title: string; description: string; severity: string; status: string; owner_user_id: string | null; due_at: string | null; created_at: string; updated_at: string }
type AssignmentRow = { dataset_id: string | null; user_id: string; role: string; accountability: string | null; active: boolean; status: string | null }
type CertificationRow = { id: string; dataset_id: string | null; requested_by: string; assigned_to: string | null; status: string; requested_at: string }
type ClassificationRow = { id: string; dataset_id: string | null; label_id: string; status: string; confidence: number | null; approved_by: string | null; reviewed_by: string | null; created_at: string }
type ClassificationLabelRow = { id: string; code: string; name: string }
type CdeRow = { id: string; name: string; domain: string | null; criticality: string; status: string }
type CdeMappingRow = { id: string; cde_id: string; dataset_id: string; column_name: string | null; confidence: number | null; status: string }
type ControlDefinitionRow = { id: string; name: string; severity: string; lifecycle_status: string; review_status: string }
type ControlEvaluationRow = { id: string; control_id: string; result: string; score: number | null; effective_result: string | null; evaluated_at: string }
type ControlWaiverRow = { id: string; control_id: string; status: string; expires_at: string | null; requested_at: string }

export type DashboardDataset = {
  id: string
  name: string
  businessDomain: string
  status: string
  ownerUserId: string | null
  confidence: number | null
  openIssueCount: number
  highIssueCount: number
  isCriticalData: boolean
}

export type DashboardIssue = {
  id: string
  datasetId: string | null
  datasetName: string | null
  title: string
  description: string
  severity: string
  status: string
  dueAt: string | null
  ownerUserId: string | null
  overdue: boolean
}

export type DashboardDomain = {
  name: string
  datasetCount: number
  confidence: number | null
  openIssueCount: number
  highIssueCount: number
}

export type GovernanceDashboardData = {
  persona: DashboardPersona
  canPreviewPersonas: boolean
  roleKeys: string[]
  scope: {
    datasetIds: string[]
    hasAssignments: boolean
    label: string
  }
  metrics: {
    overallConfidence: number | null
    scopedConfidence: number | null
    criticalDataConfidence: number | null
    governanceCoverage: number
    ownershipCoverage: number
    domainCoverage: number
    classificationCoverage: number
    totalDatasets: number
    scopedDatasets: number
    trustedDatasets: number
    attentionDatasets: number
    openIssues: number
    highOpenIssues: number
    overdueIssues: number
    myOpenIssues: number
    pendingApprovals: number
    materialFindings: number
    failedQualityControls: number
    totalSources: number
    activeSources: number
    openAlerts: number
    schemaDriftAlerts: number
    failedJobs: number
    criticalDataElements: number
    mappedCriticalDataElements: number
    activeControls: number
    failedControls: number
    activeWaivers: number
    sensitiveClassifications: number
    pendingClassifications: number
  }
  datasets: DashboardDataset[]
  scopedDatasets: DashboardDataset[]
  topIssues: DashboardIssue[]
  domains: DashboardDomain[]
  recentFindings: Array<{ id: string; title: string; description: string; severity: string; findingType: string }>
  sources: Array<{ id: string; name: string; status: string }>
}

const OPEN_STATES = new Set(['OPEN', 'NEW', 'IN_PROGRESS', 'PENDING', 'ESCALATED', 'REOPENED'])
const FINAL_APPROVAL_STATES = new Set(['APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'RESOLVED'])
const SENSITIVE_CODES = new Set(['PII', 'PHI', 'PCI', 'SPI', 'SENSITIVE', 'CONFIDENTIAL', 'RESTRICTED'])

function severityRank(value: string) {
  const severity = String(value).toUpperCase()
  if (severity === 'CRITICAL') return 4
  if (severity === 'HIGH') return 3
  if (severity === 'MEDIUM') return 2
  return 1
}

function isOpenStatus(status: string) {
  const normalized = String(status).toUpperCase()
  if (OPEN_STATES.has(normalized)) return true
  return !['RESOLVED', 'CLOSED', 'DONE', 'CANCELLED'].includes(normalized)
}

function average(values: Array<number | null | undefined>) {
  const available = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function assertResults(results: Array<{ error: { message: string } | null }>) {
  const failed = results.find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)
}

export async function loadGovernanceDashboard(input: {
  userId: string
  personaOverride?: string | null
}): Promise<GovernanceDashboardData> {
  const supabase = await createClient()
  const now = new Date()

  const [membershipsResult, roleBindingsResult] = await Promise.all([
    supabase.schema('app').from('organization_members').select('organization_id,role').eq('user_id', input.userId),
    supabase.schema('governance').from('project_role_bindings').select('project_id,role_key,active,expires_at').eq('user_id', input.userId),
  ])
  assertResults([membershipsResult, roleBindingsResult])

  const organizationRoles = (membershipsResult.data ?? []).map((row) => String(row.role))
  const activeBindings = (roleBindingsResult.data ?? []).filter((row) => {
    if (!row.active) return false
    if (!row.expires_at) return true
    return new Date(row.expires_at).getTime() > now.getTime()
  })
  const roleKeys = activeBindings.map((row) => String(row.role_key).toUpperCase())
  const resolvedPersona = resolveDashboardPersona({ organizationRoles, projectRoleKeys: roleKeys })
  const canPreviewPersonas = organizationRoles.some((role) => ['OWNER', 'ADMIN'].includes(String(role).toUpperCase()))
  const persona = canPreviewPersonas && isDashboardPersona(input.personaOverride)
    ? input.personaOverride
    : resolvedPersona

  const [
    datasetsResult,
    versionsResult,
    runsResult,
    scoresResult,
    findingsResult,
    sourcesResult,
    qualityRunsResult,
    alertsResult,
    agentRunsResult,
    issuesResult,
    assignmentsResult,
    certificationsResult,
    classificationsResult,
    labelsResult,
    cdesResult,
    cdeMappingsResult,
    controlsResult,
    controlEvaluationsResult,
    waiversResult,
  ] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,data_source_id,name,status,business_domain,owner_user_id').order('created_at', { ascending: false }),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,status,version_number').order('version_number', { ascending: false }).limit(1000),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,started_at,row_count').order('started_at', { ascending: false }).limit(1000),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score,completeness_score,validity_score,uniqueness_score,accuracy_score').order('created_at', { ascending: false }).limit(1000),
    supabase.schema('profiling').from('profile_findings').select('id,profile_run_id,severity,finding_type,title,description,created_at').order('created_at', { ascending: false }).limit(500),
    supabase.schema('catalog').from('data_sources').select('id,project_id,name,status').order('created_at', { ascending: false }),
    supabase.schema('profiling').from('quality_rule_runs').select('id,status,passed,started_at').order('started_at', { ascending: false }).limit(1000),
    supabase.schema('profiling').from('observability_alerts').select('id,category,severity,status,title,last_observed_at').order('last_observed_at', { ascending: false }).limit(500),
    supabase.schema('agent').from('agent_runs').select('id,status,error_code,created_at').order('created_at', { ascending: false }).limit(500),
    supabase.schema('governance').from('issues').select('id,dataset_id,title,description,severity,status,owner_user_id,due_at,created_at,updated_at').order('created_at', { ascending: false }).limit(500),
    supabase.schema('governance').from('stewardship_assignments').select('dataset_id,user_id,role,accountability,active,status').eq('user_id', input.userId).limit(500),
    supabase.schema('governance').from('certification_requests').select('id,dataset_id,requested_by,assigned_to,status,requested_at').order('requested_at', { ascending: false }).limit(500),
    supabase.schema('governance').from('dataset_classifications').select('id,dataset_id,label_id,status,confidence,approved_by,reviewed_by,created_at').order('created_at', { ascending: false }).limit(1000),
    supabase.schema('governance').from('classification_labels').select('id,code,name').eq('enabled', true),
    supabase.schema('governance').from('critical_data_elements').select('id,name,domain,criticality,status').limit(500),
    supabase.schema('governance').from('cde_mappings').select('id,cde_id,dataset_id,column_name,confidence,status').limit(1000),
    supabase.schema('governance').from('control_definitions').select('id,name,severity,lifecycle_status,review_status').limit(500),
    supabase.schema('governance').from('control_effective_evaluations').select('id,control_id,result,score,effective_result,evaluated_at').order('evaluated_at', { ascending: false }).limit(1000),
    supabase.schema('governance').from('control_waivers').select('id,control_id,status,expires_at,requested_at').order('requested_at', { ascending: false }).limit(500),
  ])

  assertResults([
    datasetsResult, versionsResult, runsResult, scoresResult, findingsResult, sourcesResult,
    qualityRunsResult, alertsResult, agentRunsResult, issuesResult, assignmentsResult,
    certificationsResult, classificationsResult, labelsResult, cdesResult, cdeMappingsResult,
    controlsResult, controlEvaluationsResult, waiversResult,
  ])

  const datasets = (datasetsResult.data ?? []) as DatasetRow[]
  const versions = (versionsResult.data ?? []) as VersionRow[]
  const runs = (runsResult.data ?? []) as RunRow[]
  const scores = (scoresResult.data ?? []) as ScoreRow[]
  const findings = (findingsResult.data ?? []) as FindingRow[]
  const sources = (sourcesResult.data ?? []) as SourceRow[]
  const qualityRuns = (qualityRunsResult.data ?? []) as QualityRunRow[]
  const alerts = (alertsResult.data ?? []) as AlertRow[]
  const agentRuns = (agentRunsResult.data ?? []) as AgentRunRow[]
  const issues = (issuesResult.data ?? []) as IssueRow[]
  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[]
  const certifications = (certificationsResult.data ?? []) as CertificationRow[]
  const classifications = (classificationsResult.data ?? []) as ClassificationRow[]
  const labels = (labelsResult.data ?? []) as ClassificationLabelRow[]
  const cdes = (cdesResult.data ?? []) as CdeRow[]
  const cdeMappings = (cdeMappingsResult.data ?? []) as CdeMappingRow[]
  const controls = (controlsResult.data ?? []) as ControlDefinitionRow[]
  const controlEvaluations = (controlEvaluationsResult.data ?? []) as ControlEvaluationRow[]
  const waivers = (waiversResult.data ?? []) as ControlWaiverRow[]

  const versionsById = new Map(versions.map((row) => [row.id, row]))
  const scoresByRunId = new Map(scores.map((row) => [row.profile_run_id, row]))
  const latestRunByDataset = new Map<string, RunRow>()
  for (const run of runs) {
    const version = versionsById.get(run.dataset_version_id)
    if (version && !latestRunByDataset.has(version.dataset_id)) latestRunByDataset.set(version.dataset_id, run)
  }

  const openIssues = issues.filter((issue) => isOpenStatus(issue.status))
  const issuesByDataset = new Map<string, IssueRow[]>()
  for (const issue of openIssues) {
    if (!issue.dataset_id) continue
    const current = issuesByDataset.get(issue.dataset_id) ?? []
    current.push(issue)
    issuesByDataset.set(issue.dataset_id, current)
  }

  const criticalDatasetIds = new Set(cdeMappings.filter((mapping) => !['REJECTED', 'REVOKED'].includes(String(mapping.status).toUpperCase())).map((mapping) => mapping.dataset_id))

  const dashboardDatasets: DashboardDataset[] = datasets.map((dataset) => {
    const latestRun = latestRunByDataset.get(dataset.id)
    const score = latestRun ? scoresByRunId.get(latestRun.id)?.overall_score ?? null : null
    const datasetIssues = issuesByDataset.get(dataset.id) ?? []
    return {
      id: dataset.id,
      name: dataset.name,
      businessDomain: dataset.business_domain || 'Unassigned',
      status: String(dataset.status),
      ownerUserId: dataset.owner_user_id,
      confidence: typeof score === 'number' ? score : null,
      openIssueCount: datasetIssues.length,
      highIssueCount: datasetIssues.filter((issue) => severityRank(issue.severity) >= 3).length,
      isCriticalData: criticalDatasetIds.has(dataset.id),
    }
  })

  const ownedDatasetIds = new Set(datasets.filter((dataset) => dataset.owner_user_id === input.userId).map((dataset) => dataset.id))
  const assignedDatasetIds = new Set(
    assignments
      .filter((assignment) => assignment.active && assignment.dataset_id && !['REVOKED', 'INACTIVE'].includes(String(assignment.status ?? '').toUpperCase()))
      .map((assignment) => String(assignment.dataset_id)),
  )
  const accountableDatasetIds = new Set([...ownedDatasetIds, ...assignedDatasetIds])
  const personaUsesPortfolio = ['data_owner', 'data_steward', 'data_product_owner'].includes(persona)
  const scopedDatasetIds = personaUsesPortfolio ? accountableDatasetIds : new Set(datasets.map((dataset) => dataset.id))
  const scopedDatasets = dashboardDatasets.filter((dataset) => scopedDatasetIds.has(dataset.id))
  const hasAssignments = personaUsesPortfolio ? scopedDatasetIds.size > 0 : true

  const relevantIssues = personaUsesPortfolio
    ? openIssues.filter((issue) => Boolean(issue.dataset_id && scopedDatasetIds.has(issue.dataset_id)))
    : openIssues

  const latestConfidence = dashboardDatasets.map((dataset) => dataset.confidence)
  const scopedConfidence = scopedDatasets.map((dataset) => dataset.confidence)
  const criticalConfidence = dashboardDatasets.filter((dataset) => dataset.isCriticalData).map((dataset) => dataset.confidence)
  const readyDatasets = datasets.filter((dataset) => latestRunByDataset.get(dataset.id)?.status === 'COMPLETED').length
  const trustedDatasets = scopedDatasets.filter((dataset) => typeof dataset.confidence === 'number' && dataset.confidence >= 0.9).length
  const attentionDatasets = scopedDatasets.filter((dataset) => typeof dataset.confidence === 'number' && dataset.confidence < 0.75).length

  const classificationLabelById = new Map(labels.map((label) => [label.id, label]))
  const classifiedDatasetIds = new Set(classifications.map((classification) => classification.dataset_id).filter((id): id is string => Boolean(id)))
  const sensitiveClassifications = classifications.filter((classification) => {
    const label = classificationLabelById.get(classification.label_id)
    return Boolean(label && SENSITIVE_CODES.has(String(label.code).toUpperCase()))
  }).length
  const pendingClassifications = classifications.filter((classification) => !FINAL_APPROVAL_STATES.has(String(classification.status).toUpperCase())).length

  const pendingApprovals = certifications.filter((request) => {
    if (request.assigned_to && request.assigned_to !== input.userId) return false
    return !FINAL_APPROVAL_STATES.has(String(request.status).toUpperCase())
  }).length

  const activeControls = controls.filter((control) => !['RETIRED', 'INACTIVE', 'DRAFT'].includes(String(control.lifecycle_status).toUpperCase())).length
  const latestControlEvaluation = new Map<string, ControlEvaluationRow>()
  for (const evaluation of controlEvaluations) {
    if (!latestControlEvaluation.has(evaluation.control_id)) latestControlEvaluation.set(evaluation.control_id, evaluation)
  }
  const failedControls = [...latestControlEvaluation.values()].filter((evaluation) => {
    const result = String(evaluation.effective_result ?? evaluation.result).toUpperCase()
    return ['FAIL', 'FAILED', 'NON_COMPLIANT', 'BREACH'].includes(result)
  }).length
  const activeWaivers = waivers.filter((waiver) => {
    const status = String(waiver.status).toUpperCase()
    if (!['ACTIVE', 'APPROVED'].includes(status)) return false
    return !waiver.expires_at || new Date(waiver.expires_at).getTime() > now.getTime()
  }).length

  const domainAccumulator = new Map<string, { datasets: DashboardDataset[]; issues: IssueRow[] }>()
  for (const dataset of dashboardDatasets) {
    const domain = dataset.businessDomain
    const entry = domainAccumulator.get(domain) ?? { datasets: [], issues: [] }
    entry.datasets.push(dataset)
    entry.issues.push(...(issuesByDataset.get(dataset.id) ?? []))
    domainAccumulator.set(domain, entry)
  }
  const domains: DashboardDomain[] = [...domainAccumulator.entries()]
    .map(([name, entry]) => ({
      name,
      datasetCount: entry.datasets.length,
      confidence: average(entry.datasets.map((dataset) => dataset.confidence)),
      openIssueCount: entry.issues.length,
      highIssueCount: entry.issues.filter((issue) => severityRank(issue.severity) >= 3).length,
    }))
    .sort((a, b) => {
      if (a.highIssueCount !== b.highIssueCount) return b.highIssueCount - a.highIssueCount
      if (a.confidence === null) return 1
      if (b.confidence === null) return -1
      return a.confidence - b.confidence
    })

  const datasetNameById = new Map(datasets.map((dataset) => [dataset.id, dataset.name]))
  const topIssues: DashboardIssue[] = [...relevantIssues]
    .sort((a, b) => {
      const severityDelta = severityRank(b.severity) - severityRank(a.severity)
      if (severityDelta) return severityDelta
      const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER
      const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER
      return aDue - bDue
    })
    .slice(0, 8)
    .map((issue) => ({
      id: issue.id,
      datasetId: issue.dataset_id,
      datasetName: issue.dataset_id ? datasetNameById.get(issue.dataset_id) ?? null : null,
      title: issue.title,
      description: issue.description,
      severity: issue.severity,
      status: issue.status,
      dueAt: issue.due_at,
      ownerUserId: issue.owner_user_id,
      overdue: Boolean(issue.due_at && new Date(issue.due_at).getTime() < now.getTime()),
    }))

  const materialFindings = findings.filter((finding) => severityRank(finding.severity) >= 2)
  const openAlerts = alerts.filter((alert) => !['RESOLVED', 'CLOSED'].includes(String(alert.status).toUpperCase()))
  const highOpenIssues = relevantIssues.filter((issue) => severityRank(issue.severity) >= 3)
  const overdueIssues = relevantIssues.filter((issue) => Boolean(issue.due_at && new Date(issue.due_at).getTime() < now.getTime()))
  const myOpenIssues = openIssues.filter((issue) => issue.owner_user_id === input.userId).length
  const activeCdes = cdes.filter((cde) => !['RETIRED', 'INACTIVE', 'REJECTED'].includes(String(cde.status).toUpperCase()))
  const mappedCdeIds = new Set(cdeMappings.filter((mapping) => !['REJECTED', 'REVOKED'].includes(String(mapping.status).toUpperCase())).map((mapping) => mapping.cde_id))

  return {
    persona,
    canPreviewPersonas,
    roleKeys,
    scope: {
      datasetIds: [...scopedDatasetIds],
      hasAssignments,
      label: personaUsesPortfolio ? 'My accountable data' : 'Enterprise data',
    },
    metrics: {
      overallConfidence: average(latestConfidence),
      scopedConfidence: average(scopedConfidence),
      criticalDataConfidence: average(criticalConfidence),
      governanceCoverage: percentage(readyDatasets, datasets.length),
      ownershipCoverage: percentage(datasets.filter((dataset) => Boolean(dataset.owner_user_id)).length, datasets.length),
      domainCoverage: percentage(datasets.filter((dataset) => Boolean(dataset.business_domain)).length, datasets.length),
      classificationCoverage: percentage(classifiedDatasetIds.size, datasets.length),
      totalDatasets: datasets.length,
      scopedDatasets: scopedDatasets.length,
      trustedDatasets,
      attentionDatasets,
      openIssues: relevantIssues.length,
      highOpenIssues: highOpenIssues.length,
      overdueIssues: overdueIssues.length,
      myOpenIssues,
      pendingApprovals,
      materialFindings: materialFindings.length,
      failedQualityControls: qualityRuns.filter((run) => String(run.status).toUpperCase() === 'FAILED' || run.passed === false).length,
      totalSources: sources.length,
      activeSources: sources.filter((source) => String(source.status).toUpperCase() === 'ACTIVE').length,
      openAlerts: openAlerts.length,
      schemaDriftAlerts: openAlerts.filter((alert) => String(alert.category).toUpperCase() === 'SCHEMA_DRIFT').length,
      failedJobs: agentRuns.filter((run) => String(run.status).toUpperCase() === 'FAILED').length,
      criticalDataElements: activeCdes.length,
      mappedCriticalDataElements: mappedCdeIds.size,
      activeControls,
      failedControls,
      activeWaivers,
      sensitiveClassifications,
      pendingClassifications,
    },
    datasets: dashboardDatasets,
    scopedDatasets,
    topIssues,
    domains,
    recentFindings: materialFindings.slice(0, 8).map((finding) => ({
      id: finding.id,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      findingType: finding.finding_type,
    })),
    sources: sources.map((source) => ({ id: source.id, name: source.name, status: source.status })),
  }
}
