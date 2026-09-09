import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260908203507_adr006_resource_budgets_and_execution_controls.sql', 'utf8')
const admissionMigration = fs.readFileSync('supabase/migrations/20260909112000_adr006_atomic_project_budget_admission.sql', 'utf8')
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

for (const required of [
  'governance.ai_resource_budget_request_admissions',
  'governance.ai_resource_budget_concurrency_leases',
  'create policy ai_resource_budget_request_admissions_read',
  'create policy ai_resource_budget_concurrency_leases_read',
  'revoke insert, update, delete on governance.ai_resource_budget_request_admissions from authenticated',
  'revoke insert, update, delete on governance.ai_resource_budget_concurrency_leases from authenticated',
]) assert.ok(admissionMigration.includes(required), `atomic admission migration must include ${required}`)

assert.ok(adapter.includes("from('ai_resource_budget_policy_effective')"), 'adapter must read canonical effective budgets')
assert.ok(adapter.includes("from('ai_execution_control_effective')"), 'adapter must read canonical execution state')
assert.ok(adapter.includes("from('ai_execution_control_events')"), 'adapter must read canonical execution events')
assert.ok(adapter.includes("from('ai_resource_budget_request_admissions')"), 'adapter must read canonical request admissions')
assert.ok(adapter.includes("from('ai_resource_budget_concurrency_leases')"), 'adapter must read canonical concurrency leases')
assert.ok(adapter.includes('.limit(100)'), 'runtime accounting evidence reads must remain bounded')
assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(adapter), 'resource-control adapter must be read-only')
assert.ok(!adapter.includes("from('ai_telemetry_events')"), 'budget authority/accounting evidence must not be inferred from telemetry')

for (const required of [
  "status: 'READY' | 'NOT_CONFIGURED' | 'DISABLED' | 'NO_OUTPUT_LIMIT'",
  "row.scope_type === 'PROJECT' && row.scope_key === 'PROJECT'",
  "status: 'NOT_CONFIGURED'",
  "status: 'DISABLED'",
  "status: 'NO_OUTPUT_LIMIT'",
  "status: 'READY'",
  'projectOutputBudget: projectOutputBudgetReadiness(budgets)',
  'budgetAdmissions = admissionsRaw.filter((row) => row.project_id === projectId)',
  'budgetConcurrencyLeases = leasesRaw.filter((row) => row.project_id === projectId)',
  'row.released_at == null',
  'expiresAt > now',
  'admissionMutationEnabled: false as const',
]) assert.ok(state.includes(required), `resource-control state must include ${required}`)

assert.ok(!state.includes("from('ai_telemetry_events')"), 'readiness must not infer budget authority from telemetry')
assert.ok(page.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'page must require admin.manage')
assert.ok(page.includes('Project output-token enforcement readiness'), 'page must surface project output-budget readiness')
assert.ok(page.includes('Recent atomic request admissions'), 'page must surface canonical atomic request admissions')
assert.ok(page.includes('Recent concurrency leases'), 'page must surface canonical concurrency leases')
assert.ok(page.includes('Derived only from the canonical effective PROJECT / PROJECT resource-budget row'), 'page must state canonical readiness source')
assert.ok(page.includes('No ceiling is invented'), 'page must state missing-policy behavior')
assert.ok(page.includes('execution accounting against an exact policy version'), 'page must distinguish admission evidence from authority')
assert.ok(page.includes('capacity accounting only, never governance authority'), 'page must bound lease semantics')
assert.ok(page.includes('Mutation remains disabled'), 'page must state mutation boundary')
assert.ok(page.includes('telemetry'), 'page must distinguish telemetry from policy authority')
assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(page), 'resource-control page must be read-only')

console.log('Resource-control Command Center policy, admission, lease, and readiness boundaries passed.')
