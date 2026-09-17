import assert from 'node:assert/strict'
import fs from 'node:fs'

const { GOVERNED_AGENT_KEYS, getGovernedAgentPolicy } = await import('../lib/agents/governed-agent-registry.ts')
const source = fs.readFileSync('lib/agents/agent-excellence-contracts.ts', 'utf8')

for (const key of GOVERNED_AGENT_KEYS) {
  assert.ok(source.includes(`${key}: {`), `missing excellence contract for ${key}`)
  const policy = getGovernedAgentPolicy(key)
  if (policy.mutationBoundary === 'READ_ONLY') {
    assert.equal(policy.authority, 'READ_ONLY_ADVISORY')
  }
}

for (const required of [
  "maySelfPromoteChanges: false",
  "mayProposeSkillImprovements: true",
  "'correctness'",
  "'grounding'",
  "'authority_compliance'",
  "'evidence_sufficiency'",
  'recursion budget exhausted',
  "recursionMode: 'INVESTIGATIVE'",
  "recursionMode: 'OUTCOME'",
  "recursionMode: 'GOVERNANCE'",
  'maxIterations: 8',
  'maxToolCalls: 25',
  'validateAgentExcellenceContracts',
]) {
  assert.ok(source.includes(required), `missing agent excellence invariant: ${required}`)
}

assert.equal((source.match(/maySelfPromoteChanges: false/g) ?? []).length >= GOVERNED_AGENT_KEYS.length, true)
assert.equal((source.match(/mayProposeSkillImprovements: true/g) ?? []).length >= GOVERNED_AGENT_KEYS.length, true)

console.log('Agent excellence contracts, bounded recursion, evaluation requirements, and self-promotion prohibition verified.')
