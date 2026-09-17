import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { GOVERNED_AGENT_KEYS, getGovernedAgentPolicy } = await import('../lib/agents/governed-agent-registry.ts')
const {
  proposeGovernedSkillImprovements,
  proposeGovernedSkillImprovementsFromScorecard,
} = await import('../lib/agents/governed-skill-improvement-proposals.ts')
const { evaluateGovernedSkillPromotion } = await import('../lib/agents/governed-skill-promotion-gate.ts')
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

const scorecardProposals = proposeGovernedSkillImprovementsFromScorecard({
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  metrics: [
    {
      evaluationType: 'AGENT_SKILL',
      capability: 'agent_skill:investigator_agent:incident_root_cause_analysis',
      metricName: 'grounding',
      sampleCount: 5,
      scoredCount: 5,
      passCount: 3,
      failCount: 2,
      averageScore: 0.6,
      evidenceResultIds: ['grounding-1', 'grounding-2'],
      lastObservedAt: '2026-09-18T00:00:00Z',
    },
    {
      evaluationType: 'AGENT_SKILL',
      capability: 'agent_skill:investigator_agent:incident_root_cause_analysis',
      metricName: 'evidence_sufficiency',
      sampleCount: 5,
      scoredCount: 5,
      passCount: 4,
      failCount: 1,
      averageScore: 0.8,
      evidenceResultIds: ['evidence-1'],
      lastObservedAt: '2026-09-18T00:00:00Z',
    },
    {
      evaluationType: 'AGENT_SKILL',
      capability: 'agent_skill:investigator_agent:incident_root_cause_analysis',
      metricName: 'correctness',
      sampleCount: 3,
      scoredCount: 3,
      passCount: 3,
      failCount: 0,
      averageScore: 1,
      evidenceResultIds: ['correctness-1'],
      lastObservedAt: '2026-09-18T00:00:00Z',
    },
  ],
})
assert.equal(scorecardProposals.length, 1)
assert.equal(scorecardProposals[0]?.category, 'EVIDENCE_GROUNDING')
assert.deepEqual(scorecardProposals[0]?.evidenceDimensions.sort(), ['evidence_sufficiency', 'grounding'])
assert.deepEqual(scorecardProposals[0]?.evidenceRefs.sort(), ['evidence-1', 'grounding-1', 'grounding-2'])
assert.ok(scorecardProposals[0]?.rationale.some((value) => value.includes('2 of 5 scored grounding evaluations failed')))
assert.equal(scorecardProposals[0]?.mayAutoApply, false)
assert.equal(scorecardProposals[0]?.requiresHumanReview, true)

const benchmark = {
  benchmarkId: 'benchmark-1',
  evaluatorId: 'independent-evaluation-service',
  evaluatorType: 'ADVERSARIAL_SUITE',
  candidateVersion: '1.1',
  baselineVersion: '1.0',
  caseCount: 40,
  baselineScore: 0.82,
  candidateScore: 0.9,
  authorityViolations: 0,
  adversarialFailures: 0,
  evidenceRefs: ['benchmark-result-1', 'benchmark-result-2'],
}

const reviewEligible = evaluateGovernedSkillPromotion({
  proposal: scorecardProposals[0],
  currentVersion: '1.0',
  candidateVersion: '1.1',
  benchmark,
})
assert.equal(reviewEligible.status, 'ELIGIBLE_FOR_HUMAN_REVIEW')
assert.equal(reviewEligible.automaticPromotionAllowed, false)
assert.equal(reviewEligible.automaticAuthorityExpansionAllowed, false)
assert.equal(reviewEligible.rollbackRequired, true)
assert.equal(reviewEligible.currentAuthorizationRequiredAtRelease, true)

const approved = evaluateGovernedSkillPromotion({
  proposal: scorecardProposals[0],
  currentVersion: '1.0',
  candidateVersion: '1.1',
  benchmark,
  review: {
    reviewerId: 'reviewer-1',
    decision: 'APPROVE_CONTROLLED_RELEASE',
    rationale: 'Independent benchmark passed and no authority regression was observed.',
    reviewedAt: '2026-09-18T01:00:00Z',
    evidenceRef: 'human-review-1',
  },
})
assert.equal(approved.status, 'APPROVED_FOR_CONTROLLED_RELEASE')
assert.equal(approved.automaticPromotionAllowed, false)
assert.equal(approved.reviewEvidenceRef, 'human-review-1')

const rejected = evaluateGovernedSkillPromotion({
  proposal: scorecardProposals[0],
  currentVersion: '1.0',
  candidateVersion: '1.1',
  benchmark,
  review: {
    reviewerId: 'reviewer-2',
    decision: 'REJECT',
    rationale: 'Review found an unresolved product risk.',
    reviewedAt: '2026-09-18T01:00:00Z',
    evidenceRef: 'human-review-2',
  },
})
assert.equal(rejected.status, 'REJECTED')
assert.equal(rejected.automaticPromotionAllowed, false)

const regressed = evaluateGovernedSkillPromotion({
  proposal: scorecardProposals[0],
  currentVersion: '1.0',
  candidateVersion: '1.1',
  benchmark: { ...benchmark, candidateScore: 0.79, authorityViolations: 1, adversarialFailures: 1 },
})
assert.equal(regressed.status, 'NOT_READY')
assert.ok(regressed.reasons.includes('CANDIDATE_SCORE_BELOW_THRESHOLD'))
assert.ok(regressed.reasons.includes('CANDIDATE_REGRESSES_BASELINE'))
assert.ok(regressed.reasons.includes('AUTHORITY_VIOLATION_DETECTED'))
assert.ok(regressed.reasons.includes('ADVERSARIAL_FAILURE_DETECTED'))

assert.throws(() => evaluateGovernedSkillPromotion({
  proposal: scorecardProposals[0],
  currentVersion: '1.0',
  candidateVersion: '1.1',
  benchmark: { ...benchmark, evaluatorId: 'investigator_agent' },
}), /evaluator must be independent/)

assert.throws(() => evaluateGovernedSkillPromotion({
  proposal: scorecardProposals[0],
  currentVersion: '1.0',
  candidateVersion: '1.0',
  benchmark: { ...benchmark, candidateVersion: '1.0' },
}), /candidateVersion must differ/)

assert.throws(() => evaluateGovernedSkillPromotion({
  proposal: scorecardProposals[0],
  currentVersion: '1.0',
  candidateVersion: '1.1',
  benchmark,
  review: {
    reviewerId: 'reviewer-3',
    decision: 'APPROVE_CONTROLLED_RELEASE',
    rationale: 'Looks acceptable.',
    reviewedAt: '2026-09-18T01:00:00Z',
    evidenceRef: 'benchmark-result-1',
  },
}), /human review evidence must be distinct/)

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

function metric(overrides = {}) {
  return {
    evaluationType: 'AGENT_SKILL',
    capability: 'agent_skill:investigator_agent:incident_root_cause_analysis',
    metricName: 'grounding',
    sampleCount: 1,
    scoredCount: 1,
    passCount: 0,
    failCount: 1,
    averageScore: 0,
    evidenceResultIds: [],
    lastObservedAt: null,
    ...overrides,
  }
}

assert.throws(() => proposeGovernedSkillImprovementsFromScorecard({
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  metrics: [metric({ capability: 'agent_skill:support_agent:incident_root_cause_analysis' })],
}), /does not match governed capability/)

assert.throws(() => proposeGovernedSkillImprovementsFromScorecard({
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  metrics: [metric({ metricName: 'cost' })],
}), /outside the excellence contract/)

assert.throws(() => proposeGovernedSkillImprovementsFromScorecard({
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  metrics: [metric({ sampleCount: 1, scoredCount: 2 })],
}), /scored count exceeds sample count/)

assert.throws(() => proposeGovernedSkillImprovementsFromScorecard({
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  metrics: [metric({ sampleCount: 2, scoredCount: 1, passCount: 1, failCount: 1 })],
}), /pass\/fail counts exceed scored count/)

for (const averageScore of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => proposeGovernedSkillImprovementsFromScorecard({
    agentKey: 'investigator_agent',
    skillKey: 'incident_root_cause_analysis',
    metrics: [metric({ averageScore })],
  }), /average score must be between 0 and 1/)
}

assert.throws(() => proposeGovernedSkillImprovementsFromScorecard({
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  metrics: [metric({ sampleCount: 1, scoredCount: 0, passCount: 0, failCount: 0, averageScore: 0.5 })],
}), /average score requires scored samples/)

console.log('Governed skill improvement proposals and promotion gates require consistent agent-scoped evidence, independent benchmarks, human review, rollback, and no autonomous promotion.')
