import assert from 'node:assert/strict'

const { GovernedLearningEngine } = await import('../lib/ai/learning-engine.ts')

const projectId = '479813aa-72a4-4b12-b72a-74da8d2419ce'
const engine = new GovernedLearningEngine({
  listLearningCases: async () => [
    {
      id: 'verified-case',
      project_id: projectId,
      source_agent_run_id: 'source-run',
      case_key: 'dq-learning:verified',
      source_kind: 'DATA_QUALITY_RECOMMENDATION_LEARNING',
      problem_type: 'DATA_QUALITY_RECOMMENDATION',
      decision_status: 'VERIFIED',
      outcome_status: 'VERIFIED',
      effectiveness: '1',
      confidence: '0.95',
      evidence: { source_id: 'learning-1' },
      status: 'ACTIVE',
      occurred_at: '2026-09-08T09:22:02Z',
    },
    {
      id: 'bootstrap-case',
      project_id: projectId,
      source_agent_run_id: null,
      case_key: 'bootstrap',
      source_kind: 'GOVERNANCE_REMEDIATION_KNOWLEDGE',
      problem_type: 'REFERENCE',
      decision_status: 'OBSERVED',
      outcome_status: 'WORKED',
      effectiveness: '1',
      confidence: '0.94',
      evidence: { metadata: { synthetic_bootstrap: true } },
      status: 'ACTIVE',
      occurred_at: '2026-09-04T21:04:31Z',
    },
  ],
  listSemanticMemories: async () => [
    {
      id: 'semantic-unvalidated',
      project_id: projectId,
      source_agent_run_id: 'semantic-run-1',
      memory_key: 'semantic:test:1',
      memory_type: 'SEMANTIC',
      content: { human_validated: false, observations: ['evidence-derived'] },
      confidence: '0.8',
      status: 'ACTIVE',
      promoted_at: '2026-09-05T00:41:09Z',
      expires_at: '2026-10-05T00:41:09Z',
    },
    {
      id: 'semantic-human-validated',
      project_id: projectId,
      source_agent_run_id: 'semantic-run-2',
      memory_key: 'semantic:test:2',
      memory_type: 'SEMANTIC',
      content: { human_validated: true, observations: ['reviewed'] },
      confidence: '0.9',
      status: 'ACTIVE',
      promoted_at: '2026-09-06T00:41:09Z',
      expires_at: null,
    },
  ],
})

const assessment = await engine.assess({ projectId: ` ${projectId} `, limit: 50 })
assert.equal(assessment.projectId, projectId)
assert.equal(assessment.verifiedOutcomeCandidates.length, 1)
assert.equal(assessment.verifiedOutcomeCandidates[0].id, 'verified-case')
assert.equal(assessment.verifiedOutcomeCandidates[0].status, 'VERIFIED_OUTCOME_CANDIDATE')
assert.equal(assessment.verifiedOutcomeCandidates[0].authoritative, false)
assert.deepEqual(assessment.verifiedOutcomeCandidates[0].blockers, ['AUTHORITY_PROOF_NOT_RECORDED'])
assert.equal('recommendation' in assessment.verifiedOutcomeCandidates[0], false)

assert.equal(assessment.semanticMemories.length, 2)
assert.equal(assessment.semanticMemories[0].id, 'semantic-human-validated')
assert.equal(assessment.semanticMemories[0].status, 'HUMAN_VALIDATED_SEMANTIC_CANDIDATE')
assert.equal(assessment.semanticMemories[0].humanValidated, true)
assert.equal(assessment.semanticMemories[0].authoritative, false)
assert.deepEqual(assessment.semanticMemories[0].blockers, ['AUTHORITY_PROOF_NOT_RECORDED'])
assert.equal(assessment.semanticMemories[1].status, 'DURABLE_UNVALIDATED_SEMANTIC')
assert.equal(assessment.semanticMemories[1].humanValidated, false)
assert.deepEqual(assessment.semanticMemories[1].blockers, ['HUMAN_VALIDATION_REQUIRED', 'AUTHORITY_PROOF_NOT_RECORDED'])
assert.equal(assessment.authoritativeSemanticCount, 0)
assert.equal(assessment.semanticPromotionEnabled, false)
assert.equal(assessment.proceduralPromotionEnabled, false)
assert.equal(assessment.offlineAdaptationEnabled, false)

await assert.rejects(engine.assess({ projectId: '   ' }), /projectId is required/)
await assert.rejects(engine.assess({ projectId, limit: 0 }), /limit must be a positive integer/)

console.log('ADR-006 LearningEngine authority assessment verified.')
