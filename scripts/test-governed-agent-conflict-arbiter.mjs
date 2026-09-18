import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'

const { arbitrateGovernedAgentConflict } = await import('../lib/agents/governed-agent-conflict-arbiter.ts')

const consensus = arbitrateGovernedAgentConflict({
  correlationId: 'corr-1',
  scopeKey: 'dataset:customers',
  positions: [
    {
      agentKey: 'data_quality_agent',
      statement: 'A freshness delay caused the observed quality degradation.',
      evidenceRefs: ['dq-rule-1', 'freshness-1'],
      evidenceStrength: 'HIGH',
    },
    {
      agentKey: 'investigator_agent',
      statement: 'A freshness delay caused the observed quality degradation',
      evidenceRefs: ['incident-1', 'profile-run-1'],
      evidenceStrength: 'HIGH',
    },
  ],
})
assert.equal(consensus.status, 'CONSENSUS')
assert.equal(consensus.requiresHumanReview, false)
assert.equal(consensus.autoResolveAllowed, false)
assert.equal(consensus.authorityExpansionAllowed, false)
assert.ok(consensus.consensusStatement)

const conflict = arbitrateGovernedAgentConflict({
  correlationId: 'corr-2',
  scopeKey: 'dataset:orders',
  positions: [
    {
      agentKey: 'investigator_agent',
      statement: 'The upstream schema change is the probable cause.',
      evidenceRefs: ['lineage-1', 'profile-2'],
      evidenceStrength: 'HIGH',
    },
    {
      agentKey: 'architect_agent',
      statement: 'The downstream transformation is the probable cause.',
      evidenceRefs: ['mapping-1', 'contract-1'],
      evidenceStrength: 'HIGH',
    },
  ],
})
assert.equal(conflict.status, 'CONFLICT_REQUIRES_REVIEW')
assert.equal(conflict.requiresHumanReview, true)
assert.equal(conflict.consensusStatement, null)
assert.equal(conflict.positions.length, 2)
assert.ok(conflict.reasons.some((reason) => reason.includes('does not select a winner')))

const single = arbitrateGovernedAgentConflict({
  correlationId: 'corr-3',
  scopeKey: 'incident:123',
  positions: [{
    agentKey: 'support_agent',
    statement: 'Retrying the governed profiling job may resolve the transient execution failure.',
    evidenceRefs: ['run-123'],
    evidenceStrength: 'MEDIUM',
  }],
})
assert.equal(single.status, 'INSUFFICIENT_CORROBORATION')
assert.equal(single.requiresHumanReview, false)
assert.equal(single.autoResolveAllowed, false)

assert.throws(() => arbitrateGovernedAgentConflict({
  correlationId: 'corr-4',
  scopeKey: 'dataset:x',
  positions: [
    {
      agentKey: 'investigator_agent',
      statement: 'Cause A',
      evidenceRefs: ['same'],
      evidenceStrength: 'HIGH',
    },
    {
      agentKey: 'investigator_agent',
      statement: 'Cause A',
      evidenceRefs: ['different'],
      evidenceStrength: 'HIGH',
    },
  ],
}), /Duplicate governed agent position/)

assert.throws(() => arbitrateGovernedAgentConflict({
  correlationId: 'corr-5',
  scopeKey: 'dataset:x',
  positions: [{
    agentKey: 'architect_agent',
    statement: 'Cause A',
    evidenceRefs: [],
    evidenceStrength: 'LOW',
  }],
}), /At least one evidence reference is required/)

assert.throws(() => arbitrateGovernedAgentConflict({
  correlationId: ' ',
  scopeKey: 'dataset:x',
  positions: [{
    agentKey: 'architect_agent',
    statement: 'Cause A',
    evidenceRefs: ['evidence-1'],
    evidenceStrength: 'LOW',
  }],
}), /correlationId is required/)

console.log('Governed conflict arbitration preserves competing evidence, only recognizes exact normalized consensus, and never auto-resolves disagreement.')
