import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing required autonomous governance file: ${path}`)
  return fs.readFileSync(path, 'utf8')
}
function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing required contract: ${pattern}`)
  }
  return source
}
function forbidText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (source.includes(pattern)) throw new Error(`${path} contains forbidden autonomous mutation contract: ${pattern}`)
  }
}

requireText('supabase/migrations/20260904171000_data_quality_autonomous_operations.sql', [
  'governance.data_quality_investigations',
  'governance.data_quality_remediation_outcomes',
  'governance.data_quality_recommendation_learning',
  'enable row level security',
])
requireText('lib/data-quality/autonomous-operations.ts', [
  'investigateDataQualityRun',
  'DATA_QUALITY_REMEDIATION_APPROVAL',
  'probable_root_causes',
  'approval_required',
])
requireText('lib/data-quality/remediation-verification.ts', [
  'verifyDataQualityRemediation',
  'DATA_QUALITY_REMEDIATION_VERIFICATION',
  'material_improvement',
])
requireText('lib/data-quality/remediation-reprofile.ts', [
  'scheduleFreshDataQualityVerificationFromIssue',
  'DATA_QUALITY_REMEDIATION_VERIFICATION_PROFILE',
  'queueDataQualityVerificationAfterFreshProfile',
  'verification_profile_run_id',
  'verification_profile_job_id',
])
const dqAction = requireText('app/api/data-quality/remediation/route.ts', [
  'TRACKED_GOVERNANCE_ISSUES_ONLY',
  'production_mutation_performed: false',
  'data_quality_recommendation_learning',
])
if (!dqAction.includes("instance.status !== 'APPROVED'")) throw new Error('Data Quality remediation must remain approval-gated.')
forbidText('app/api/data-quality/remediation/route.ts', ['production_mutation_performed: true'])

requireText('supabase/migrations/20260904172000_observability_ai_operations_center.sql', [
  'governance.observability_incidents',
  'governance.observability_incident_alerts',
  'governance.observability_incident_impacts',
])
requireText('supabase/migrations/20260904174000_guard_observability_incident_resolution.sql', [
  'guard_observability_incident_resolution',
  'unresolved_response_issue_count',
  'active_correlated_alert_count',
])
requireText('supabase/migrations/20260904175000_index_autonomous_governance_foreign_keys.sql', [
  'dq_investigations_dataset_version_idx',
  'observability_incidents_workflow_idx',
])
requireText('supabase/migrations/20260904176000_observability_cross_dataset_correlations.sql', [
  'governance.observability_incident_correlations',
  'LINEAGE_RELATED',
  'SHARED_FAILURE_MODE',
  'TEMPORAL_CLUSTER',
  'enable row level security',
])
requireText('supabase/migrations/20260904177000_observability_incident_sla.sql', [
  'response_due_at',
  'escalation_level',
  'set_observability_incident_sla',
  "when 'CRITICAL' then interval '30 minutes'",
])
requireText('supabase/migrations/20260904178000_add_incident_sla_alert_category.sql', [
  'INCIDENT_SLA_BREACH',
])
requireText('lib/observability/incident-intelligence.ts', [
  'investigateObservabilityIncident',
  'SCHEMA_CHANGE_AFFECTING_QUALITY_CONTROLS',
  'MATERIAL_DATA_QUALITY_DEGRADATION',
  'OBSERVABILITY_INCIDENT_RESPONSE_APPROVAL',
])
requireText('lib/observability/incident-response-verification.ts', [
  'verifyObservabilityIncidentResponse',
  'verifyObservabilityIncidentResponseFromIssue',
  'tracked_response_issues_resolved',
  'correlated_signals_cleared',
  'OBSERVABILITY_INCIDENT_RESPONSE_VERIFIED',
])
requireText('lib/observability/cross-dataset-correlation.ts', [
  'correlateObservabilityIncidents',
  'shared_categories',
  'shared_probable_root_causes',
  'lineage_linked',
  'OBSERVABILITY_CROSS_DATASET_CORRELATION_EVALUATED',
])
requireText('lib/observability/incident-sla.ts', [
  'evaluateIncidentSlaEscalations',
  'INCIDENT_SLA_BREACH',
  'queueAlertNotifications',
  'OBSERVABILITY_INCIDENT_SLA_ESCALATED',
])
const incidentAction = requireText('app/api/observability/incidents/remediation/route.ts', [
  'TRACKED_GOVERNANCE_ISSUES_ONLY',
  'production_mutation_performed: false',
])
if (!incidentAction.includes("instance.status !== 'APPROVED'")) throw new Error('Observability response must remain approval-gated.')
forbidText('app/api/observability/incidents/remediation/route.ts', ['production_mutation_performed: true'])

requireText('supabase/migrations/20260904173000_lineage_impact_intelligence.sql', [
  'governance.lineage_impact_analyses',
  'governance.lineage_impact_nodes',
  'enable row level security',
])
requireText('lib/governance/lineage-impact.ts', [
  'analyzeLineageImpact',
  'enrichObservabilityIncidentWithLineageImpact',
  'visited',
  'riskScore',
  'confidence',
])
requireText('lib/governance/lineage-change-impact.ts', [
  'analyzeColumnLineageImpact',
  'getFieldGraphProvider',
  'fieldNeighborhood',
  'field_graph_provider',
  'assessProposedLineageChange',
  'PROPOSED_CHANGE',
  'APPROVAL_REQUIRED',
  'REVIEW_REQUIRED',
  'SAFE_TO_PROCEED',
  'production_mutation_performed: false',
  'COLUMN_LINEAGE_IMPACT_ANALYZED',
  'LINEAGE_PROPOSED_CHANGE_ASSESSED',
])
requireText('lib/data-plane/providers/postgres-field-graph-provider.ts', [
  "from('lineage_column_mappings')",
  "from('lineage_transformations')",
  "eq('project_id', projectId)",
  'MAX_DEPTH',
  'MAX_EDGES',
])
forbidText('lib/governance/lineage-change-impact.ts', [
  "from('lineage_column_mappings')",
  'production_mutation_performed: true',
])
requireText('app/api/lineage/impact/route.ts', [
  "authorizeProject(user.id, projectId, 'lineage.read')",
  'analyzeLineageImpact',
])
requireText('app/api/lineage/impact/change/route.ts', [
  "authorizeProject(user.id, projectId, 'lineage.read')",
  'assessProposedLineageChange',
  'affectedColumns',
])
requireText('app/lineage/impact/change-impact-manager.tsx', [
  'Pre-change impact gate',
  'Assess proposed change',
  'APPROVAL_REQUIRED',
  'productionMutationPerformed',
])

const worker = requireText('lib/orchestration/worker.ts', [
  'investigateDataQualityRun',
  'verifyDataQualityRemediation',
  'queueDataQualityVerificationAfterFreshProfile',
  "trigger === 'DATA_QUALITY_REMEDIATION_VERIFICATION_PROFILE'",
  'recordDataQualityReprofileError',
  'recordDataQualityReprofileCancellation',
  'investigateObservabilityIncident',
  'enrichObservabilityIncidentWithLineageImpact',
  'correlateObservabilityIncidents',
  'correlateIncidentProject',
])
if (worker.indexOf('investigateDataQualityRun') > worker.indexOf('investigateObservabilityIncident')) {
  throw new Error('Durable worker contract must investigate Data Quality before correlated observability incident processing.')
}
if (worker.indexOf('queueDataQualityVerificationAfterFreshProfile') > worker.indexOf('verifyDataQualityRemediation')) {
  throw new Error('Fresh profiling verification handoff must be wired before Data Quality outcome verification.')
}

requireText('app/api/jobs/worker/route.ts', [
  'evaluateIncidentSlaEscalations',
  'incidentEscalations',
])
requireText('app/api/issues/[issueId]/route.ts', [
  'scheduleFreshDataQualityVerificationFromIssue',
  "mode: 'DATA_QUALITY_FRESH_PROFILE'",
  'verifyObservabilityIncidentResponseFromIssue',
  'isObservabilityResponse',
  "mode: 'OBSERVABILITY_RESPONSE'",
])
requireText('app/api/observability/incidents/route.ts', ['observability_incident_correlations', 'correlateObservabilityIncidents', 'correlations'])
requireText('app/data-quality/autonomous/page.tsx', ['Autonomous quality operations'])
requireText('app/observability/incidents/page.tsx', ['AI Operations Center', 'Cross-dataset links', 'Related incidents across datasets', 'Overdue SLA', 'Escalation L'])
requireText('app/lineage/impact/page.tsx', ['Lineage Impact Intelligence', 'ChangeImpactManager'])

console.log('Autonomous governance operations contracts verified.')
