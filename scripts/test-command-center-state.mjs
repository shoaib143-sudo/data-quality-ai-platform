import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'

const sourcePath = path.resolve('lib/ai/command-center-state.ts')
const source = await fs.readFile(sourcePath, 'utf8')
const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'command-center-state-'))
const modulePath = path.join(dir, 'command-center-state.mjs')
await fs.writeFile(modulePath, transpiled)
const { GovernedCommandCenterState } = await import(pathToFileURL(modulePath).href)

const projectId = 'project-1'
const state = new GovernedCommandCenterState({
  async listAiSystems() {
    return [{ id: 'sys-1', project_id: projectId, system_key: 'int-router', name: 'Router', system_type: 'APPLICATION', lifecycle_status: 'DRAFT', current_version_id: 'v-1' }]
  },
  async listAiSystemVersions() {
    return [{ id: 'v-1', project_id: projectId, ai_system_id: 'sys-1', version_number: 1, provider: 'provider', model_name: 'model', external_version: null, intended_use: 'Route governed AI work', risk_tier: 'HIGH', data_categories: [], human_oversight: 'Human approval required', limitations: 'No deployment authority', semantic_hash: 'hash', created_at: '2026-09-08T00:00:00Z' }]
  },
  async listAiSystemDecisions() { return [] },
  async listAiSystemAssessments() {
    return [{ id: 'assessment-1', project_id: projectId, ai_system_id: 'sys-1', version_id: 'v-1', assessment_type: 'RISK', result: 'PARTIAL', assessor_type: 'SYSTEM', assessor_user_id: null, source_agent_run_id: null, evidence: {}, note: null, created_at: '2026-09-08T00:10:00Z' }]
  },
  async listAiEvaluationResults() {
    return [
      { id: 'eval-1', project_id: projectId, evaluation_type: 'ROUTING_QUALITY', capability: 'route', metric_name: 'accuracy', score: '0.99', pass: true, evaluator_type: 'SYSTEM', evaluator_version: '1', ai_system_id: 'sys-1', ai_system_version_id: 'v-1', agent_run_id: null, source_agent_evaluation_id: null, telemetry_event_id: null, correlation_id: null, evidence_refs: [], dimensions: {}, metadata: {}, observed_at: '2026-09-08T00:30:00Z', created_at: '2026-09-08T00:30:00Z' },
      { id: 'eval-2', project_id: projectId, evaluation_type: 'SAFETY', capability: null, metric_name: 'policy_alignment', score: null, pass: null, evaluator_type: 'SYSTEM', evaluator_version: null, ai_system_id: 'sys-1', ai_system_version_id: 'v-1', agent_run_id: null, source_agent_evaluation_id: null, telemetry_event_id: null, correlation_id: null, evidence_refs: [], dimensions: {}, metadata: {}, observed_at: '2026-09-08T00:31:00Z', created_at: '2026-09-08T00:31:00Z' },
      { id: 'eval-cross-project', project_id: 'project-2', evaluation_type: 'ROUTING_QUALITY', capability: 'route', metric_name: 'accuracy', score: '1', pass: true, evaluator_type: 'SYSTEM', evaluator_version: '1', ai_system_id: 'sys-2', ai_system_version_id: 'v-2', agent_run_id: null, source_agent_evaluation_id: null, telemetry_event_id: null, correlation_id: null, evidence_refs: [], dimensions: {}, metadata: {}, observed_at: '2026-09-08T00:32:00Z', created_at: '2026-09-08T00:32:00Z' },
    ]
  },
  async listAiTelemetryEvents() {
    return [{ id: 'telemetry-1', project_id: projectId, event_type: 'MODEL_CALL', operation: 'route', status: 'ERROR', provider_id: 'provider', model_name: 'model', agent_run_id: null, ai_system_id: 'sys-1', ai_system_version_id: 'v-1', correlation_id: null, latency_ms: 15, input_tokens: 10, output_tokens: 0, cost_usd: 0, observed_at: '2026-09-08T01:00:00Z' }]
  },
  async listRoutingPolicies() {
    return [
      { id: 'route-policy-1', project_id: projectId, task: 'classification', sensitivity: 'ANY', risk: 'HIGH', enabled: true, allowed_ai_system_ids: ['sys-1'], min_evaluation_score: '0.9', min_scored_count: 5, allow_environment_fallback: false, reviewer_user_id: 'user-1', reviewer_capability: 'policy.approve', review_note: 'Reviewed route constraint', created_at: '2026-09-08T00:20:00Z' },
      { id: 'route-policy-cross-project', project_id: 'project-2', task: 'classification', sensitivity: 'ANY', risk: 'ANY', enabled: true, allowed_ai_system_ids: [], min_evaluation_score: null, min_scored_count: 0, allow_environment_fallback: true, reviewer_user_id: 'user-2', reviewer_capability: 'policy.approve', review_note: 'Other project', created_at: '2026-09-08T00:21:00Z' },
    ]
  },
  async listDataQualityInvestigations() {
    return [
      { id: 'investigation-1', project_id: projectId, agent_run_id: 'agent-run-1', dataset_id: 'dataset-1', dataset_version_id: 'dataset-version-1', profile_run_id: 'profile-run-1', severity: 'HIGH', status: 'APPROVAL_REQUIRED', summary: 'Quality issue requires governed review', business_impact: 'Potential reporting risk', approval_required: true, workflow_instance_id: 'workflow-1', evidence: { refs: ['profile-run-1'] }, created_at: '2026-09-08T00:40:00Z', updated_at: '2026-09-08T00:45:00Z' },
      { id: 'investigation-2', project_id: projectId, agent_run_id: 'agent-run-2', dataset_id: 'dataset-2', dataset_version_id: 'dataset-version-2', profile_run_id: 'profile-run-2', severity: 'HIGH', status: 'ATTENTION_REQUIRED', summary: 'Quality issue requires attention', business_impact: null, approval_required: false, workflow_instance_id: null, evidence: {}, created_at: '2026-09-08T00:41:00Z', updated_at: '2026-09-08T00:46:00Z' },
      { id: 'investigation-cross-project', project_id: 'project-2', agent_run_id: 'agent-run-3', dataset_id: 'dataset-3', dataset_version_id: 'dataset-version-3', profile_run_id: null, severity: 'INFO', status: 'CONTROLLED', summary: 'Other project investigation', business_impact: null, approval_required: false, workflow_instance_id: null, evidence: {}, created_at: '2026-09-08T00:42:00Z', updated_at: '2026-09-08T00:47:00Z' },
    ]
  },
  async listAutonomyPolicies() {
    return [
      { id: 'p-auto', project_id: projectId, action_key: 'auto-action', enabled: true, execution_mode: 'AUTO', min_confidence: '0.9', max_auto_risk_level: 'HIGH', reversible: false, authority_status: 'SYSTEM_BASELINE', reviewed_by: null, reviewed_at: null, current_version_id: 'pv-1' },
      { id: 'p-approval', project_id: projectId, action_key: 'approval-action', enabled: true, execution_mode: 'APPROVAL_REQUIRED', min_confidence: '0.8', max_auto_risk_level: 'LOW', reversible: true, authority_status: 'APPROVED', reviewed_by: 'user-1', reviewed_at: '2026-09-08T00:00:00Z', current_version_id: 'pv-2' },
      { id: 'p-blocked', project_id: projectId, action_key: 'blocked-action', enabled: false, execution_mode: 'BLOCKED', min_confidence: '1', max_auto_risk_level: 'LOW', reversible: true, authority_status: 'SYSTEM_BASELINE', reviewed_by: null, reviewed_at: null, current_version_id: 'pv-3' },
    ]
  },
  async listAutonomyActions() {
    return [
      { id: 'a-1', project_id: projectId, action_key: 'approval-action', risk_level: 'HIGH', confidence: '0.8', status: 'PENDING_APPROVAL', approval_workflow_instance_id: 'wf-1', policy_version_id: 'pv-2', created_at: '2026-09-08T00:00:00Z', executed_at: null, rolled_back_at: null },
      { id: 'a-2', project_id: projectId, action_key: 'auto-action', risk_level: 'HIGH', confidence: '0.95', status: 'FAILED', approval_workflow_instance_id: null, policy_version_id: 'pv-1', created_at: '2026-09-08T01:00:00Z', executed_at: null, rolled_back_at: null },
    ]
  },
})

const result = await state.read(projectId)
assert.equal(result.controls.autonomyExpansionAllowed, false)
assert.equal(result.controls.directMutationEnabled, false)
assert.equal(result.controls.emergencyKillMutationEnabled, false)
assert.equal(result.controls.policyMutationEnabled, false)
assert.equal(result.counts.aiSystems, 1)
assert.equal(result.counts.aiSystemVersions, 1)
assert.equal(result.counts.aiSystemDecisions, 0)
assert.equal(result.counts.aiSystemAssessments, 1)
assert.equal(result.counts.aiEvaluationResults, 2)
assert.equal(result.counts.aiEvaluationPasses, 1)
assert.equal(result.counts.aiEvaluationFailures, 0)
assert.equal(result.counts.aiEvaluationUnresolved, 1)
assert.equal(result.aiEvaluationResults.some((row) => row.id === 'eval-cross-project'), false)
assert.equal(result.counts.aiTelemetryEvents, 1)
assert.equal(result.counts.aiTelemetryErrors, 1)
assert.equal(result.counts.routingPolicyVersions, 1)
assert.equal(result.counts.enabledRoutingPolicyVersions, 1)
assert.equal(result.routingPolicies.some((row) => row.id === 'route-policy-cross-project'), false)
assert.equal(result.routingPolicies[0].allow_environment_fallback, false)
assert.equal(result.counts.investigations, 2)
assert.equal(result.counts.investigationsApprovalRequired, 1)
assert.equal(result.counts.investigationsAttentionRequired, 1)
assert.equal(result.counts.investigationsHighSeverity, 2)
assert.equal(result.dataQualityInvestigations.some((row) => row.id === 'investigation-cross-project'), false)
assert.equal(result.dataQualityInvestigations[0].agent_run_id, 'agent-run-1')
assert.equal(result.counts.enabledAutoPolicies, 1)
assert.equal(result.counts.enabledApprovalPolicies, 1)
assert.equal(result.counts.blockedPolicies, 1)
assert.equal(result.counts.openActions, 1)
assert.ok(result.counts.highOrCriticalFindings >= 5)

const codes = new Set(result.findings.map((finding) => finding.code))
for (const code of [
  'AI_SYSTEM_NOT_APPROVED',
  'AI_SYSTEM_CURRENT_VERSION_NO_APPROVAL',
  'AI_TELEMETRY_ERROR',
  'AUTO_POLICY_ENABLED',
  'AUTO_POLICY_NOT_REVIEWED',
  'AUTO_POLICY_NOT_REVERSIBLE',
  'AUTO_POLICY_HIGH_RISK',
  'APPROVAL_POLICY_ENABLED',
  'BLOCKED_POLICY',
  'ACTION_PENDING_APPROVAL',
  'ACTION_FAILED',
]) assert.ok(codes.has(code), `missing ${code}`)

assert.ok(codes.has('AI_SYSTEM_NOT_APPROVED'), 'passing automated evaluation must not activate a DRAFT system')
assert.ok(codes.has('AI_SYSTEM_CURRENT_VERSION_NO_APPROVAL'), 'passing automated evaluation must not replace exact-version human approval')
assert.equal([...codes].some((code) => code.startsWith('INVESTIGATION_')), false, 'investigation evidence must not manufacture AI governance findings or deployment authority')
await assert.rejects(() => state.read('   '), /projectId is required/)
console.log('Command Center control-state, governance evidence, non-authoritative evaluation evidence, routing policy visibility, and observational investigation evidence verified.')