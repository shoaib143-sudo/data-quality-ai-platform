import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { planGovernedHandoffs } = await import('../lib/agents/governed-handoff-planner.ts')
const { getGovernedAgentPolicy } = await import('../lib/agents/governed-agent-registry.ts')
const { getAgentExcellenceContract } = await import('../lib/agents/agent-excellence-contracts.ts')
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

const investigatorPlan = planGovernedHandoffs({
  sourceAgentKey: 'investigator_agent',
  objective: 'Investigate the incident and determine whether lineage or a quality control failure explains the downstream effect.',
  unresolvedEvidenceDomains: ['lineage', 'quality_rule_run'],
  handoffsAlreadyUsed: 0,
})
assert.equal(investigatorPlan.unresolvedReason, null)
assert.equal(investigatorPlan.recommendations[0]?.targetAgentKey, 'data_quality_agent')
assert.ok(investigatorPlan.recommendations.some((recommendation) => recommendation.targetAgentKey === 'architect_agent'))
assert.ok(investigatorPlan.recommendations.every((recommendation) => getGovernedAgentPolicy('investigator_agent').handoffTargets.includes(recommendation.targetAgentKey)))
assert.ok(investigatorPlan.recommendations.every((recommendation) => recommendation.requiresFreshAuthorization === true))
assert.ok(investigatorPlan.recommendations.every((recommendation) => recommendation.autoExecute === false))
assert.ok(investigatorPlan.recommendations.length <= getAgentExcellenceContract('investigator_agent').recursionBudget.maxHandoffs)
assert.equal(investigatorPlan.recommendations.some((recommendation) => recommendation.targetAgentKey === 'executive_agent'), false)

const capped = planGovernedHandoffs({
  sourceAgentKey: 'investigator_agent',
  objective: 'Investigate incident quality lineage governance support profile ownership and remediation.',
  unresolvedEvidenceDomains: ['lineage', 'quality_rule_run', 'policy', 'profile_run'],
  handoffsAlreadyUsed: 0,
  maxRecommendations: 1,
})
assert.equal(capped.recommendations.length, 1)
assert.equal(capped.recommendations[0]?.rank, 1)

const exhausted = planGovernedHandoffs({
  sourceAgentKey: 'investigator_agent',
  objective: 'Need lineage help',
  unresolvedEvidenceDomains: ['lineage'],
  handoffsAlreadyUsed: getAgentExcellenceContract('investigator_agent').recursionBudget.maxHandoffs,
})
assert.equal(exhausted.unresolvedReason, 'NO_HANDOFF_BUDGET')
assert.deepEqual(exhausted.recommendations, [])

const noMatch = planGovernedHandoffs({
  sourceAgentKey: 'executive_agent',
  objective: 'Summarize a topic with no specialist signal',
  unresolvedEvidenceDomains: ['unmodeled_domain'],
})
assert.equal(noMatch.unresolvedReason, 'NO_ALLOWED_TARGET_MATCH')
assert.deepEqual(noMatch.recommendations, [])

for (const invalidUsed of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => planGovernedHandoffs({
    sourceAgentKey: 'investigator_agent',
    objective: 'Need lineage help',
    unresolvedEvidenceDomains: ['lineage'],
    handoffsAlreadyUsed: invalidUsed,
  }), /handoffsAlreadyUsed must be a non-negative integer/)
}

for (const invalidMax of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => planGovernedHandoffs({
    sourceAgentKey: 'investigator_agent',
    objective: 'Need lineage help',
    unresolvedEvidenceDomains: ['lineage'],
    maxRecommendations: invalidMax,
  }), /maxRecommendations must be a positive integer/)
}

console.log('Per-agent excellence runtime, bounded recursion, and fail-closed governed handoff recommendations reject malformed budget inputs and remain authority bounded.')
