import assert from 'node:assert/strict'
import fs from 'node:fs'

const { GOVERNED_AGENT_KEYS, getGovernedAgentPolicy } = await import('../lib/agents/governed-agent-registry.ts')
const source = fs.readFileSync('lib/agents/governed-skill-registry.ts', 'utf8')

for (const key of GOVERNED_AGENT_KEYS) {
  assert.ok(source.includes(`'${key}'`), `governed skill registry does not reference canonical agent ${key}`)
}

for (const required of [
  'requiredToolsByAgent',
  'inputContract',
  'outputContract',
  'evidenceRequired',
  'mayMutate',
  'validateGovernedSkillRegistry',
  'profile_evidence_analysis',
  'profile_gap_detection',
  'quality_rule_analysis',
  'quality_remediation_proposal',
  'stewardship_gap_analysis',
  'governance_evidence_synthesis',
  'lineage_impact_analysis',
  'incident_root_cause_analysis',
  'executive_materiality_analysis',
  'support_case_investigation',
]) {
  assert.ok(source.includes(required), `missing governed skill invariant: ${required}`)
}

assert.ok(source.includes("eligibleAgents: ['data_quality_agent']"))
assert.ok(source.includes("data_quality_agent: ['quality.remediation.propose']"))
assert.ok(source.includes('if (skill.mayMutate && policy.mutationBoundary === \'READ_ONLY\')'))
assert.ok(source.includes('if (!policy.toolAllowlist.includes(toolKey))'))

for (const key of GOVERNED_AGENT_KEYS) {
  const policy = getGovernedAgentPolicy(key)
  assert.ok(policy.toolAllowlist.length > 0, `canonical agent must retain a deterministic tool allowlist: ${key}`)
}

console.log('Governed reusable skill registry, tool authorization inheritance, and mutation-boundary safeguards verified.')
