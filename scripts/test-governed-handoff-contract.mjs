import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'

const { createGovernedHandoffEnvelope } = await import('../lib/agents/governed-handoff-contract.ts')

const envelope = createGovernedHandoffEnvelope({
  correlationId: 'corr-1',
  sourceAgentKey: 'investigator_agent',
  targetAgentKey: 'architect_agent',
  objective: 'Validate downstream lineage blast radius for the suspected schema change.',
  establishedFacts: ['A schema change occurred before the incident.'],
  hypotheses: ['The change may affect downstream transformations.'],
  unresolvedQuestions: ['Which downstream contracts depend on the changed field?'],
  evidenceRefs: ['incident-1', 'lineage-1'],
  requestedSkill: 'lineage_impact_analysis',
  confidence: 'MEDIUM',
})

assert.equal(envelope.contractVersion, '1.0')
assert.equal(envelope.sourceAgentKey, 'investigator_agent')
assert.equal(envelope.targetAgentKey, 'architect_agent')
assert.equal(envelope.requiresFreshAuthorization, true)
assert.equal(envelope.autoExecute, false)
assert.equal(envelope.authorityContext.sourceMutationBoundary, 'READ_ONLY')
assert.equal(envelope.authorityContext.targetMutationBoundary, 'READ_ONLY')
assert.deepEqual(envelope.evidenceRefs, ['incident-1', 'lineage-1'])

assert.throws(() => createGovernedHandoffEnvelope({
  correlationId: 'corr-2',
  sourceAgentKey: 'investigator_agent',
  targetAgentKey: 'executive_agent',
  objective: 'Escalate directly',
  evidenceRefs: ['incident-2'],
}), /not allowed by policy/)

assert.throws(() => createGovernedHandoffEnvelope({
  correlationId: 'corr-3',
  sourceAgentKey: 'steward_agent',
  targetAgentKey: 'steward_agent',
  objective: 'Self handoff',
  evidenceRefs: ['issue-1'],
}), /must differ from source agent/)

assert.throws(() => createGovernedHandoffEnvelope({
  correlationId: 'corr-4',
  sourceAgentKey: 'data_quality_agent',
  targetAgentKey: 'investigator_agent',
  objective: 'Investigate',
  evidenceRefs: [],
}), /At least one evidence reference is required/)

assert.throws(() => createGovernedHandoffEnvelope({
  correlationId: 'corr-5',
  sourceAgentKey: 'data_quality_agent',
  targetAgentKey: 'investigator_agent',
  objective: 'Investigate',
  evidenceRefs: ['same', 'same'],
}), /evidenceRefs must be unique/)

assert.throws(() => createGovernedHandoffEnvelope({
  correlationId: ' ',
  sourceAgentKey: 'data_quality_agent',
  targetAgentKey: 'investigator_agent',
  objective: 'Investigate',
  evidenceRefs: ['rule-1'],
}), /correlationId is required/)

console.log('Governed handoff contract enforces canonical targets, evidence provenance, fresh authorization, and non-executing typed envelopes.')
