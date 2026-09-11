import fs from 'node:fs'

const checks = [
  ['supabase/migrations/20260904225406_governed_autonomy_action_policy.sql', [
    'governance.autonomy_policies',
    'governance.autonomy_actions',
    "'CREATE_GOVERNANCE_ISSUE',true,'AUTO'",
    "'REQUEST_REPROFILE',true,'APPROVAL_REQUIRED'",
    "'UPDATE_QUALITY_RULE_THRESHOLD',false,'BLOCKED'",
    "'MUTATE_SOURCE_DATA',false,'BLOCKED'",
    "'ALTER_SCHEMA',false,'BLOCKED'",
    "'DELETE_DATA',false,'BLOCKED'",
    "'CLOSE_CREATED_ISSUE'",
  ]],
  ['supabase/migrations/20260911031730_governed_agent_policy_admission.sql', [
    'create or replace function governance.seed_default_autonomy_policies',
    "'RUN_GOVERNANCE_AGENT',true,'AUTO',1.0,'LOW',true",
    "'DISCARD_NON_AUTHORITATIVE_AGENT_OUTPUT'",
    "array['GOVERNANCE_AGENT']",
    "'production_source_mutation',false",
    "'authoritative_governance_mutation',false",
    'governance.seed_all_default_autonomy_policies()',
  ]],
  ['supabase/migrations/20260904225741_governed_autonomy_scope_guards.sql', [
    'governance.validate_autonomy_action_scope',
    'Autonomy policy belongs to another project',
    'Dataset autonomy target is outside project scope',
    'Autonomy input dataset must match governed target dataset',
    'Dataset version autonomy target is outside project scope',
    'Quality rule autonomy target is outside project scope',
    'autonomy_actions_scope_guard',
  ]],
  ['supabase/migrations/20260908211118_adr006_pin_verified_policy_decision_version.sql', [
    'governance.enforce_autonomy_action_policy',
    'new.policy_version_id is null',
    'new.policy_version_id is distinct from v_policy.current_version_id',
    'Verified autonomy policy version is no longer current',
    'Pinned autonomy policy version is invalid',
    'Autonomy action policy identity/version is immutable after creation',
  ]],
  ['lib/governance/policy-decision-provider.ts', [
    'export interface PolicyDecisionProvider',
    'GovernedPolicyDecisionProvider',
    "decision: 'DENY'",
    "decision: 'REQUIRE_APPROVAL'",
    "decision: 'ALLOW'",
    'current_version_id',
    'findPolicyVersion',
    "readonly id = 'governance_autonomy_policy'",
  ]],
  ['lib/governance/observable-policy-decision-provider.ts', [
    'ObservablePolicyDecisionProvider',
    "eventType: 'POLICY_DECISION'",
    "operation: 'autonomy_policy_decision'",
    'traceContext: this.resolveTraceContext()',
    'policy_version_id: result.policyVersionId',
    'Policy telemetry is observation only.',
    'return result',
  ]],
  ['lib/ai/telemetry-trace-context-store.ts', [
    'AsyncLocalStorage',
    'runWithTelemetryTraceContext',
    'currentTelemetryTraceContext',
  ]],
  ['lib/governance/governance-policy-decision-provider.ts', [
    'createGovernancePolicyDecisionProvider',
    "from('autonomy_policies')",
    "from('autonomy_policy_versions')",
    ".eq('id', versionId)",
    ".eq('policy_id', policyId)",
    ".eq('project_id', projectId)",
    'ObservablePolicyDecisionProvider',
    'createGovernanceTelemetryProvider()',
    'currentTelemetryTraceContext',
  ]],
  ['lib/governance/governed-autonomy.ts', [
    'proposeGovernedAction',
    'executeApprovedGovernedAction',
    'rollbackGovernedAction',
    'applyPredictiveRiskGovernedActions',
    'applyAllPredictiveRiskGovernedActions',
    'createGovernancePolicyDecisionProvider',
    'policyDecision.decision',
    'policy_version_id: policyDecision.policyVersionId',
    'policy_decision_provider: policyDecision.providerId',
    "claimed.action_key !== 'CREATE_GOVERNANCE_ISSUE'",
    "workflow.status !== 'APPROVED'",
    "policyRaw.rollback_strategy !== 'CLOSE_CREATED_ISSUE'",
    "idempotencyKey: `predictive-risk-review:${prediction.id}`",
    "status: 'CLOSED'",
    'production_source_mutation: false',
  ]],
  ['lib/profiling/queue-governed-reprofile.ts', [
    'queueGovernedReprofile',
    "PROFILING_AGENT_VERSION = '2.0'",
    'validateDataSourceForProfiling',
    "jobType: 'PROFILING'",
    "trigger: 'GOVERNED_AUTONOMY_REPROFILE'",
    "String(version.status).toUpperCase() !== 'AVAILABLE'",
    "String(source.status).toUpperCase() !== 'ACTIVE'",
    "eq('active', true)",
  ]],
  ['lib/governance/approved-autonomy-execution.ts', [
    'executeApprovedAutonomyAction',
    "action.action_key !== 'REQUEST_REPROFILE'",
    "workflow.status !== 'APPROVED'",
    'queueGovernedReprofile',
    'human_approval_verified: true',
    'production_source_mutation: false',
  ]],
  ['app/api/governance/autonomy/route.ts', [
    "authorizeProject(user.id, projectId, 'issues.manage')",
    'requireActionInProject',
    'executeApprovedAutonomyAction',
    "operation === 'APPLY_PREDICTIVE_RISK'",
    "operation === 'EXECUTE_APPROVED'",
    "operation === 'ROLLBACK'",
    "operation === 'PROPOSE'",
    'telemetryTraceContextFromRequest(request)',
    'runWithTelemetryTraceContext(traceContext',
  ]],
  ['app/api/agents/governance/run/route.ts', [
    "authorizeProject(user.id, projectId, 'agent.execute')",
    "const GOVERNED_AGENT_ACTION_KEY = 'RUN_GOVERNANCE_AGENT'",
    "const GOVERNED_AGENT_TARGET_TYPE = 'GOVERNANCE_AGENT'",
    'createGovernanceExecutionController().assertAllowed',
    'createGovernancePolicyDecisionProvider().decide',
    'runWithTelemetryTraceContext',
    "riskLevel: 'LOW'",
    'confidence: 1',
    "operation: 'governed_agent_policy_preflight'",
    "code: 'GOVERNED_AGENT_POLICY_BLOCKED'",
    "policyDecision.decision !== 'ALLOW'",
    'executeGovernanceSpecialistAgent',
  ]],
  ['app/api/jobs/worker/route.ts', [
    'refreshAllPredictiveRisk',
    'applyAllPredictiveRiskGovernedActions',
    'governedAutonomy',
  ]],
]

const failures = []
for (const [path, tokens] of checks) {
  if (!fs.existsSync(path)) {
    failures.push(`${path}: missing file`)
    continue
  }
  const source = fs.readFileSync(path, 'utf8')
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${path}: missing ${token}`)
  }
}

for (const path of ['lib/governance/governed-autonomy.ts', 'lib/governance/approved-autonomy-execution.ts']) {
  const executor = fs.readFileSync(path, 'utf8')
  for (const forbidden of [
    ".from('quality_rule_definitions').update(",
    ".from('datasets').delete(",
    ".from('dataset_versions').delete(",
    'ALTER TABLE catalog.',
  ]) {
    if (executor.includes(forbidden)) failures.push(`${path} contains forbidden mutation: ${forbidden}`)
  }
}

const adapter = fs.readFileSync('lib/governance/governance-policy-decision-provider.ts', 'utf8')
for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', "from('ai_telemetry_events')"]) {
  if (adapter.includes(forbidden)) failures.push(`PolicyDecisionProvider adapter must remain read-only and policy-authoritative: ${forbidden}`)
}

const observablePdp = fs.readFileSync('lib/governance/observable-policy-decision-provider.ts', 'utf8')
if (/throw\s+new\s+Error[^\n]*telemetry/i.test(observablePdp)) {
  failures.push('Observable PolicyDecisionProvider must not convert telemetry failure into a policy decision failure.')
}
if (/decision\s*[:=]\s*['"]ALLOW['"]/.test(observablePdp) || /decision\s*[:=]\s*['"]DENY['"]/.test(observablePdp)) {
  failures.push('Observable PolicyDecisionProvider must not manufacture ALLOW/DENY authority.')
}

const autonomyRoute = fs.readFileSync('app/api/governance/autonomy/route.ts', 'utf8')
const authAt = autonomyRoute.indexOf("authorizeProject(user.id, projectId, 'issues.manage')")
const traceAt = autonomyRoute.indexOf('telemetryTraceContextFromRequest(request)')
if (authAt < 0 || traceAt < 0 || traceAt <= authAt) failures.push('Autonomy request trace context must be established only after project authorization.')

const agentRoute = fs.readFileSync('app/api/agents/governance/run/route.ts', 'utf8')
const agentAuthAt = agentRoute.indexOf("authorizeProject(user.id, projectId, 'agent.execute')")
const executionControlAt = agentRoute.indexOf('createGovernanceExecutionController().assertAllowed')
const policyDecisionAt = agentRoute.indexOf('createGovernancePolicyDecisionProvider().decide')
const specialistExecutionAt = agentRoute.indexOf('executeGovernanceSpecialistAgent({')
if (agentAuthAt < 0 || executionControlAt <= agentAuthAt) failures.push('Governed agent execution control must run after project authorization.')
if (policyDecisionAt <= executionControlAt) failures.push('Governed agent policy decision must run after execution-control preflight.')
if (specialistExecutionAt <= policyDecisionAt) failures.push('Governed agent policy decision must run before specialist execution.')
if (/body\?\.(actionKey|action_key|targetType|target_type|riskLevel|risk_level|confidence)/.test(agentRoute)) {
  failures.push('Governed agent policy authority inputs must not be accepted from the request body.')
}

const autonomy = fs.readFileSync('lib/governance/governed-autonomy.ts', 'utf8')
for (const forbidden of ['function riskRank(', 'function allowedTarget(', 'const autoEligible =']) {
  if (autonomy.includes(forbidden)) failures.push(`governed autonomy must not duplicate PDP decision logic: ${forbidden}`)
}

const worker = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const refreshAt = worker.indexOf('const predictiveRisk = await refreshAllPredictiveRisk()')
const autonomyAt = worker.indexOf('const governedAutonomy = await applyAllPredictiveRiskGovernedActions()')
if (refreshAt < 0 || autonomyAt < 0 || autonomyAt <= refreshAt) failures.push('worker must refresh predictive risk before applying governed autonomy')

if (failures.length) {
  console.error('Governed autonomy verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Governed autonomy safety, exact-version pinning, governed-agent admission, observable PDP, and ADR-006 PolicyDecisionProvider contracts verified.')
