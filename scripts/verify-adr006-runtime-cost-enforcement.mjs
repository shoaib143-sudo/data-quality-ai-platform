import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260911164500_adr006_governed_runtime_cost_enforcement.sql', 'utf8')
const generalizedAdmission = fs.readFileSync('supabase/migrations/20260910185600_generalize_ai_budget_admission_scope.sql', 'utf8')
const budgetResolver = fs.readFileSync('lib/ai/governance-reasoning-budget-policy.ts', 'utf8')
const admissionAdapter = fs.readFileSync('lib/ai/governance-resource-budget-admission.ts', 'utf8')
const costAdapter = fs.readFileSync('lib/ai/governance-cost-accounting.ts', 'utf8')
const router = fs.readFileSync('lib/ai/observable-intelligent-router.ts', 'utf8')

for (const required of [
  'governance.ai_runtime_cost_enforcement_decisions',
  'governance.check_ai_project_runtime_cost_admission',
  'governance.evaluate_ai_project_runtime_cost',
  "'COST_EVIDENCE_INCOMPLETE'",
  "'COST_CURRENCY_UNSUPPORTED'",
  "'PER_REQUEST_COST_LIMIT'",
  "'DAILY_COST_LIMIT'",
  'v_event.pricing_version_id is null',
  "v_event.currency <> 'USD'",
  'v_event.total_cost > v_policy.max_cost_usd_per_request',
  'v_daily_after > v_policy.max_cost_usd_per_day',
  'v_daily_cost >= v_policy.max_cost_usd_per_day',
  'provider charge has occurred',
]) assert.ok(migration.includes(required), `runtime cost enforcement must include ${required}`)

assert.match(migration, /before update or delete on governance\.ai_runtime_cost_enforcement_decisions/, 'runtime cost decisions must be append-only')
assert.match(migration, /unique \(cost_event_id, policy_version_id\)/, 'runtime cost decision identity must bind exact cost evidence and policy')
assert.match(migration, /effective\.scope_type = 'PROJECT'[\s\S]*effective\.scope_key = 'PROJECT'[\s\S]*effective\.id = p_policy_version_id/, 'post-invocation enforcement must bind the exact current PROJECT policy')
assert.ok(!/exchange[_ ]?rate|fx[_ ]?rate|convert_currency/i.test(migration), 'runtime cost enforcement must not invent FX authority')
assert.ok(!migration.includes('create or replace function governance.acquire_ai_project_resource_budget_admission'), 'runtime cost migration must not overwrite ADR-008 generalized admission')

assert.ok(!/effective\.scope_type = 'PROJECT'/.test(generalizedAdmission), 'ADR-008 generalized admission must remain scope-neutral')
assert.ok(!/effective\.scope_key = 'PROJECT'/.test(generalizedAdmission), 'ADR-008 generalized admission must remain scope-neutral')

assert.ok(budgetResolver.includes('ScopedCostEvidenceUnavailableError'), 'AI-system or agent cost limits must fail closed without scoped cost evidence')
assert.match(budgetResolver, /scope_type !== 'PROJECT'[\s\S]*maxCostUsdPerRequest[\s\S]*maxCostUsdPerDay/, 'non-project USD cost limits must be rejected')
assert.ok(admissionAdapter.includes("rpc('check_ai_project_runtime_cost_admission'"), 'runtime must run daily cost preflight before provider admission')
assert.ok(admissionAdapter.indexOf("rpc('check_ai_project_runtime_cost_admission'") < admissionAdapter.indexOf("rpc('acquire_ai_project_resource_budget_admission'"), 'daily cost preflight must occur before rate/concurrency admission')
assert.ok(costAdapter.includes("rpc('evaluate_ai_project_runtime_cost'"), 'canonical cost recording must evaluate configured hard cost limits')
assert.ok(costAdapter.includes('RuntimeCostEnforcementDeniedError'), 'denied exact cost must stop result consumption')
assert.match(router, /costEvidence = await this\.costAccounting\.recordInvocation[\s\S]*return result/, 'cost accounting and enforcement must finish before the result is returned')
assert.match(router, /catch \(error\)[\s\S]*throw error/, 'governance and cost failures must propagate through the observable router')

console.log('ADR-006 governed runtime cost admission and exact-cost enforcement contract verified.')
