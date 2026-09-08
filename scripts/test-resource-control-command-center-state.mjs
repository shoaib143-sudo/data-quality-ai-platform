import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'

const source = fs.readFileSync('lib/ai/resource-control-command-center-state.ts', 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(`(function(require,module,exports){${js}\n})(require,module,module.exports)`, { require, module }, { filename: 'resource-control-command-center-state.js' })
const { GovernedResourceControlState } = module.exports

const projectId = 'project-a'
const otherProjectId = 'project-b'
const stateReader = new GovernedResourceControlState({
  async listEffectiveBudgets() { return [
    { id:'b1', project_id:projectId, scope_type:'PROJECT', scope_key:'PROJECT', enabled:true, max_input_tokens_per_request:1000, max_output_tokens_per_request:500, max_cost_usd_per_request:'1.25', max_cost_usd_per_day:'10', max_requests_per_minute:20, max_concurrent_executions:2, reviewer_user_id:'u1', reviewer_capability:'policy.approve', review_note:'approved budget', created_at:'2026-09-09T00:00:00Z' },
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
})

const state = await stateReader.read(projectId)
assert.equal(state.budgets.length, 1)
assert.equal(state.executionControls.length, 1)
assert.equal(state.executionControlEvents.length, 1)
assert.equal(state.counts.effectiveBudgets, 1)
assert.equal(state.counts.enabledBudgets, 1)
assert.equal(state.counts.killedScopes, 1)
assert.equal(state.counts.runningScopes, 0)
assert.equal(state.controls.budgetMutationEnabled, false)
assert.equal(state.controls.emergencyMutationEnabled, false)
await assert.rejects(() => stateReader.read('   '), /projectId is required/)
console.log('Resource-control Command Center behavioral checks passed.')
