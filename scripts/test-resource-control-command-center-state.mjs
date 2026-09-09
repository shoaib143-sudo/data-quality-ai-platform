import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'

const sourcePath = path.resolve('lib/ai/resource-control-command-center-state.ts')
const source = await fs.readFile(sourcePath, 'utf8')
const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'resource-control-command-center-state-'))
const modulePath = path.join(dir, 'resource-control-command-center-state.mjs')
await fs.writeFile(modulePath, transpiled)
const { GovernedResourceControlState, projectOutputBudgetReadiness } = await import(pathToFileURL(modulePath).href)

const projectId = 'project-a'
const otherProjectId = 'project-b'
const projectBudget = { id:'b1', project_id:projectId, scope_type:'PROJECT', scope_key:'PROJECT', enabled:true, max_input_tokens_per_request:1000, max_output_tokens_per_request:500, max_cost_usd_per_request:'1.25', max_cost_usd_per_day:'10', max_requests_per_minute:20, max_concurrent_executions:2, reviewer_user_id:'u1', reviewer_capability:'policy.approve', review_note:'approved budget', created_at:'2026-09-09T00:00:00Z' }
const pricingRow = { id:'p1', project_id:projectId, provider:'openai', model_id:'gpt-example', pricing_version:'2026-09-reviewed', supersedes_pricing_id:null, currency:'USD', price_unit_tokens:1000000, input_price_per_million_tokens:'1.25', output_price_per_million_tokens:'5.00', effective_from:'2026-09-09T00:00:00Z', effective_to:null, source_reference:'reviewed provider pricing evidence', source_uri:null, reviewed_by:'u1', reviewed_at:'2026-09-09T00:00:00Z', reviewer_capability:'policy.approve', review_note:'approved pricing evidence', created_at:'2026-09-09T00:00:00Z' }
const stateReader = new GovernedResourceControlState({
  async listEffectiveBudgets() { return [
    projectBudget,
    { id:'b2', project_id:otherProjectId, scope_type:'PROJECT', scope_key:'PROJECT', enabled:true, max_input_tokens_per_request:9999, max_output_tokens_per_request:null, max_cost_usd_per_request:null, max_cost_usd_per_day:null, max_requests_per_minute:null, max_concurrent_executions:null, reviewer_user_id:'u2', reviewer_capability:'policy.approve', review_note:'other', created_at:'2026-09-09T00:00:00Z' },
  ] },
  async listEffectiveExecutionControls() { return [
    { id:'c1', project_id:projectId, scope_type:'PROJECT', scope_key:'PROJECT', control_action:'KILL', effective_state:'KILL', reason:'incident', actor_user_id:'u1', actor_capability:'admin.manage', correlation_id:null, created_at:'2026-09-09T00:00:00Z' },
    { id:'c2', project_id:otherProjectId, scope_type:'PROJECT', scope_key:'PROJECT', control_action:'RESUME', effective_state:'RUNNING', reason:'other', actor_user_id:'u2', actor_capability:'admin.manage', correlation_id:null, created_at:'2026-09-09T00:00:00Z' },
  ] },
  async listExecutionControlEvents() { return [
    { id:'e1', project_id:projectId, scope_type:'PROJECT', scope_key:'PROJECT', control_action:'KILL', reason:'incident', actor_user_id:'u1', actor_capability:'admin.manage', correlation_id:null, created_at:'2026-09-09T00:00:00Z' },
    { id:'e2', project_id:otherProjectId, scope_type:'PROJECT', scope_key:'PROJECT', control_action:'RESUME', reason:'other', actor_user_id:'u2', actor_capability:'admin.manage', correlation_id:null, created_at:'2026-09-09T00:00:00Z' },
  ] },
  async listRecentBudgetAdmissions() { return [
    { id:'a1', project_id:projectId, policy_version_id:'b1', correlation_id:'11111111-1111-4111-8111-111111111111', admitted_at:'2026-09-09T01:00:00Z' },
    { id:'a2', project_id:otherProjectId, policy_version_id:'b2', correlation_id:'22222222-2222-4222-8222-222222222222', admitted_at:'2026-09-09T01:00:00Z' },
  ] },
  async listRecentBudgetConcurrencyLeases() { return [
    { id:'l1', admission_id:'a1', project_id:projectId, policy_version_id:'b1', correlation_id:'11111111-1111-4111-8111-111111111111', acquired_at:'2026-09-09T01:00:00Z', expires_at:'2099-09-09T01:05:00Z', released_at:null },
    { id:'l2', admission_id:'a-expired', project_id:projectId, policy_version_id:'b1', correlation_id:'33333333-3333-4333-8333-333333333333', acquired_at:'2020-09-09T01:00:00Z', expires_at:'2020-09-09T01:05:00Z', released_at:null },
    { id:'l3', admission_id:'a-released', project_id:projectId, policy_version_id:'b1', correlation_id:'44444444-4444-4444-8444-444444444444', acquired_at:'2026-09-09T01:00:00Z', expires_at:'2099-09-09T01:05:00Z', released_at:'2026-09-09T01:01:00Z' },
    { id:'l4', admission_id:'a2', project_id:otherProjectId, policy_version_id:'b2', correlation_id:'22222222-2222-4222-8222-222222222222', acquired_at:'2026-09-09T01:00:00Z', expires_at:'2099-09-09T01:05:00Z', released_at:null },
  ] },
  async listEffectiveModelPricing() { return [
    pricingRow,
    { ...pricingRow, id:'p2', project_id:otherProjectId, model_id:'other-model' },
  ] },
})

const state = await stateReader.read(projectId)
assert.equal(state.budgets.length, 1)
assert.equal(state.executionControls.length, 1)
assert.equal(state.executionControlEvents.length, 1)
assert.equal(state.budgetAdmissions.length, 1)
assert.equal(state.budgetConcurrencyLeases.length, 3)
assert.equal(state.activeBudgetConcurrencyLeases.length, 1)
assert.equal(state.activeBudgetConcurrencyLeases[0].id, 'l1')
assert.equal(state.modelPricingAuthorities.length, 1)
assert.equal(state.modelPricingAuthorities[0].id, 'p1')
assert.equal(state.counts.effectiveBudgets, 1)
assert.equal(state.counts.enabledBudgets, 1)
assert.equal(state.counts.killedScopes, 1)
assert.equal(state.counts.runningScopes, 0)
assert.equal(state.counts.recentBudgetAdmissions, 1)
assert.equal(state.counts.activeBudgetConcurrencyLeases, 1)
assert.equal(state.counts.effectiveModelPricingAuthorities, 1)
assert.deepEqual(state.projectOutputBudget, { status:'READY', policyId:'b1', maxOutputTokens:500 })
assert.equal(state.controls.budgetMutationEnabled, false)
assert.equal(state.controls.emergencyMutationEnabled, false)
assert.equal(state.controls.admissionMutationEnabled, false)
assert.equal(state.controls.pricingMutationEnabled, false)
assert.equal(state.controls.runtimeCostEnforcementEnabled, false)

assert.deepEqual(projectOutputBudgetReadiness([]), { status:'NOT_CONFIGURED', policyId:null, maxOutputTokens:null })
assert.deepEqual(projectOutputBudgetReadiness([{ ...projectBudget, enabled:false }]), { status:'DISABLED', policyId:'b1', maxOutputTokens:null })
assert.deepEqual(projectOutputBudgetReadiness([{ ...projectBudget, max_output_tokens_per_request:null }]), { status:'NO_OUTPUT_LIMIT', policyId:'b1', maxOutputTokens:null })
assert.deepEqual(projectOutputBudgetReadiness([{ ...projectBudget, scope_type:'AI_SYSTEM', scope_key:'system-1' }]), { status:'NOT_CONFIGURED', policyId:null, maxOutputTokens:null }, 'AI_SYSTEM budget must not be treated as project output-budget authority')
assert.deepEqual(projectOutputBudgetReadiness([{ ...projectBudget, scope_type:'AGENT', scope_key:'agent-1' }]), { status:'NOT_CONFIGURED', policyId:null, maxOutputTokens:null }, 'AGENT budget must not be treated as project output-budget authority')
await assert.rejects(() => stateReader.read('   '), /projectId is required/)
console.log('Resource-control Command Center budget, admission, lease, pricing-authority, and project readiness checks passed.')
