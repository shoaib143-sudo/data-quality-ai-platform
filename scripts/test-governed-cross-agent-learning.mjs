import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const {
  buildGovernedCrossAgentLearningProposals,
  crossAgentPatternKey,
} = await import('../lib/agents/governed-cross-agent-learning.ts')

const evidence = (overrides = {}) => ({
  projectId: 'project-1',
  candidateId: 'candidate-a',
  agentKey: 'steward_agent',
  skillKey: 'stewardship_gap_analysis',
  useCaseKey: 'steward_agent:stewardship_gap_analysis:customer-criticality',
  reusableLesson: 'Confirm governed ownership evidence before escalating a criticality gap.',
  reviewStatus: 'APPROVED',
  productionEligible: true,
  ...overrides,
})

assert.equal(
  crossAgentPatternKey('steward_agent:stewardship_gap_analysis:customer-criticality'),
  'customer-criticality',
)

const proposals = buildGovernedCrossAgentLearningProposals({
  projectId: 'project-1',
  cases: [
    evidence(),
    evidence({
      candidateId: 'candidate-b',
      agentKey: 'governance_analyst_agent',
      skillKey: 'governance_evidence_synthesis',
      useCaseKey: 'governance_analyst_agent:governance_evidence_synthesis:customer-criticality',
      reusableLesson: 'Require current policy and ownership evidence for customer-criticality analysis.',
    }),
  ],
})

assert.equal(proposals.length, 1)
const proposal = proposals[0]
assert.equal(proposal.proposalType, 'CROSS_AGENT_PATTERN')
assert.equal(proposal.patternKey, 'customer-criticality')
assert.deepEqual(proposal.sourceCandidateIds, ['candidate-a', 'candidate-b'])
assert.deepEqual(proposal.sourceAgentKeys, ['governance_analyst_agent', 'steward_agent'])
assert.equal(proposal.status, 'PROPOSED')
assert.equal(proposal.requiresDataGovernanceAdminReview, true)
assert.equal(proposal.mayAutoPromote, false)
assert.equal(proposal.mayAuthorizeAction, false)
assert.equal(proposal.mayModifyAgents, false)
assert.equal(proposal.mayExpandAuthority, false)
assert.equal(proposal.currentPolicyReevaluationRequired, true)

assert.deepEqual(buildGovernedCrossAgentLearningProposals({
  projectId: 'project-1',
  cases: [
    evidence(),
    evidence({ candidateId: 'candidate-b' }),
  ],
}), [], 'repeat cases from the same agent are not cross-agent learning')

assert.deepEqual(buildGovernedCrossAgentLearningProposals({
  projectId: 'project-1',
  cases: [
    evidence(),
    evidence({
      candidateId: 'candidate-b',
      agentKey: 'governance_analyst_agent',
      skillKey: 'governance_evidence_synthesis',
      reviewStatus: 'PENDING_REVIEW',
    }),
  ],
}), [], 'unreviewed source cases cannot produce a cross-agent proposal')

assert.deepEqual(buildGovernedCrossAgentLearningProposals({
  projectId: 'project-1',
  cases: [
    evidence(),
    evidence({
      candidateId: 'candidate-b',
      agentKey: 'governance_analyst_agent',
      skillKey: 'governance_evidence_synthesis',
      productionEligible: false,
    }),
  ],
}), [], 'non-production source evidence cannot produce a shared learning proposal')

assert.throws(() => buildGovernedCrossAgentLearningProposals({
  projectId: 'project-1',
  cases: [evidence(), evidence({ projectId: 'project-2', candidateId: 'candidate-b' })],
}), /cross-project/)

assert.throws(
  () => crossAgentPatternKey('not-a-governed-use-case-key'),
  /agent, skill, and focus/,
)

const source = fs.readFileSync('lib/agents/governed-cross-agent-learning.ts', 'utf8')
for (const invariant of [
  'requiresDataGovernanceAdminReview: true',
  'mayAutoPromote: false',
  'mayAuthorizeAction: false',
  'mayModifyAgents: false',
  'mayExpandAuthority: false',
  'currentPolicyReevaluationRequired: true',
]) {
  assert.ok(source.includes(invariant), `missing cross-agent learning boundary: ${invariant}`)
}
for (const forbidden of [
  'SELF_PROMOTE',
  'activate_learning_candidate',
  'transition_agent_version_lifecycle',
  'expand_tool_authority',
]) {
  assert.equal(source.includes(forbidden), false, `cross-agent proposal engine must not expose mutation authority: ${forbidden}`)
}

console.log('Cross-agent learning proposals require independent approved production-eligible evidence from at least two governed agents and remain non-authoritative.')
