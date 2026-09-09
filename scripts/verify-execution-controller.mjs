import fs from 'node:fs'

const failures = []

const migration = fs.readFileSync('supabase/migrations/20260908203507_adr006_resource_budgets_and_execution_controls.sql', 'utf8')
for (const token of [
  'governance.ai_execution_control_events',
  'governance.ai_execution_control_effective',
  "control_action in ('PAUSE','KILL','RESUME')",
  "when 'RESUME' then 'RUNNING'",
  'absence of a row means no canonical control state has been recorded',
]) {
  if (!migration.includes(token)) failures.push(`resource-control migration missing ${token}`)
}

const controller = fs.readFileSync('lib/ai/execution-controller.ts', 'utf8')
for (const token of [
  'GovernedExecutionController',
  'ExecutionControlDeniedError',
  "decision: 'ALLOW_NO_CONTROL'",
  "'DENY_PAUSED'",
  "'DENY_KILLED'",
  "row.scope_type === 'PROJECT'",
  "row.scope_type === 'AGENT'",
  "row.effective_state === 'KILL'",
  "row.effective_state === 'PAUSE'",
]) {
  if (!controller.includes(token)) failures.push(`execution controller missing ${token}`)
}
if (controller.indexOf("row.effective_state === 'KILL'") > controller.indexOf("row.effective_state === 'PAUSE'")) {
  failures.push('KILL must be evaluated before PAUSE')
}

const adapter = fs.readFileSync('lib/ai/governance-execution-controller.ts', 'utf8')
for (const token of [
  "from('ai_execution_control_effective')",
  ".eq('project_id', projectId)",
  'createGovernanceExecutionController',
]) {
  if (!adapter.includes(token)) failures.push(`execution-control adapter missing ${token}`)
}
for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', "from('ai_telemetry_events')"]) {
  if (adapter.includes(forbidden)) failures.push(`execution-control adapter must remain read-only and canonical: ${forbidden}`)
}

for (const path of ['app/api/agents/governance/run/route.ts', 'app/api/agents/governance/handoff/route.ts']) {
  const source = fs.readFileSync(path, 'utf8')
  for (const token of [
    "authorizeProject(user.id, projectId, 'agent.execute')",
    'createGovernanceExecutionController().assertAllowed',
    'isExecutionControlDeniedError',
    'status: 423',
  ]) {
    if (!source.includes(token)) failures.push(`${path} missing ${token}`)
  }
  const authorizeAt = source.indexOf("authorizeProject(user.id, projectId, 'agent.execute')")
  const controlAt = source.indexOf('createGovernanceExecutionController().assertAllowed')
  if (authorizeAt < 0 || controlAt < 0 || controlAt <= authorizeAt) failures.push(`${path} must authorize before resolving execution controls`)

  const deniedResponseStart = source.indexOf('if (isExecutionControlDeniedError(error))')
  const deniedResponse = deniedResponseStart >= 0 ? source.slice(deniedResponseStart, deniedResponseStart + 500) : ''
  for (const forbidden of ['reason:', 'actor_user_id', 'actor_capability']) {
    if (deniedResponse.includes(forbidden)) failures.push(`${path} denied response leaks control detail: ${forbidden}`)
  }
}

if (failures.length) {
  console.error('ADR-006 emergency execution enforcement verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('ADR-006 emergency execution enforcement boundary verified.')
