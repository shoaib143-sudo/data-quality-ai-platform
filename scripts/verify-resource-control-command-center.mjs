import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260908203507_adr006_resource_budgets_and_execution_controls.sql', 'utf8')
const admissionMigration = fs.readFileSync('supabase/migrations/20260909112000_adr006_atomic_project_budget_admission.sql', 'utf8')
const pricingMigration = fs.readFileSync('supabase/migrations/20260909134000_adr006_model_pricing_authority.sql', 'utf8')
const runtimeCostMigration = fs.readFileSync('supabase/migrations/20260911164500_adr006_governed_runtime_cost_enforcement.sql', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-resource-control-state.ts', 'utf8')
const state = fs.readFileSync('lib/ai/resource-control-command-center-state.ts', 'utf8')
const page = fs.readFileSync('app/admin/ai-command-center/resource-controls/page.tsx', 'utf8')
const pricingPage = fs.readFileSync('app/admin/ai-command-center/pricing-authority/page.tsx', 'utf8')
const layout = fs.readFileSync('app/admin/ai-command-center/layout.tsx', 'utf8')

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
]) assert.ok(admissionMigration.includes(required), `atomic admission migration must include ${required}`)

for (const required of [
  'create table governance.ai_model_pricing_versions',
  'create or replace view governance.ai_model_pricing_effective',
  '1000000::bigint as price_unit_tokens',
  'input_price_per_million_tokens',
  'output_price_per_million_tokens',
  'create or replace function governance.publish_ai_model_pricing',
]) assert.ok(pricingMigration.includes(required), `pricing authority migration must include ${required}`)

for (const required of [
  'governance.ai_runtime_cost_enforcement_decisions',
  'COST_EVIDENCE_INCOMPLETE',
  'COST_CURRENCY_UNSUPPORTED',
  'PER_REQUEST_COST_LIMIT',
  'DAILY_COST_LIMIT',
  'evaluate_ai_project_runtime_cost',
  "effective.scope_type = 'PROJECT'",
  "effective.scope_key = 'PROJECT'",
  "currency <> 'USD'",
  "accounting_status <> 'PRICED'",
  'max_cost_usd_per_request',
  'max_cost_usd_per_day',
  'cannot undo a charge already incurred',
]) assert.ok(runtimeCostMigration.includes(required), `runtime cost enforcement migration must include ${required}`)
assert.ok(!/exchange|fx_rate|currency_conversion/i.test(runtimeCostMigration), 'runtime cost enforcement must not introduce FX conversion')

assert.ok(adapter.includes("from('ai_resource_budget_policy_effective')"), 'adapter must read canonical effective budgets')
assert.ok(adapter.includes("from('ai_model_pricing_effective')"), 'adapter must read canonical effective model pricing authority')
assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(adapter), 'resource-control adapter must be read-only')
assert.ok(!adapter.includes("from('ai_telemetry_events')"), 'budget and pricing authority must not be inferred from telemetry')

for (const required of [
  "row.scope_type === 'PROJECT' && row.scope_key === 'PROJECT'",
  'projectBudget.max_cost_usd_per_request != null || projectBudget.max_cost_usd_per_day != null',
  'runtimeCostEnforcementEnabled',
  'pricingMutationEnabled: false as const',
]) assert.ok(state.includes(required), `resource-control state must include ${required}`)

assert.ok(page.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'resource-control page must require admin.manage')
assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(page), 'resource-control page must be read-only')

assert.ok(pricingPage.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'pricing authority page must require admin.manage')
assert.ok(pricingPage.includes('Current approved pricing evidence'), 'pricing page must surface canonical current pricing evidence')
assert.ok(pricingPage.includes('No price is inferred, scraped, or fabricated'), 'pricing page must reject inferred or fabricated pricing')
assert.ok(pricingPage.includes('No FX conversion'), 'pricing page must state FX is not performed')
assert.ok(pricingPage.includes('block result consumption but cannot undo a provider charge already incurred'), 'pricing page must state post-invocation request-limit semantics')
assert.ok(pricingPage.includes('AI-system and agent cost limits fail closed'), 'pricing page must state unsupported scoped cost semantics')
assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(pricingPage), 'pricing authority page must be read-only')
assert.ok(layout.includes("href: '/admin/ai-command-center/pricing-authority'"), 'Command Center navigation must expose pricing authority')

console.log('Resource-control Command Center and governed runtime cost enforcement boundaries passed.')
