import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/agents/runtime/agent-excellence-runtime.ts', 'utf8')
const contracts = fs.readFileSync('lib/agents/agent-excellence-contracts.ts', 'utf8')
const bounded = fs.readFileSync('lib/agents/runtime/bounded-recursion-runtime.ts', 'utf8')

for (const required of [
  'getAgentExcellenceContract(options.agentKey)',
  'contract.recursionBudget',
  'runBoundedRecursion',
  'agentKey: options.agentKey',
  'maxIterations: budget.maxIterations',
  'maxToolCalls: budget.maxToolCalls',
  'maxHandoffs: budget.maxHandoffs',
  'maxRuntimeMs: budget.maxRuntimeMs',
  'stopConfidence: budget.stopConfidence',
]) {
  assert.ok(source.includes(required), `missing agent excellence runtime invariant: ${required}`)
}

assert.ok(contracts.includes("investigator_agent: {"))
assert.ok(contracts.includes('maxIterations: 8'))
assert.ok(contracts.includes('maxToolCalls: 25'))
assert.ok(bounded.includes("'RUNTIME_BUDGET_EXHAUSTED'"))
assert.ok(bounded.includes("'NO_MATERIAL_IMPROVEMENT'"))
assert.ok(bounded.includes("'CONFIDENCE_REACHED'"))

console.log('Per-agent excellence runtime is bound to canonical recursion contracts and bounded execution semantics.')
