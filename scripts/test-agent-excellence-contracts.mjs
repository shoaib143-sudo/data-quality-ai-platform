import assert from 'node:assert/strict'

const {
  AGENT_EXCELLENCE_CONTRACTS,
  getAgentExcellenceContract,
  validateAgentExcellenceContracts,
} = await import('../lib/agents/agent-excellence-contracts.ts')
const { GOVERNED_AGENT_KEYS, getGovernedAgentPolicy } = await import('../lib/agents/governed-agent-registry.ts')

validateAgentExcellenceContracts()

assert.deepEqual(
  Object.keys(AGENT_EXCELLENCE_CONTRACTS).sort(),
  [...GOVERNED_AGENT_KEYS].sort(),
  'excellence contracts must match the canonical governed-agent portfolio exactly',
)

for (const key of GOVERNED_AGENT_KEYS) {
  const contract = getAgentExcellenceContract(key)
  const policy = getGovernedAgentPolicy(key)

  assert.equal(contract.agentKey, key)
  assert.equal(contract.maySelfPromoteChanges, false)
  assert.equal(contract.mayProposeSkillImprovements, true)
  assert.ok(contract.mission.length > 20)
  assert.ok(contract.requiredEvaluationDimensions.includes('correctness'))
  assert.ok(contract.requiredEvaluationDimensions.includes('grounding'))
  assert.ok(contract.requiredEvaluationDimensions.includes('authority_compliance'))
  assert.ok(contract.requiredEvaluationDimensions.includes('evidence_sufficiency'))
  assert.ok(contract.recursionBudget.maxIterations >= 1)
  assert.ok(contract.recursionBudget.maxToolCalls >= contract.recursionBudget.maxIterations)
  assert.ok(contract.recursionBudget.maxRuntimeMs > 0)
  assert.ok(contract.recursionBudget.stopConfidence > 0 && contract.recursionBudget.stopConfidence <= 1)
  assert.ok(contract.stopConditions.some((condition) => condition.includes('recursion budget exhausted')))

  if (policy.mutationBoundary === 'READ_ONLY') {
    assert.equal(policy.authority, 'READ_ONLY_ADVISORY')
  }
}

const investigator = getAgentExcellenceContract('investigator_agent')
assert.equal(investigator.recursionMode, 'INVESTIGATIVE')
assert.ok(investigator.recursionBudget.maxIterations > getAgentExcellenceContract('executive_agent').recursionBudget.maxIterations)
assert.ok(investigator.requiredEvaluationDimensions.includes('handoff_quality'))
assert.ok(investigator.requiredEvaluationDimensions.includes('outcome_quality'))

const dq = getAgentExcellenceContract('data_quality_agent')
assert.equal(dq.recursionMode, 'OUTCOME')
assert.ok(dq.escalationConditions.some((condition) => condition.includes('approval')))

const steward = getAgentExcellenceContract('steward_agent')
assert.equal(steward.recursionMode, 'GOVERNANCE')
assert.ok(steward.escalationConditions.some((condition) => condition.includes('authoritative governance change')))

console.log('Agent excellence contracts, bounded recursion, evaluation requirements, and self-promotion prohibition verified.')
