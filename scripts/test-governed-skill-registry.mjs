import assert from 'node:assert/strict'
import fs from 'node:fs'

const { GOVERNED_AGENT_KEYS, getGovernedAgentPolicy } = await import('../lib/agents/governed-agent-registry.ts')
const { proposeGovernedSkillImprovements } = await import('../lib/agents/governed-skill-improvement-proposals.ts')
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

const proposals = proposeGovernedSkillImprovements({
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  observations: [
    { dimension: 'grounding', pass: false, score: 0, rationale: 'No incident evidence reference was retained.', evidenceRefs: ['eval-1'] },
    { dimension: 'evidence_sufficiency', pass: false, score: 0.2, rationale: 'Only one evidence family was present.', evidenceRefs: ['eval-2'] },
    { dimension: 'confidence_calibration', pass: false, score: 0, rationale: 'Probability was asserted without calibration evidence.', evidenceRefs: ['eval-3'] },
    { dimension: 'authority_compliance', pass: true, score: 1 },
  ],
})
assert.equal(proposals.length, 2)
const evidenceProposal = proposals.find((proposal) => proposal.category === 'EVIDENCE_GROUNDING')
assert.ok(evidenceProposal)
assert.deepEqual(evidenceProposal?.evidenceDimensions.sort(), ['evidence_sufficiency', 'grounding'])
assert.deepEqual(evidenceProposal?.evidenceRefs.sort(), ['eval-1', 'eval-2'])
for (const proposal of proposals) {
  assert.equal(proposal.status, 'PROPOSED')
  assert.equal(proposal.mayAutoApply, false)
  assert.equal(proposal.requiresHumanReview, true)
  assert.equal(proposal.requiredApproval, 'HUMAN_GOVERNANCE_REVIEW')
  assert.ok(proposal.prohibitedActions.includes('SELF_PROMOTE_TO_PRODUCTION'))
  assert.ok(proposal.prohibitedActions.includes('EXPAND_TOOL_AUTHORITY'))
}

assert.deepEqual(proposeGovernedSkillImprovements({
  agentKey: 'support_agent',
  skillKey: 'support_case_investigation',
  observations: [
    { dimension: 'grounding', pass: true, score: 1 },
    { dimension: 'authority_compliance', pass: true, score: 1 },
  ],
}), [])

assert.throws(() => proposeGovernedSkillImprovements({
  agentKey: 'executive_agent',
  skillKey: 'incident_root_cause_analysis',
  observations: [],
}), /not authorized/)

assert.throws(() => proposeGovernedSkillImprovements({
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  observations: [{ dimension: 'cost', pass: false, score: 0 }],
}), /outside the excellence contract/)

console.log('Governed reusable skill registry, tool authorization inheritance, mutation safeguards, and human-reviewed skill-improvement proposals verified.')
