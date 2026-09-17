import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { GOVERNED_AGENT_KEYS, getGovernedAgentPolicy } = await import('../lib/agents/governed-agent-registry.ts')
const { planGovernedSkills } = await import('../lib/agents/governed-skill-planner.ts')
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

const investigatorPlan = planGovernedSkills({
  agentKey: 'investigator_agent',
  objective: 'Diagnose the incident root cause and inspect lineage impact and profile gaps.',
  availableEvidenceDomains: ['incident', 'profile_run', 'lineage'],
})
assert.equal(investigatorPlan.unresolvedReason, null)
assert.equal(investigatorPlan.selected[0]?.skillKey, 'incident_root_cause_analysis')
assert.ok(investigatorPlan.selected.some((item) => item.skillKey === 'lineage_impact_analysis'))
for (const item of investigatorPlan.selected) {
  const policy = getGovernedAgentPolicy('investigator_agent')
  assert.ok(item.requiredTools.every((tool) => policy.toolAllowlist.includes(tool)))
  assert.equal(item.mayMutate, false)
}

const blockedRemediation = planGovernedSkills({
  agentKey: 'data_quality_agent',
  objective: 'Diagnose the quality failure and propose remediation to fix the violated rule.',
  allowMutatingSkills: false,
})
assert.ok(blockedRemediation.selected.some((item) => item.skillKey === 'quality_rule_analysis'))
assert.ok(blockedRemediation.rejected.some((item) => item.skillKey === 'quality_remediation_proposal' && item.reason === 'MUTATION_NOT_REQUESTED'))

const allowedRemediation = planGovernedSkills({
  agentKey: 'data_quality_agent',
  objective: 'Propose remediation for the quality failure.',
  allowMutatingSkills: true,
})
const remediation = allowedRemediation.selected.find((item) => item.skillKey === 'quality_remediation_proposal')
assert.ok(remediation)
assert.equal(remediation?.humanApprovalRequired, true)

const supportPlan = planGovernedSkills({
  agentKey: 'support_agent',
  objective: 'Troubleshoot this operational support case and inspect lineage impact.',
})
assert.ok(supportPlan.selected.some((item) => item.skillKey === 'support_case_investigation'))
assert.ok(supportPlan.selected.every((item) => item.mayMutate === false))

const noObjective = planGovernedSkills({ agentKey: 'architect_agent', objective: '   ' })
assert.equal(noObjective.unresolvedReason, 'EMPTY_OBJECTIVE')
assert.deepEqual(noObjective.selected, [])

console.log('Agent excellence contracts, bounded recursion, governed skill planning, authority checks, evaluation requirements, and self-promotion prohibition verified.')
