import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260908203507_adr006_resource_budgets_and_execution_controls.sql', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-resource-control-state.ts', 'utf8')
const state = fs.readFileSync('lib/ai/resource-control-command-center-state.ts', 'utf8')
const page = fs.readFileSync('app/admin/ai-command-center/resource-controls/page.tsx', 'utf8')

for (const required of [
  'governance.ai_resource_budget_policy_versions',
  'governance.ai_resource_budget_policy_effective',
  'governance.ai_execution_control_events',
  'governance.ai_execution_control_effective',
  'app_private.is_project_member(project_id)',
]) assert.ok(migration.includes(required), `migration must include ${required}`)

assert.ok(adapter.includes("from('ai_resource_budget_policy_effective')"), 'adapter must read canonical effective budgets')
assert.ok(adapter.includes("from('ai_execution_control_effective')"), 'adapter must read canonical execution state')
assert.ok(adapter.includes("from('ai_execution_control_events')"), 'adapter must read canonical execution events')
assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(adapter), 'resource-control adapter must be read-only')
assert.ok(!adapter.includes("from('ai_telemetry_events')"), 'budget authority must not be inferred from telemetry')

for (const required of [
  "status: 'READY' | 'NOT_CONFIGURED' | 'DISABLED' | 'NO_OUTPUT_LIMIT'",
  "row.scope_type === 'PROJECT' && row.scope_key === 'PROJECT'",
  "status: 'NOT_CONFIGURED'",
  "status: 'DISABLED'",
  "status: 'NO_OUTPUT_LIMIT'",
  "status: 'READY'",
  'projectOutputBudget: projectOutputBudgetReadiness(budgets)',
]) assert.ok(state.includes(required), `resource-control state must include ${required}`)

assert.ok(!state.includes("from('ai_telemetry_events')"), 'readiness must not infer budget authority from telemetry')
assert.ok(page.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'page must require admin.manage')
assert.ok(page.includes('Project output-token enforcement readiness'), 'page must surface project output-budget readiness')
assert.ok(page.includes('Derived only from the canonical effective PROJECT / PROJECT resource-budget row'), 'page must state canonical readiness source')
assert.ok(page.includes('No ceiling is invented'), 'page must state missing-policy behavior')
assert.ok(page.includes('Mutation remains disabled'), 'page must state mutation boundary')
assert.ok(page.includes('telemetry'), 'page must distinguish telemetry from policy authority')
assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(page), 'resource-control page must be read-only')

console.log('Resource-control Command Center static and project output-budget readiness checks passed.')
