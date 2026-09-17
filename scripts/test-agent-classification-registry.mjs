import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { GOVERNED_AGENT_KEYS, getGovernedAgentPolicy } = await import('../lib/agents/governed-agent-registry.ts')
const source = fs.readFileSync('lib/agents/agent-classification-registry.ts', 'utf8')

for (const agentKey of GOVERNED_AGENT_KEYS) {
  assert.ok(source.includes(`${agentKey}: {`) || source.includes(`agentKey: '${agentKey}'`), `missing ADR-007 classification for ${agentKey}`)
  const policy = getGovernedAgentPolicy(agentKey)
  assert.ok(source.includes(policy.role), `classification registry does not preserve operational role ${policy.role}`)
}

for (const dimension of [
  'decisionArchitecture',
  'reasoningArchitecture',
  'operationalRole',
  'controlPattern',
  'autonomyLevel',
  'humanGovernanceModel',
  'humanGovernanceBoundary',
  'stateModel',
  'triggerModel',
  'topology',
  'coordinationPattern',
  'knowledgeArchitecture',
  'toolingModel',
  'learningAdaptation',
  'determinismModel',
  'explainabilityModel',
  'riskGovernancePosture',
  'environmentObservability',
  'recoveryValidationBehaviour',
  'evidenceBasis',
]) {
  assert.ok(source.includes(dimension), `missing ADR-007 dimension: ${dimension}`)
}

assert.ok(source.includes("classificationVersion: 'ADR-007-v1'"))
assert.ok(source.includes("classification.humanGovernanceModel.current === 'MIXED_BY_RISK_TIER'"))
assert.ok(source.includes('MIXED_BY_RISK_TIER classification requires an explicit human-governance boundary'))
assert.ok(source.includes('governance or remediation mutation requires explicit approval according to policy'))
assert.ok(source.includes("classification.autonomyLevel.current !== 'READ_ONLY'"))
assert.ok(source.includes("classification.controlPattern.current !== 'ADVISORY_ONLY'"))
assert.ok(source.includes("classification.toolingModel.current !== 'READ_ONLY_TOOLS'"))
assert.ok(source.includes("classification.decisionArchitecture.current === 'LEARNING'"))
assert.ok(source.includes("classification.autonomyLevel.current === 'FULL_AUTONOMY'"))
assert.equal(source.includes("current: 'GOAL_BASED'"), false, 'do not claim goal-based architecture without implemented planning evidence')
assert.equal(source.includes("current: 'ONLINE_LEARNING'"), false, 'do not claim online learning without validated adaptive behavior')

console.log('ADR-007 canonical classifications, mixed-risk boundary, conservative current state, and read-only authority alignment verified.')
