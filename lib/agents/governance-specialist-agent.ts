import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import {
  GOVERNANCE_READ_AGENT_KEYS,
  type GovernanceReadAgentKey,
} from '@/lib/agents/governance-read-agent'

const allowedKeys = new Set<string>(GOVERNANCE_READ_AGENT_KEYS)

type KnowledgeMatch = {
  object_type: string
  object_key: string
  title: string
  relevance: number | string | null
  metadata: Record<string, unknown> | null
}

type GraphAnchor = { type: string; key: string } | null

type SpecialistContext = {
  datasets: Array<Record<string, any>>
  versions: Array<Record<string, any>>
  profileRuns: Array<Record<string, any>>
  scorecards: Array<Record<string, any>>
  cdes: Array<Record<string, any>>
  cdeMappings: Array<Record<string, any>>
  accountability: Array<Record<string, any>>
  contracts: Array<Record<string, any>>
  certifications: Array<Record<string, any>>
  issues: Array<Record<string, any>>
  incidents: Array<Record<string, any>>
  remediationKnowledge: Array<Record<string, any>>
  alerts: Array<Record<string, any>>
  ruleRuns: Array<Record<string, any>>
  comparisons: Array<Record<string, any>>
  anomalies: Array<Record<string, any>>
  knowledgeDocuments: Array<Record<string, any>>
  glossaryTerms: Array<Record<string, any>>
  regulatoryApplicability: Array<Record<string, any>>
  lineageAssets: Array<Record<string, any>>
  lineageTransformations: Array<Record<string, any>>
  lineageColumnMappings: Array<Record<string, any>>
  lineageTransformationEdges: Array<Record<string, any>>
  lineageEdgeCount: number
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isOpen(status: unknown) {
  return !['RESOLVED', 'CLOSED', 'DONE', 'CANCELLED', 'REJECTED'].includes(String(status ?? '').toUpperCase())
}

function highSeverity(severity: unknown) {
  return ['HIGH', 'CRITICAL', 'SEV1', 'SEV2'].includes(String(severity ?? '').toUpperCase())
}

function defaultQuestion(agentKey: GovernanceReadAgentKey) {
  if (agentKey === 'steward_agent') return 'stewardship ownership glossary classification certification policy gaps'
  if (agentKey === 'governance_analyst_agent') return 'governance risk policy regulation critical data quality certification'
  if (agentKey === 'architect_agent') return 'architecture lineage contract schema critical data element standard'
  if (agentKey === 'investigator_agent') return 'incident failure anomaly remediation root cause quality'
  if (agentKey === 'executive_agent') return 'executive governance risk quality certification regulatory exposure'
  return 'support troubleshooting issue incident remediation procedure'
}

function anchorFor(match: KnowledgeMatch | undefined): GraphAnchor {
  if (!match) return null
  const type = String(match.object_type ?? '').toUpperCase()
  if (type === 'CRITICAL_DATA_ELEMENT') return { type: 'CDE', key: String(match.object_key) }
  if (type === 'KNOWLEDGE_REQUIREMENT') return { type: 'CONTROL', key: String(match.object_key) }
  if (type === 'GLOSSARY_TERM') return { type: 'BUSINESS_TERM', key: String(match.title) }
  if (type === 'KNOWLEDGE_DOCUMENT') {
    const documentType = String(match.metadata?.document_type ?? '').toUpperCase()
    if (documentType === 'REGULATION') return { type: 'REGULATION', key: String(match.object_key) }
    if (documentType === 'POLICY') return { type: 'POLICY', key: String(match.object_key) }
    if (documentType === 'STANDARD') return { type: 'STANDARD', key: String(match.object_key) }
    if (documentType === 'PROCEDURE') return { type: 'PROCEDURE', key: String(match.object_key) }
  }
  return null
}

async function loadKnowledge(admin: ReturnType<typeof createAdminClient>, projectId: string, query: string) {
  const { data, error } = await admin.schema('governance').rpc('search_governance_knowledge_lexical', {
    p_project_id: projectId,
    p_query: query,
    p_limit: 20,
  })
  if (error) throw new Error(`Unable to search governed knowledge: ${error.message}`)
  return (data ?? []) as KnowledgeMatch[]
}

async function loadGraph(admin: ReturnType<typeof createAdminClient>, projectId: string, match: KnowledgeMatch | undefined) {
  const anchor = anchorFor(match)
  if (!anchor) return { anchor: null, edges: [] as Array<Record<string, unknown>> }
  const { data, error } = await admin.schema('governance').rpc('traverse_knowledge_graph', {
    p_project_id: projectId,
    p_anchor_type: anchor.type,
    p_anchor_key: anchor.key,
    p_direction: 'BOTH',
    p_max_depth: 5,
    p_max_edges: 100,
  })
  if (error) throw new Error(`Unable to traverse governed knowledge graph: ${error.message}`)
  return { anchor, edges: (data ?? []) as Array<Record<string, unknown>> }
}

async function loadContext(admin: ReturnType<typeof createAdminClient>, projectId: string): Promise<SpecialistContext> {
  const [
    datasetsResult,
    scorecardsResult,
    cdesResult,
    cdeMappingsResult,
    accountabilityResult,
    contractsResult,
    certificationsResult,
    issuesResult,
    incidentsResult,
    remediationResult,
    alertsResult,
    knowledgeDocumentsResult,
    glossaryResult,
    regulatoryResult,
    lineageAssetsResult,
    lineageTransformationsResult,
    lineageColumnMappingsResult,
    lineageTransformationEdgesResult,
    lineageCountResult,
  ] = await Promise.all([
    admin.schema('catalog').from('datasets').select('id,name,business_domain,data_source_id,source_identifier,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(500),
    admin.schema('governance').from('project_scorecard_snapshots').select('id,overall_score,dimensions,evidence,calculated_at').eq('project_id', projectId).order('calculated_at', { ascending: false }).limit(12),
    admin.schema('governance').from('critical_data_elements').select('id,cde_key,name,domain,criticality,regulatory_relevance,owner_role,steward_role,status,metadata').eq('project_id', projectId).limit(500),
    admin.schema('governance').from('cde_mappings').select('id,cde_id,dataset_id,column_name,confidence,status,source,evidence').eq('project_id', projectId).limit(1000),
    admin.schema('governance').from('accountability_assignments').select('id,scope_type,scope_key,assignment_type,principal_type,principal_key,principal_name,accountability,status,metadata').eq('project_id', projectId).limit(1000),
    admin.schema('governance').from('data_contracts').select('id,dataset_id,name,status,current_version,created_at,updated_at').eq('project_id', projectId).limit(500),
    admin.schema('governance').from('dataset_certifications').select('id,dataset_id,certification_key,certification_status,certification_level,valid_from,valid_until,evidence,decision_summary,metadata').eq('project_id', projectId).limit(500),
    admin.schema('governance').from('issues').select('id,dataset_id,profile_run_id,title,description,severity,status,due_at,resolution_summary,resolution_evidence,updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(100),
    admin.schema('governance').from('observability_incidents').select('id,dataset_id,status,severity,title,summary,probable_root_causes,business_impact,risk,recommendations,confidence,evidence,updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(100),
    admin.schema('governance').from('remediation_knowledge').select('id,dataset_id,issue_id,knowledge_key,problem_type,symptom,remediation_action,outcome_status,before_evidence,after_evidence,reusable_guidance,confidence,updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(100),
    admin.schema('profiling').from('observability_alerts').select('id,dataset_id,dataset_version_id,profile_run_id,category,severity,title,description,status,evidence,first_observed_at,last_observed_at,resolved_at').eq('project_id', projectId).order('last_observed_at', { ascending: false }).limit(200),
    admin.schema('governance').from('knowledge_documents').select('id,document_key,document_type,title,summary,domain,jurisdiction,status,source_kind,source_url,metadata').eq('project_id', projectId).eq('status', 'ACTIVE').limit(200),
    admin.schema('governance').from('glossary_terms').select('id,term,definition,domain,synonyms,status').eq('project_id', projectId).limit(500),
    admin.schema('governance').from('regulatory_applicability').select('id,regulation_document_id,scope_type,scope_key,applicability_status,rationale,evidence,metadata').eq('project_id', projectId).limit(500),
    admin.schema('governance').from('lineage_assets').select('id,namespace,name,asset_type,dataset_id,metadata,last_seen_at').eq('project_id', projectId).order('last_seen_at', { ascending: false }).limit(1000),
    admin.schema('governance').from('lineage_transformations').select('id,integration_id,external_id,source_system,name,operation,logic_language,logic_hash,metadata,last_seen_at').eq('project_id', projectId).order('last_seen_at', { ascending: false }).limit(300),
    admin.schema('governance').from('lineage_column_mappings').select('id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression,metadata,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(500),
    admin.schema('governance').from('lineage_edges').select('id,source_type,source_id,target_type,target_id,relationship,transformation_id,metadata,created_at').eq('project_id', projectId).not('transformation_id', 'is', null).order('created_at', { ascending: false }).limit(300),
    admin.schema('governance').from('lineage_edges').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ])

  for (const [label, result] of [
    ['datasets', datasetsResult], ['scorecards', scorecardsResult], ['CDEs', cdesResult], ['CDE mappings', cdeMappingsResult],
    ['accountability', accountabilityResult], ['contracts', contractsResult], ['certifications', certificationsResult], ['issues', issuesResult],
    ['incidents', incidentsResult], ['remediation knowledge', remediationResult], ['alerts', alertsResult], ['knowledge documents', knowledgeDocumentsResult],
    ['glossary terms', glossaryResult], ['regulatory applicability', regulatoryResult], ['lineage assets', lineageAssetsResult],
    ['lineage transformations', lineageTransformationsResult], ['lineage column mappings', lineageColumnMappingsResult],
    ['lineage transformation edges', lineageTransformationEdgesResult], ['lineage edges', lineageCountResult],
  ] as const) {
    if (result.error) throw new Error(`Unable to load specialist agent ${label}: ${result.error.message}`)
  }

  const datasets = datasetsResult.data ?? []
  const datasetIds = datasets.map((row) => row.id)
  const versionsResult = datasetIds.length
    ? await admin.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status,created_at').in('dataset_id', datasetIds).order('created_at', { ascending: false }).limit(2000)
    : { data: [], error: null }
  if (versionsResult.error) throw new Error(`Unable to load specialist agent dataset versions: ${versionsResult.error.message}`)
  const versions = versionsResult.data ?? []
  const versionIds = versions.map((row) => row.id)

  const profileRunsResult = versionIds.length
    ? await admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,row_count,column_count,schema_hash,started_at,completed_at,error_code,error_message').in('dataset_version_id', versionIds).order('started_at', { ascending: false }).limit(300)
    : { data: [], error: null }
  if (profileRunsResult.error) throw new Error(`Unable to load specialist agent profile runs: ${profileRunsResult.error.message}`)
  const profileRuns = profileRunsResult.data ?? []
  const runIds = profileRuns.map((row) => row.id)

  const [ruleRunsResult, comparisonsResult, anomaliesResult] = await Promise.all([
    runIds.length
      ? admin.schema('profiling').from('quality_rule_runs').select('id,profile_run_id,status,passed,observed_value,threshold,evidence,error_message,quality_rule_definitions(rule_key,name,severity,column_name,metric_key,dimension,operator)').in('profile_run_id', runIds).order('started_at', { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? admin.schema('profiling').from('profile_comparisons').select('id,current_profile_run_id,baseline_profile_run_id,comparison_type,status,summary,metrics_changed,anomalies_found,changes,created_at').in('current_profile_run_id', runIds).order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? admin.schema('profiling').from('profile_anomalies').select('id,profile_run_id,profile_column_id,anomaly_type,severity,metric_key,current_value,baseline_value,absolute_change,relative_change,direction,title,description,evidence,detected_by,created_at').in('profile_run_id', runIds).order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (ruleRunsResult.error) throw new Error(`Unable to load specialist agent quality rule runs: ${ruleRunsResult.error.message}`)
  if (comparisonsResult.error) throw new Error(`Unable to load specialist agent profile comparisons: ${comparisonsResult.error.message}`)
  if (anomaliesResult.error) throw new Error(`Unable to load specialist agent anomalies: ${anomaliesResult.error.message}`)

  return {
    datasets,
    versions,
    profileRuns,
    scorecards: scorecardsResult.data ?? [],
    cdes: cdesResult.data ?? [],
    cdeMappings: cdeMappingsResult.data ?? [],
    accountability: accountabilityResult.data ?? [],
    contracts: contractsResult.data ?? [],
    certifications: certificationsResult.data ?? [],
    issues: issuesResult.data ?? [],
    incidents: incidentsResult.data ?? [],
    remediationKnowledge: remediationResult.data ?? [],
    alerts: alertsResult.data ?? [],
    ruleRuns: ruleRunsResult.data ?? [],
    comparisons: comparisonsResult.data ?? [],
    anomalies: anomaliesResult.data ?? [],
    knowledgeDocuments: knowledgeDocumentsResult.data ?? [],
    glossaryTerms: glossaryResult.data ?? [],
    regulatoryApplicability: regulatoryResult.data ?? [],
    lineageAssets: lineageAssetsResult.data ?? [],
    lineageTransformations: lineageTransformationsResult.data ?? [],
    lineageColumnMappings: lineageColumnMappingsResult.data ?? [],
    lineageTransformationEdges: lineageTransformationEdgesResult.data ?? [],
    lineageEdgeCount: Number(lineageCountResult.count ?? 0),
  }
}

function projectRisk(ctx: SpecialistContext) {
  const openAlerts = ctx.alerts.filter((row) => isOpen(row.status))
  const failedRules = ctx.ruleRuns.filter((row) => String(row.status).toUpperCase() === 'FAILED')
  const highItems = [
    ...ctx.issues.filter((row) => isOpen(row.status) && highSeverity(row.severity)),
    ...ctx.incidents.filter((row) => isOpen(row.status) && highSeverity(row.severity)),
    ...openAlerts.filter((row) => highSeverity(row.severity)),
  ]
  const freshnessBreaches = openAlerts.filter((row) => String(row.category).toUpperCase() === 'FRESHNESS').length
  const certified = new Set(ctx.certifications.filter((row) => ['CERTIFIED', 'PROVISIONAL'].includes(String(row.certification_status).toUpperCase())).map((row) => row.dataset_id))
  const uncertified = ctx.datasets.filter((row) => !certified.has(row.id)).length
  const latestScore = number(ctx.scorecards[0]?.overall_score)
  let score = 0
  score += Math.min(30, highItems.length * 8)
  score += Math.min(20, failedRules.length * 5)
  score += Math.min(20, freshnessBreaches * 10)
  score += Math.min(20, uncertified * 5)
  if (latestScore !== null && latestScore < 0.9) score += Math.min(20, Math.round((0.9 - latestScore) * 100))
  score = Math.min(100, score)
  return {
    score,
    band: score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW',
    contributors: {
      highOrCriticalOpenItems: highItems.length,
      failedQualityRules: failedRules.length,
      freshnessBreaches,
      uncertifiedDatasets: uncertified,
      latestGovernanceScore: latestScore,
    },
  }
}

function roleEvidence(agentKey: GovernanceReadAgentKey, ctx: SpecialistContext) {
  const openIssues = ctx.issues.filter((row) => isOpen(row.status))
  const openIncidents = ctx.incidents.filter((row) => isOpen(row.status))
  const openAlerts = ctx.alerts.filter((row) => isOpen(row.status))
  const failedRules = ctx.ruleRuns.filter((row) => String(row.status).toUpperCase() === 'FAILED')
  const failedProfiles = ctx.profileRuns.filter((row) => String(row.status).toUpperCase() === 'FAILED')
  const partialProfiles = ctx.profileRuns.filter((row) => String(row.status).toUpperCase() === 'PARTIAL')
  const activeAssignments = ctx.accountability.filter((row) => String(row.status).toUpperCase() === 'ACTIVE')
  const datasetStewards = new Set(activeAssignments.filter((row) => row.scope_type === 'DATASET' && row.assignment_type === 'DATA_STEWARD').map((row) => row.scope_key))
  const datasetOwners = new Set(activeAssignments.filter((row) => row.scope_type === 'DATASET' && ['BUSINESS_OWNER', 'TECHNICAL_OWNER'].includes(row.assignment_type)).map((row) => row.scope_key))
  const stewardGaps = ctx.datasets.filter((row) => !datasetStewards.has(row.id))
  const ownerGaps = ctx.datasets.filter((row) => !datasetOwners.has(row.id))
  const suggestedCdeMappings = ctx.cdeMappings.filter((row) => String(row.status).toUpperCase() === 'SUGGESTED')
  const activeCerts = new Set(ctx.certifications.filter((row) => ['CERTIFIED', 'PROVISIONAL'].includes(String(row.certification_status).toUpperCase())).map((row) => row.dataset_id))
  const certificationGaps = ctx.datasets.filter((row) => !activeCerts.has(row.id))
  const freshnessAlerts = openAlerts.filter((row) => String(row.category).toUpperCase() === 'FRESHNESS')
  const schemaAlerts = openAlerts.filter((row) => String(row.category).toUpperCase() === 'SCHEMA_DRIFT')
  const risk = projectRisk(ctx)

  if (agentKey === 'steward_agent') {
    return {
      focus: 'stewardship_and_governance_completeness',
      observations: [
        `${stewardGaps.length} dataset(s) lack an active dataset-level steward assignment.`,
        `${ownerGaps.length} dataset(s) lack an active dataset-level business or technical owner assignment.`,
        `${suggestedCdeMappings.length} CDE mapping suggestion(s) still require governance approval.`,
        `${certificationGaps.length} dataset(s) have no certified or provisional certification state.`,
        `${openIssues.length} governance issue(s) remain open.`,
      ],
      recommendations: [
        ...(stewardGaps.length ? [{ priority: 'HIGH', action: 'Assign data stewards to unassigned datasets.', evidence: stewardGaps.slice(0, 10).map((row) => row.id) }] : []),
        ...(suggestedCdeMappings.length ? [{ priority: 'HIGH', action: 'Review pending CDE-to-column mappings before treating them as authoritative.', evidence: suggestedCdeMappings.slice(0, 10).map((row) => row.id) }] : []),
        ...(certificationGaps.length ? [{ priority: 'MEDIUM', action: 'Assess certification readiness for uncovered datasets.', evidence: certificationGaps.slice(0, 10).map((row) => row.id) }] : []),
      ],
      evidence: { stewardshipGaps: stewardGaps.slice(0, 25), ownerGaps: ownerGaps.slice(0, 25), suggestedCdeMappings: suggestedCdeMappings.slice(0, 50), certifications: ctx.certifications.slice(0, 50), issues: openIssues.slice(0, 25) },
    }
  }

  if (agentKey === 'governance_analyst_agent') {
    return {
      focus: 'cross_domain_governance_risk',
      observations: [
        `Deterministic governance risk is ${risk.score}/100 (${risk.band}).`,
        `${failedRules.length} quality rule failure(s), ${freshnessAlerts.length} freshness breach(es), and ${openAlerts.length} open observability alert(s) are visible.`,
        `${ctx.regulatoryApplicability.length} regulatory applicability record(s) and ${ctx.cdes.filter((row) => row.criticality === 'CRITICAL').length} critical CDE(s) are modeled.`,
        `${certificationGaps.length} dataset(s) lack certified/provisional status.`,
      ],
      recommendations: [
        ...(failedRules.length ? [{ priority: 'HIGH', action: 'Prioritize failed controls affecting critical or regulated data.', evidence: failedRules.slice(0, 20).map((row) => row.id) }] : []),
        ...(freshnessAlerts.length ? [{ priority: 'HIGH', action: 'Address governed freshness SLA breaches.', evidence: freshnessAlerts.slice(0, 20).map((row) => row.id) }] : []),
        ...(certificationGaps.length ? [{ priority: 'MEDIUM', action: 'Close certification coverage gaps for governed datasets.', evidence: certificationGaps.slice(0, 20).map((row) => row.id) }] : []),
      ],
      evidence: { risk, failedRules: failedRules.slice(0, 50), alerts: openAlerts.slice(0, 50), regulatoryApplicability: ctx.regulatoryApplicability.slice(0, 50), criticalCdes: ctx.cdes.filter((row) => row.criticality === 'CRITICAL').slice(0, 50) },
    }
  }

  if (agentKey === 'architect_agent') {
    return {
      focus: 'architecture_lineage_contract_and_change_risk',
      observations: [
        `${ctx.datasets.length} dataset(s), ${ctx.lineageEdgeCount} technical lineage edge(s), and ${ctx.contracts.length} data contract(s) form the current governed architecture.`,
        `${ctx.lineageTransformations.length} transformation(s) and ${ctx.lineageColumnMappings.length} field-level lineage mapping(s) are available as governed technical evidence.`,
        `${schemaAlerts.length} open schema-drift alert(s) require compatibility review.`,
        `${ctx.cdeMappings.length} CDE-to-column mapping(s) connect business criticality to physical data.`,
        `${ctx.comparisons.length} persisted profile comparison(s) provide schema/metric change evidence.`,
      ],
      recommendations: [
        ...(schemaAlerts.length ? [{ priority: 'HIGH', action: 'Review schema drift against active contracts and downstream lineage before release.', evidence: schemaAlerts.slice(0, 20).map((row) => row.id) }] : []),
        ...(!ctx.contracts.length ? [{ priority: 'MEDIUM', action: 'Introduce contracts for critical producer/consumer boundaries.', evidence: [] }] : []),
      ],
      evidence: {
        schemaAlerts: schemaAlerts.slice(0, 50),
        contracts: ctx.contracts.slice(0, 50),
        cdeMappings: ctx.cdeMappings.slice(0, 100),
        profileComparisons: ctx.comparisons.slice(0, 30),
        lineageEdgeCount: ctx.lineageEdgeCount,
        lineageAssets: ctx.lineageAssets.slice(0, 100),
        lineageTransformations: ctx.lineageTransformations.slice(0, 50),
        lineageColumnMappings: ctx.lineageColumnMappings.slice(0, 100),
        lineageTransformationEdges: ctx.lineageTransformationEdges.slice(0, 50),
      },
    }
  }

  if (agentKey === 'investigator_agent') {
    const usefulRemediation = ctx.remediationKnowledge.filter((row) => String(row.outcome_status).toUpperCase() === 'WORKED')
    const failedRemediation = ctx.remediationKnowledge.filter((row) => String(row.outcome_status).toUpperCase() === 'FAILED')
    return {
      focus: 'root_cause_hypothesis_and_prior_case_reuse',
      observations: [
        `${openIncidents.length} open incident(s), ${openIssues.length} open issue(s), ${ctx.anomalies.length} anomaly signal(s), and ${failedRules.length} failed rule result(s) are available for investigation.`,
        `${ctx.lineageTransformations.length} transformation(s), ${ctx.lineageColumnMappings.length} field-level mapping(s), and ${ctx.lineageTransformationEdges.length} transformation edge(s) are available for bounded root-cause tracing.`,
        `${usefulRemediation.length} prior remediation case(s) are marked WORKED and ${failedRemediation.length} are marked FAILED.`,
        `${failedProfiles.length} failed and ${partialProfiles.length} partial profile run(s) appear in the bounded history.`,
      ],
      hypotheses: [
        ...(freshnessAlerts.length ? [{ confidence: 0.75, hypothesis: 'A freshness/SLA breach may be contributing to downstream quality risk.', evidence: freshnessAlerts.slice(0, 10).map((row) => row.id) }] : []),
        ...(failedRules.length ? [{ confidence: 0.8, hypothesis: 'One or more governed quality controls are currently violated.', evidence: failedRules.slice(0, 20).map((row) => row.id) }] : []),
        ...(ctx.anomalies.length ? [{ confidence: 0.7, hypothesis: 'Profile metric drift may explain a change in observed data behavior.', evidence: ctx.anomalies.slice(0, 20).map((row) => row.id) }] : []),
        ...(ctx.lineageColumnMappings.length ? [{ confidence: 0.65, hypothesis: 'A transformation or mapped source field may contribute to the observed downstream behavior; verify the persisted expressions before attribution.', evidence: ctx.lineageColumnMappings.slice(0, 20).map((row) => row.id) }] : []),
      ],
      recommendations: usefulRemediation.slice(0, 10).map((row) => ({ priority: 'MEDIUM', action: row.reusable_guidance || row.remediation_action, evidence: [row.id], priorOutcome: row.outcome_status, confidence: row.confidence })),
      evidence: {
        incidents: ctx.incidents.slice(0, 30),
        issues: ctx.issues.slice(0, 30),
        anomalies: ctx.anomalies.slice(0, 50),
        failedRules: failedRules.slice(0, 50),
        remediationKnowledge: ctx.remediationKnowledge.slice(0, 30),
        lineageAssets: ctx.lineageAssets.slice(0, 100),
        lineageTransformations: ctx.lineageTransformations.slice(0, 50),
        lineageColumnMappings: ctx.lineageColumnMappings.slice(0, 100),
        lineageTransformationEdges: ctx.lineageTransformationEdges.slice(0, 50),
      },
    }
  }

  if (agentKey === 'executive_agent') {
    const certifiedCoverage = ctx.datasets.length ? Math.round((activeCerts.size / ctx.datasets.length) * 1000) / 10 : 100
    const latestScore = number(ctx.scorecards[0]?.overall_score)
    return {
      focus: 'executive_governance_health_and_priority',
      observations: [
        `Governance risk is ${risk.score}/100 (${risk.band}); latest governance score is ${latestScore ?? 'not available'}.`,
        `Certification coverage is ${certifiedCoverage}% across ${ctx.datasets.length} dataset(s).`,
        `${openAlerts.length} open alert(s), ${openIssues.length} open issue(s), and ${openIncidents.length} open incident(s) require attention.`,
        `${ctx.cdes.filter((row) => row.criticality === 'CRITICAL').length} critical CDE(s) and ${ctx.regulatoryApplicability.length} regulatory applicability record(s) are governed.`,
      ],
      priorities: [
        ...(risk.band === 'HIGH' ? [{ rank: 1, priority: 'Reduce high governance risk drivers.', evidence: risk.contributors }] : []),
        ...(freshnessAlerts.length ? [{ rank: 2, priority: 'Restore governed data freshness.', evidence: freshnessAlerts.slice(0, 10).map((row) => row.id) }] : []),
        ...(certificationGaps.length ? [{ rank: 3, priority: 'Improve certification coverage.', evidence: certificationGaps.slice(0, 10).map((row) => row.id) }] : []),
      ],
      evidence: { risk, certificationCoveragePercent: certifiedCoverage, scorecards: ctx.scorecards.slice(0, 6), alerts: openAlerts.slice(0, 30), criticalCdes: ctx.cdes.filter((row) => row.criticality === 'CRITICAL').slice(0, 30) },
    }
  }

  return {
    focus: 'operational_support_and_governance_diagnostics',
    observations: [
      `${failedProfiles.length} failed and ${partialProfiles.length} partial profiling run(s) are visible.`,
      `${openAlerts.length} open observability alert(s), ${openIssues.length} open issue(s), and ${openIncidents.length} open incident(s) are available for troubleshooting.`,
      `${ctx.remediationKnowledge.length} prior remediation knowledge record(s) can be reused for known symptoms.`,
    ],
    recommendations: ctx.remediationKnowledge.slice(0, 10).map((row) => ({ priority: 'MEDIUM', action: row.reusable_guidance || row.remediation_action, evidence: [row.id], priorOutcome: row.outcome_status })),
    evidence: { failedProfiles: failedProfiles.slice(0, 30), partialProfiles: partialProfiles.slice(0, 30), alerts: openAlerts.slice(0, 50), issues: openIssues.slice(0, 30), incidents: openIncidents.slice(0, 30), remediationKnowledge: ctx.remediationKnowledge.slice(0, 30) },
  }
}

function reasoningContract(agentKey: GovernanceReadAgentKey) {
  const common = {
    authority: 'READ_ONLY',
    evidenceOrder: ['AUTHORITATIVE_POSTGRES', 'GOVERNANCE_KNOWLEDGE', 'KNOWLEDGE_GRAPH', 'PROFILE_AND_DQ_HISTORY'],
    rules: [
      'Do not invent owners, policies, regulations, datasets, incidents or measurements.',
      'Treat suggested mappings/classifications as non-authoritative until approved.',
      'Separate observed evidence from hypotheses and recommendations.',
      'Do not mutate source data or governance state.',
    ],
  }
  const focus = {
    steward_agent: ['stewardship', 'glossary', 'CDEs', 'classification', 'certification', 'issues'],
    governance_analyst_agent: ['cross-domain risk', 'policy/regulation', 'quality', 'CDEs', 'certification'],
    architect_agent: ['lineage', 'contracts', 'schema/change impact', 'technical standards'],
    investigator_agent: ['incidents', 'anomalies', 'failed controls', 'prior remediation', 'root-cause hypotheses', 'field lineage'],
    executive_agent: ['portfolio health', 'risk', 'certification coverage', 'regulatory exposure', 'priorities'],
    support_agent: ['diagnostics', 'failed runs', 'alerts', 'issues/incidents', 'known remediation'],
  }[agentKey]
  return { ...common, focus }
}

export async function executeGovernanceSpecialistAgent(input: {
  projectId: string
  agentDefinitionId: string
  actorUserId: string
  question?: string | null
}) {
  const admin = createAdminClient()
  const suppliedQuestion = input.question?.trim().slice(0, 1000) || null

  const { data: definition, error: definitionError } = await admin
    .schema('agent')
    .from('agent_definitions')
    .select('id,agent_key,name,version,enabled,configuration')
    .eq('id', input.agentDefinitionId)
    .eq('enabled', true)
    .maybeSingle()
  if (definitionError) throw new Error(`Unable to resolve specialist agent definition: ${definitionError.message}`)
  if (!definition || !allowedKeys.has(String(definition.agent_key))) throw new Error('Agent definition is not an enabled governed specialist agent.')
  const agentKey = String(definition.agent_key) as GovernanceReadAgentKey
  const query = suppliedQuestion || defaultQuestion(agentKey)

  const { data: run, error: runError } = await admin.schema('agent').from('agent_runs').insert({
    agent_definition_id: definition.id,
    project_id: input.projectId,
    status: 'RUNNING',
    input: { question: suppliedQuestion, evidence_query: query, execution_mode: 'deterministic_specialist_read_only' },
    started_at: new Date().toISOString(),
  }).select('id').single()
  if (runError || !run) throw new Error(`Unable to create specialist agent run: ${runError?.message ?? 'unknown error'}`)

  try {
    const [projectResult, ctx, knowledgeMatches] = await Promise.all([
      admin.schema('app').from('projects').select('id,name,organization_id').eq('id', input.projectId).maybeSingle(),
      loadContext(admin, input.projectId),
      loadKnowledge(admin, input.projectId, query),
    ])
    if (projectResult.error || !projectResult.data) throw new Error(`Unable to resolve specialist agent project: ${projectResult.error?.message ?? 'not found'}`)

    const graph = await loadGraph(admin, input.projectId, knowledgeMatches[0])
    const specialized = roleEvidence(agentKey, ctx)
    const evidenceSources = [
      'app.projects', 'catalog.datasets', 'catalog.dataset_versions', 'profiling.profile_runs', 'profiling.quality_rule_runs',
      'profiling.profile_comparisons', 'profiling.profile_anomalies', 'profiling.observability_alerts',
      'governance.knowledge_documents', 'governance.critical_data_elements', 'governance.cde_mappings',
      'governance.accountability_assignments', 'governance.data_contracts', 'governance.dataset_certifications',
      'governance.issues', 'governance.observability_incidents', 'governance.remediation_knowledge',
      'governance.lineage_assets', 'governance.lineage_transformations', 'governance.lineage_column_mappings', 'governance.lineage_edges',
      'governance.knowledge_relationships',
    ]
    const evidenceCount = knowledgeMatches.length + graph.edges.length + ctx.alerts.length + ctx.ruleRuns.length + ctx.issues.length + ctx.incidents.length + ctx.lineageTransformations.length + ctx.lineageColumnMappings.length + ctx.lineageTransformationEdges.length
    const confidence = Math.max(0.45, Math.min(0.98, 0.55 + Math.min(0.25, evidenceCount / 200) + (graph.edges.length ? 0.08 : 0) + (knowledgeMatches.length ? 0.08 : 0)))

    const output = {
      agent: { key: agentKey, name: definition.name, version: definition.version },
      question: suppliedQuestion,
      generatedAt: new Date().toISOString(),
      mode: 'deterministic_specialist_read_only',
      project: projectResult.data,
      reasoningContract: reasoningContract(agentKey),
      queryPlan: {
        truth: 'AUTHORITATIVE_POSTGRES',
        knowledgeQuery: query,
        knowledgeMatches: knowledgeMatches.length,
        graphAnchor: graph.anchor,
        graphEdges: graph.edges.length,
        historySignals: {
          profileRuns: ctx.profileRuns.length,
          qualityRuleRuns: ctx.ruleRuns.length,
          comparisons: ctx.comparisons.length,
          anomalies: ctx.anomalies.length,
          lineageTransformations: ctx.lineageTransformations.length,
          lineageColumnMappings: ctx.lineageColumnMappings.length,
          lineageTransformationEdges: ctx.lineageTransformationEdges.length,
        },
      },
      observations: (specialized as any).observations ?? [],
      recommendations: (specialized as any).recommendations ?? [],
      hypotheses: (specialized as any).hypotheses ?? [],
      priorities: (specialized as any).priorities ?? [],
      specialist: specialized,
      knowledge: {
        matches: knowledgeMatches.slice(0, 20),
        graph: { anchor: graph.anchor, edges: graph.edges.slice(0, 100) },
      },
      confidence,
      evidence_count: evidenceCount,
      evidence_sources: evidenceSources,
      approval_status: 'NOT_APPLICABLE_READ_ONLY',
      limitations: [
        'This run is deterministic and read-only; it does not execute governance mutations.',
        'Knowledge retrieval is lexical unless the caller separately invokes semantic/hybrid search.',
        'Graph context is bounded to five hops and 100 edges.',
        'Field-lineage evidence is bounded to the most recent 300 transformations/edges and 500 column mappings for a project.',
        'Freshness currently uses completed profiling observation time as a proxy until source-native watermark telemetry is available.',
      ],
    }

    const { error: completeError } = await admin.schema('agent').from('agent_runs').update({
      status: 'SUCCEEDED',
      output,
      completed_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }).eq('id', run.id)
    if (completeError) throw new Error(`Unable to persist specialist agent output: ${completeError.message}`)

    await writeGovernanceAudit({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      actorType: 'USER',
      eventType: 'GOVERNANCE_SPECIALIST_AGENT_COMPLETED',
      entityType: 'AGENT_RUN',
      entityId: run.id,
      metadata: {
        agent_key: agentKey,
        agent_version: definition.version,
        read_only: true,
        specialist: true,
        confidence,
        evidence_count: evidenceCount,
        graph_edge_count: graph.edges.length,
        field_lineage_mapping_count: ctx.lineageColumnMappings.length,
        transformation_count: ctx.lineageTransformations.length,
        knowledge_match_count: knowledgeMatches.length,
      },
    })

    return { runId: run.id, output }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Governance specialist agent execution failed.'
    await admin.schema('agent').from('agent_runs').update({
      status: 'FAILED',
      error_code: 'GOVERNANCE_SPECIALIST_AGENT_FAILED',
      error_message: message.slice(0, 2000),
      completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    throw error
  }
}
