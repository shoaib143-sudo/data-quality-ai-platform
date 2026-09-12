import { assertProjectBelongsToInstanceOrganization } from '@/lib/governance/instance-organization'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeRootCauseEvidence, resolveLegacyVerificationProfileRunId } from './incident-evidence-normalization'
import { assertIssueReferencesBelongToProject } from './issue-reference-integrity'
import {
  assertGovernedIncidentTruthInvariant,
  deriveIncidentLifecycleState,
  type GovernedIncident,
  type IncidentEvidenceRef,
  type IncidentImpactEvidence,
  type IncidentRemediationEvidence,
  type IncidentRootCauseEvidence,
} from './governed-incident'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function evidenceRef(authority: IncidentEvidenceRef['authority'], sourceTable: string, sourceId: string, kind: string, observedAt?: string | null, deterministic = true): IncidentEvidenceRef {
  return { authority, sourceTable, sourceId, kind, observedAt: observedAt ?? null, deterministic }
}

export async function loadGovernedIncident(input: { projectId: string; issueId: string }): Promise<GovernedIncident | null> {
  await assertProjectBelongsToInstanceOrganization(input.projectId)
  const admin = createAdminClient()

  const { data: issue, error: issueError } = await admin.schema('governance').from('issues')
    .select('id,project_id,dataset_id,dataset_version_id,profile_run_id,finding_id,quality_rule_run_id,control_finding_id,title,description,severity,status,owner_user_id,resolution_summary,resolution_evidence,created_at,updated_at,resolved_at')
    .eq('id', input.issueId)
    .eq('project_id', input.projectId)
    .maybeSingle()

  if (issueError) throw new Error(`Unable to load governed incident issue: ${issueError.message}`)
  if (!issue) return null

  // The incident reader uses the service-role client to compose evidence, so re-validate
  // every stored object reference before following it. This makes stale/internal writes
  // fail closed instead of allowing an admin read to cross project boundaries.
  await assertIssueReferencesBelongToProject({
    projectId: input.projectId,
    datasetId: issue.dataset_id,
    datasetVersionId: issue.dataset_version_id,
    profileRunId: issue.profile_run_id,
    findingId: issue.finding_id,
    qualityRuleRunId: issue.quality_rule_run_id,
    controlFindingId: issue.control_finding_id,
  })

  const profilingOutcomePromise = admin.schema('governance').from('profiling_remediation_outcomes')
    .select('id,workflow_instance_id,source_profile_run_id,verification_profile_run_id,status,source_quality_score,verification_quality_score,quality_score_delta,source_high_severity_findings,verification_high_severity_findings,high_severity_findings_delta,checks,outcome,verified_at,updated_at')
    .eq('project_id', input.projectId).contains('remediation_issue_ids', [input.issueId]).order('updated_at', { ascending: false }).limit(1).maybeSingle()

  const dqOutcomePromise = admin.schema('governance').from('data_quality_remediation_outcomes')
    .select('id,workflow_instance_id,verification_profile_run_id,status,checks,outcome,verified_at,updated_at')
    .eq('project_id', input.projectId).contains('remediation_issue_ids', [input.issueId]).order('updated_at', { ascending: false }).limit(1).maybeSingle()

  const observabilityPromise = admin.schema('governance').from('observability_incidents')
    .select('id,status,severity,probable_root_causes,business_impact,confidence,evidence,first_observed_at,last_observed_at,resolved_at')
    .eq('project_id', input.projectId).contains('evidence', { remediation_issue_ids: [input.issueId] }).order('updated_at', { ascending: false }).limit(1).maybeSingle()

  const lineagePromise = admin.schema('governance').from('lineage_impact_analyses')
    .select('id,trigger_type,trigger_id,affected_count,critical_affected_count,risk_score,confidence,summary,evidence,created_at,updated_at')
    .eq('project_id', input.projectId).eq('trigger_id', input.issueId).order('updated_at', { ascending: false }).limit(1).maybeSingle()

  const businessContextPromise = issue.dataset_id
    ? admin.schema('governance').from('dataset_business_context_links')
      .select('id,business_context_asset_id,relationship_type,confidence,evidence,created_at')
      .eq('project_id', input.projectId).eq('dataset_id', issue.dataset_id)
    : Promise.resolve({ data: [], error: null })

  const findingPromise = issue.finding_id
    ? admin.schema('profiling').from('profile_findings')
      .select('id,profile_run_id,finding_type,severity,title,description,confidence,evidence,recommendation,created_at')
      .eq('id', issue.finding_id).maybeSingle()
    : Promise.resolve({ data: null, error: null })

  const investigationPromise = issue.profile_run_id
    ? admin.schema('governance').from('data_quality_investigations')
      .select('id,profile_run_id,severity,status,summary,probable_root_causes,business_impact,risk,recommendations,approval_required,workflow_instance_id,evidence,created_at,updated_at')
      .eq('project_id', input.projectId).eq('profile_run_id', issue.profile_run_id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    : Promise.resolve({ data: null, error: null })

  const knowledgePromise = admin.schema('governance').from('remediation_knowledge')
    .select('id,problem_type,symptom,remediation_action,outcome_status,before_evidence,after_evidence,reusable_guidance,confidence,metadata,created_at,updated_at')
    .eq('project_id', input.projectId).eq('issue_id', input.issueId).order('updated_at', { ascending: false })

  const [profilingResult, dqResult, observabilityResult, lineageResult, businessContextResult, findingResult, investigationResult, knowledgeResult] = await Promise.all([
    profilingOutcomePromise, dqOutcomePromise, observabilityPromise, lineagePromise, businessContextPromise, findingPromise, investigationPromise, knowledgePromise,
  ])

  for (const [name, result] of [
    ['profiling remediation', profilingResult], ['data quality remediation', dqResult], ['observability incident', observabilityResult], ['lineage impact', lineageResult],
    ['business context', businessContextResult], ['profile finding', findingResult], ['data quality investigation', investigationResult], ['remediation knowledge', knowledgeResult],
  ] as const) {
    if (result.error) throw new Error(`Unable to load ${name} evidence: ${result.error.message}`)
  }

  const profiling = profilingResult.data
  const dq = dqResult.data
  const observability = observabilityResult.data
  const lineage = lineageResult.data
  const finding = findingResult.data
  const investigation = investigationResult.data
  const knowledge = knowledgeResult.data ?? []

  // Profiling and Data Quality outcomes are separate verification authorities with
  // different provenance contracts. Mixing individual fields from both would create
  // synthetic truth, so ambiguous linkage fails closed until reconciled upstream.
  if (profiling && dq) {
    throw new Error('Ambiguous governed incident remediation authority: issue is linked to both profiling and data-quality remediation outcomes.')
  }

  let lineageNodes: Array<Record<string, unknown>> = []
  if (lineage?.id) {
    const { data, error } = await admin.schema('governance').from('lineage_impact_nodes')
      .select('id,asset_type,asset_id,asset_name,distance,path,criticality,certification_status,risk_score,confidence,evidence,created_at')
      .eq('analysis_id', lineage.id).eq('project_id', input.projectId).order('distance')
    if (error) throw new Error(`Unable to load lineage impact nodes: ${error.message}`)
    lineageNodes = (data ?? []) as Array<Record<string, unknown>>
  }

  let observabilityImpacts: Array<Record<string, unknown>> = []
  if (observability?.id) {
    const { data, error } = await admin.schema('governance').from('observability_incident_impacts')
      .select('id,asset_type,asset_id,asset_name,impact_type,distance,risk_score,confidence,evidence,created_at')
      .eq('incident_id', observability.id).eq('project_id', input.projectId)
    if (error) throw new Error(`Unable to load observability impact evidence: ${error.message}`)
    observabilityImpacts = (data ?? []) as Array<Record<string, unknown>>
  }

  const rootCauseEvidence: IncidentRootCauseEvidence[] = []
  for (const cause of normalizeRootCauseEvidence(investigation?.probable_root_causes)) {
    rootCauseEvidence.push({
      ...evidenceRef('DATA_QUALITY', 'governance.data_quality_investigations', investigation!.id, 'PROBABLE_ROOT_CAUSE', investigation!.updated_at, false),
      explanation: cause.explanation,
      confidence: cause.confidence,
      advisory: true,
    })
  }
  for (const cause of normalizeRootCauseEvidence(observability?.probable_root_causes)) {
    rootCauseEvidence.push({
      ...evidenceRef('OBSERVABILITY', 'governance.observability_incidents', observability!.id, 'PROBABLE_ROOT_CAUSE', observability!.last_observed_at, false),
      explanation: cause.explanation,
      confidence: cause.confidence ?? observability!.confidence ?? null,
      advisory: true,
    })
  }

  const impactEvidence: IncidentImpactEvidence[] = [
    ...lineageNodes.map((node) => ({ ...evidenceRef('LINEAGE', 'governance.lineage_impact_nodes', text(node.id), 'LINEAGE_IMPACT', text(node.created_at), true), assetType: text(node.asset_type), assetId: text(node.asset_id), assetName: text(node.asset_name) || null, relationship: 'DOWNSTREAM_IMPACT', distance: Number(node.distance ?? 0), riskScore: node.risk_score == null ? null : Number(node.risk_score), confidence: node.confidence == null ? null : Number(node.confidence) })),
    ...(businessContextResult.data ?? []).map((link) => ({ ...evidenceRef('BUSINESS_CONTEXT', 'governance.dataset_business_context_links', link.id, 'BUSINESS_CONTEXT_LINK', link.created_at, true), assetType: 'BUSINESS_CONTEXT', assetId: link.business_context_asset_id, assetName: null, relationship: link.relationship_type, distance: 1, riskScore: null, confidence: link.confidence == null ? null : Number(link.confidence) })),
    ...observabilityImpacts.map((impact) => ({ ...evidenceRef('OBSERVABILITY', 'governance.observability_incident_impacts', text(impact.id), 'OBSERVABILITY_IMPACT', text(impact.created_at), true), assetType: text(impact.asset_type), assetId: text(impact.asset_id), assetName: text(impact.asset_name) || null, relationship: text(impact.impact_type) || null, distance: Number(impact.distance ?? 0), riskScore: impact.risk_score == null ? null : Number(impact.risk_score), confidence: impact.confidence == null ? null : Number(impact.confidence) })),
  ]

  const remediationEvidence: IncidentRemediationEvidence[] = []
  if (profiling) remediationEvidence.push({ ...evidenceRef('REMEDIATION', 'governance.profiling_remediation_outcomes', profiling.id, 'PROFILING_REMEDIATION', profiling.updated_at, true), status: profiling.status, workflowInstanceId: profiling.workflow_instance_id, action: null })
  if (dq) remediationEvidence.push({ ...evidenceRef('REMEDIATION', 'governance.data_quality_remediation_outcomes', dq.id, 'DATA_QUALITY_REMEDIATION', dq.updated_at, true), status: dq.status, workflowInstanceId: dq.workflow_instance_id, action: null })
  for (const item of knowledge) remediationEvidence.push({ ...evidenceRef('REMEDIATION', 'governance.remediation_knowledge', item.id, 'REMEDIATION_KNOWLEDGE', item.updated_at, true), status: item.outcome_status, action: item.remediation_action, workflowInstanceId: null })

  const remediationStatus = profiling?.status ?? dq?.status ?? null
  const verificationStatus = profiling?.status?.startsWith('VERIFICATION') || ['VERIFIED', 'VERIFICATION_FAILED'].includes(profiling?.status ?? '')
    ? profiling?.status ?? null
    : dq?.status?.startsWith('VERIFICATION') || ['VERIFIED', 'VERIFICATION_FAILED'].includes(dq?.status ?? '') ? dq?.status ?? null : null
  const verificationRequired = Boolean(profiling || dq)
  const dqVerificationRunId = dq ? resolveLegacyVerificationProfileRunId(dq.verification_profile_run_id, dq.outcome) : null
  const verificationRunId = profiling?.verification_profile_run_id ?? dqVerificationRunId
  const sourceRunId = profiling?.source_profile_run_id ?? issue.profile_run_id ?? null
  const verifiedAt = profiling?.verified_at ?? dq?.verified_at ?? null

  const verificationEvidence: IncidentEvidenceRef[] = []
  if (verificationRunId) verificationEvidence.push(evidenceRef('PROFILING', 'profiling.profile_runs', verificationRunId, 'VERIFICATION_PROFILE_RUN', verifiedAt, true))
  if (profiling) verificationEvidence.push(evidenceRef('REMEDIATION', 'governance.profiling_remediation_outcomes', profiling.id, 'VERIFICATION_OUTCOME', verifiedAt, true))
  if (dq) verificationEvidence.push(evidenceRef('REMEDIATION', 'governance.data_quality_remediation_outcomes', dq.id, 'VERIFICATION_OUTCOME', verifiedAt, true))

  const baseEvidence: IncidentEvidenceRef[] = [
    evidenceRef('ISSUE', 'governance.issues', issue.id, 'GOVERNANCE_ISSUE', issue.updated_at, true),
    ...(finding ? [evidenceRef('PROFILING', 'profiling.profile_findings', finding.id, 'PROFILE_FINDING', finding.created_at, true)] : []),
    ...(investigation ? [evidenceRef('DATA_QUALITY', 'governance.data_quality_investigations', investigation.id, 'DATA_QUALITY_INVESTIGATION', investigation.updated_at, false)] : []),
    ...(observability ? [evidenceRef('OBSERVABILITY', 'governance.observability_incidents', observability.id, 'OBSERVABILITY_INCIDENT', observability.last_observed_at, false)] : []),
    ...(lineage ? [evidenceRef('LINEAGE', 'governance.lineage_impact_analyses', lineage.id, 'LINEAGE_IMPACT_ANALYSIS', lineage.updated_at, true)] : []),
  ]

  const lifecycleState = deriveIncidentLifecycleState({
    issueStatus: issue.status,
    hasRootCauseEvidence: rootCauseEvidence.length > 0,
    remediationStatus,
    verificationRequired,
    verificationStatus,
    hasResolutionEvidence: Boolean(issue.resolution_summary || Object.keys(object(issue.resolution_evidence)).length),
  })

  const incident: GovernedIncident = {
    truth: {
      incidentId: issue.id,
      projectId: issue.project_id,
      datasetId: issue.dataset_id,
      datasetVersionId: issue.dataset_version_id,
      issueId: issue.id,
      severity: issue.severity,
      issueStatus: issue.status,
      ownerUserId: issue.owner_user_id,
      lifecycleState,
      verificationStatus,
      openedAt: issue.created_at,
      updatedAt: issue.updated_at,
      resolvedAt: issue.resolved_at,
    },
    title: issue.title,
    description: issue.description,
    profileRunId: issue.profile_run_id,
    findingIds: finding ? [finding.id] : [],
    qualityRuleRunId: issue.quality_rule_run_id,
    controlFindingId: issue.control_finding_id,
    rootCauseEvidence,
    impactEvidence,
    remediationEvidence,
    verification: {
      required: verificationRequired,
      status: verificationStatus,
      sourceRunId,
      verificationRunId,
      qualityScoreDelta: profiling?.quality_score_delta ?? null,
      highSeverityFindingsDelta: profiling?.high_severity_findings_delta ?? null,
      verifiedAt,
      evidence: verificationEvidence,
    },
    evidence: [...baseEvidence, ...rootCauseEvidence, ...impactEvidence, ...remediationEvidence, ...verificationEvidence],
    truthBoundary: 'GOVERNED_OUTCOME_ONLY',
    authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE',
    evidenceVersion: 1,
  }

  assertGovernedIncidentTruthInvariant(incident)
  return incident
}
