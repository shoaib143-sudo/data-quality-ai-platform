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
requireText('lib/observability/incident-intelligence.ts', [
  'investigateObservabilityIncident',
  'SCHEMA_CHANGE_AFFECTING_QUALITY_CONTROLS',
  'MATERIAL_DATA_QUALITY_DEGRADATION',
  'OBSERVABILITY_INCIDENT_RESPONSE_APPROVAL',
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
requireText('app/api/lineage/impact/route.ts', [
  "authorizeProject(user.id, projectId, 'lineage.read')",
  'analyzeLineageImpact',
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
])
if (worker.indexOf('investigateDataQualityRun') > worker.indexOf('investigateObservabilityIncident')) {
  throw new Error('Durable worker contract must investigate Data Quality before correlated observability incident processing.')
}
if (worker.indexOf('queueDataQualityVerificationAfterFreshProfile') > worker.indexOf('verifyDataQualityRemediation')) {
  throw new Error('Fresh profiling verification handoff must be wired before Data Quality outcome verification.')
}

requireText('app/api/issues/[issueId]/route.ts', [
  'scheduleFreshDataQualityVerificationFromIssue',
  "mode: 'DATA_QUALITY_FRESH_PROFILE'",
])
requireText('app/data-quality/autonomous/page.tsx', ['Autonomous quality operations'])
requireText('app/observability/incidents/page.tsx', ['AI Operations Center'])
requireText('app/lineage/impact/page.tsx', ['Lineage Impact Intelligence'])

console.log('Autonomous governance operations contracts verified.')
