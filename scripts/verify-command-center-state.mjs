import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing Command Center artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}
function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing Command Center contract: ${pattern}`)
  }
}

requireText('lib/ai/command-center-state.ts', [
  'GovernedCommandCenterState',
  'AI_SYSTEM_NOT_APPROVED',
  'AI_SYSTEM_CURRENT_VERSION_NO_APPROVAL',
  'AI_SYSTEM_ACTIVE_WITHOUT_APPROVAL',
  'AI_TELEMETRY_ERROR',
  'AUTO_POLICY_ENABLED',
  'AUTO_POLICY_NOT_REVIEWED',
  'AUTO_POLICY_NOT_REVERSIBLE',
  'AUTO_POLICY_HIGH_RISK',
  'listAiEvaluationResults',
  'aiEvaluationResults',
  'aiEvaluationPasses',
  'aiEvaluationFailures',
  'aiEvaluationUnresolved',
  'listRoutingPolicies',
  'routingPolicies',
  'routingPolicyVersions',
  'enabledRoutingPolicyVersions',
  'listDataQualityInvestigations',
  'dataQualityInvestigations',
  'investigationsApprovalRequired',
  'investigationsAttentionRequired',
  'investigationsHighSeverity',
  'autonomyExpansionAllowed: false',
  'directMutationEnabled: false',
  'emergencyKillMutationEnabled: false',
  'policyMutationEnabled: false',
])
requireText('lib/ai/governance-command-center-state.ts', [
  "from('ai_systems')",
  "from('ai_system_versions')",
  "from('ai_system_decisions')",
  "from('ai_system_assessments')",
  "from('ai_evaluation_results')",
  "from('ai_telemetry_events')",
  "from('ai_routing_policy_versions')",
  "from('data_quality_investigations')",
  "from('autonomy_policies')",
  "from('autonomy_actions')",
  'allowed_ai_system_ids',
  'min_evaluation_score',
  'min_scored_count',
  'allow_environment_fallback',
  'agent_run_id',
  'dataset_version_id',
  'profile_run_id',
  'approval_required',
  'workflow_instance_id',
  'reviewer_capability',
  'project_id',
  "order('observed_at', { ascending: false }).limit(100)",
  "order('updated_at', { ascending: false }).limit(100)",
])
requireText('app/admin/ai-command-center/page.tsx', [
  'DataNexus AI Command Center',
  'authorizeProject',
  "'admin.manage'",
  'createGovernanceCommandCenterState',
  'createGovernanceLearningEngine',
  'Mutation controls remain closed',
  'form method="get"',
  'AI governance evidence',
  'Human decisions',
  'Assessments',
  'Automated evaluation evidence',
  'PASS or a high score does not approve an AI system, activate a version, or grant deployment authority.',
  'Absence means evaluation evidence has not been recorded, not that the governed AI systems passed evaluation.',
  'Governed learning candidates',
  'Verified outcomes and semantic memories are candidate learning only.',
  'Semantic promotion:',
  'Procedural promotion:',
  'Offline adaptation:',
  'Authoritative: no',
  'this Command Center provides no promotion action.',
  'Governed routing policy versions',
  'Routing policy versions are human-reviewed constraints consumed by the Intelligent Router.',
  'Policy mutation remains disabled here',
  'No governed AI routing policy versions are recorded for this project.',
  'unrestricted routing has governance approval',
  'Data quality investigations',
  'Investigation records are operational evidence produced by governed runs.',
  'do not approve an AI system, activate a model version, or create deployment authority.',
  'No data quality investigation evidence is recorded for this project.',
  'not that data quality is healthy or governed approval exists.',
  'AI telemetry',
  'Autonomy policies',
  'Recent autonomy actions',
])
requireText('lib/ai/audit-command-center-state.ts', [
  'GovernedAuditCommandCenterState',
  'AuditChainVerification',
  'listAuditEvents',
  'listAuditReportSnapshots',
  'verifyAuditChain',
  'row.project_id === projectId',
  'visibleEventsMissingSequence',
  'visibleEventsMissingPreviousHash',
])
requireText('lib/ai/governance-audit-command-center-state.ts', [
  "from('audit_events')",
  "from('audit_report_snapshots')",
  "rpc('verify_audit_chain'",
  'actor_type,event_type,entity_type,entity_id,correlation_id,created_at,previous_hash,event_hash,chain_version,chain_sequence',
  'chain_tip_event_id,chain_tip_event_hash,audit_event_count,report_hash,created_at',
  "order('created_at', { ascending: false }).limit(100)",
  "order('created_at', { ascending: false }).limit(50)",
])
requireText('app/admin/ai-command-center/audit/page.tsx', [
  'Command Center Audit Ledger',
  "'admin.manage'",
  'createGovernanceAuditCommandCenterState',
  'governance.verify_audit_chain',
  'Event rows alone are not treated as independent proof of chain integrity.',
  'Recent audit events',
  'Audit metadata is not rendered.',
  'Audit report snapshots',
  'Report payloads and chain-tip hash values are not exposed in this view.',
  'Audit validity demonstrates the verifier’s assessment of ledger integrity.',
  'does not approve an AI system, activate a model version, promote learning, mutate policy, or grant deployment authority.',
])
requireText('lib/ai/learning-engine.ts', [
  'VERIFIED_OUTCOME_CANDIDATE',
  'DURABLE_UNVALIDATED_SEMANTIC',
  'AUTHORITY_PROOF_NOT_RECORDED',
  'authoritativeSemanticCount: 0',
  'semanticPromotionEnabled: false',
  'proceduralPromotionEnabled: false',
  'offlineAdaptationEnabled: false',
])
requireText('lib/ai/routing-policy.ts', [
  'NO_ACTIVE_POLICY',
  'POLICY_DISABLED',
  'AI_SYSTEM_NOT_ALLOWED',
  'evaluationType',
  'evaluationMetricName',
  'evaluationMaxAgeSeconds',
  'POLICY_ALLOWED',
])
requireText('lib/ai/intelligent-router.ts', [
  'INSUFFICIENT_EVALUATION_EVIDENCE',
  'EVALUATION_SCORE_BELOW_POLICY_THRESHOLD',
  'STALE_EVALUATION_EVIDENCE',
  'DETERMINISTIC_FALLBACK',
  'CANONICAL_EVALUATION',
])
requireText('app/admin/page.tsx', ["href=\"/admin/ai-command-center\""])

const adapter = read('lib/ai/governance-command-center-state.ts')
for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']) {
  if (adapter.includes(forbidden)) throw new Error(`Command Center projection must remain read-only: found ${forbidden}`)
}

const page = read('app/admin/ai-command-center/page.tsx')
for (const forbidden of ['method="post"', "'use server'", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', '.promote(', 'probable_root_causes', 'recommendations', 'investigation.evidence']) {
  if (page.includes(forbidden)) throw new Error(`Command Center page must remain read-only and summary-safe: found ${forbidden}`)
}

const auditAdapter = read('lib/ai/governance-audit-command-center-state.ts')
for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(']) {
  if (auditAdapter.includes(forbidden)) throw new Error(`Audit Command Center projection must remain read-only: found ${forbidden}`)
}
for (const forbidden of ['metadata', 'report_payload']) {
  if (auditAdapter.includes(forbidden)) throw new Error(`Audit Command Center adapter must not select raw payload field: ${forbidden}`)
}

const auditPage = read('app/admin/ai-command-center/audit/page.tsx')
for (const forbidden of ['method="post"', "'use server'", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', '.metadata', 'report_payload', 'chain_tip_event_hash}']) {
  if (auditPage.includes(forbidden)) throw new Error(`Audit Command Center page must remain read-only and payload-safe: found ${forbidden}`)
}

console.log('ADR-006 Command Center read-only governance, evaluation, learning, routing, investigation, audit-evidence, and UI boundaries verified.')