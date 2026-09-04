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
  ['supabase/migrations/20260904225741_governed_autonomy_scope_guards.sql', [
    'governance.validate_autonomy_action_scope',
    'Autonomy policy belongs to another project',
    'Dataset autonomy target is outside project scope',
    'Autonomy input dataset must match governed target dataset',
    'Dataset version autonomy target is outside project scope',
    'Quality rule autonomy target is outside project scope',
    'autonomy_actions_scope_guard',
  ]],
  ['lib/governance/governed-autonomy.ts', [
    'proposeGovernedAction',
    'executeApprovedGovernedAction',
    'rollbackGovernedAction',
    'applyPredictiveRiskGovernedActions',
    'applyAllPredictiveRiskGovernedActions',
    "claimed.action_key !== 'CREATE_GOVERNANCE_ISSUE'",
    "workflow.status !== 'APPROVED'",
    "policy.rollback_strategy !== 'CLOSE_CREATED_ISSUE'",
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

const worker = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const refreshAt = worker.indexOf('const predictiveRisk = await refreshAllPredictiveRisk()')
const autonomyAt = worker.indexOf('const governedAutonomy = await applyAllPredictiveRiskGovernedActions()')
if (refreshAt < 0 || autonomyAt < 0 || autonomyAt <= refreshAt) failures.push('worker must refresh predictive risk before applying governed autonomy')

if (failures.length) {
  console.error('Governed autonomy verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Governed autonomy safety contracts verified.')
