import assert from 'node:assert/strict'

const { VerifiedEvaluationDatasetBuilder } = await import('../lib/ai/evaluation-dataset.ts')
const { buildGovernedRetrievalEvaluationDataset } = await import('../lib/ai/retrieval-evaluation-dataset.ts')

const projectId = '479813aa-72a4-4b12-b72a-74da8d2419ce'
const baseCase = {
  id: 'case-verified',
  project_id: projectId,
  source_agent_run_id: 'source-run',
  case_key: 'dq-learning:learning-verified',
  source_kind: 'DATA_QUALITY_RECOMMENDATION_LEARNING',
  problem_type: 'DATA_QUALITY_RECOMMENDATION',
  context: { finding: 'objective-context-ref' },
  decision_status: 'VERIFIED',
  outcome_status: 'VERIFIED',
  effectiveness: '1',
  confidence: '0.95',
  evidence: { source_id: 'learning-verified', evidence: { verification_source: 'GOVERNED_REPROFILE' } },
  status: 'ACTIVE',
  occurred_at: '2026-09-08T09:22:02Z',
}

const learning = {
  id: 'learning-verified',
  project_id: projectId,
  workflow_instance_id: 'workflow-verified',
  remediation_outcome_id: 'outcome-verified',
  source_agent_run_id: 'source-run',
  verification_agent_run_id: 'verification-run',
  status: 'VERIFIED',
  effective: true,
  evidence: { verification_source: 'GOVERNED_REPROFILE' },
  outcome: {
    id: 'outcome-verified',
    status: 'VERIFIED',
    verified_at: '2026-09-08T09:22:02Z',
    verification_job_id: null,
    verification_agent_run_id: 'verification-run',
    checks: {
      material_improvement: { passed: true },
      failed_controls_not_worse: { passed: true },
    },
  },
}

const sourceCalls = []
const builder = new VerifiedEvaluationDatasetBuilder({
  listLearningCases: async (requestedProjectId, limit) => {
    sourceCalls.push({ requestedProjectId, limit })
    return [
      baseCase,
      {
        ...baseCase,
        id: 'case-synthetic',
        case_key: 'remediation:synthetic',
        source_kind: 'GOVERNANCE_REMEDIATION_KNOWLEDGE',
        evidence: { metadata: { synthetic_bootstrap: true }, source_id: 'synthetic-learning' },
      },
    ]
  },
  listDataQualityLearning: async (requestedProjectId, ids) => {
    assert.equal(requestedProjectId, projectId)
    assert.deepEqual(ids, ['learning-verified'])
    return [learning]
  },
})

const dataset = await builder.build({ projectId: ` ${projectId} `, limit: 25 })
assert.deepEqual(sourceCalls, [{ requestedProjectId: projectId, limit: 25 }])
assert.equal(dataset.datasetKind, 'verified_production_cases')
assert.equal(dataset.projectId, projectId)
assert.equal(dataset.cases.length, 1)
assert.equal(dataset.cases[0].caseId, 'case-verified')
assert.equal(dataset.cases[0].verifiedOutcome.effectiveness, 1)
assert.equal(dataset.cases[0].verifiedOutcome.confidence, 0.95)
assert.equal(dataset.cases[0].verifiedOutcome.verifiedAt, '2026-09-08T09:22:02.000Z')
assert.equal(dataset.cases[0].evidence.recommendationLearningId, 'learning-verified')
assert.equal(dataset.cases[0].evidence.remediationOutcomeId, 'outcome-verified')
assert.deepEqual(dataset.cases[0].evidenceRefs, [
  'agent.agent_learning_cases:case-verified',
  'governance.data_quality_recommendation_learning:learning-verified',
  'governance.data_quality_remediation_outcomes:outcome-verified',
  'agent.agent_runs:source-run',
  'agent.agent_runs:verification-run',
])
assert.equal('recommendation' in dataset.cases[0], false, 'AI recommendation prose must not become expected-answer truth')

for (const mutation of [
  { name: 'unverified case decision', case: { ...baseCase, decision_status: 'OBSERVED' }, learning },
  { name: 'ineffective learning', case: baseCase, learning: { ...learning, effective: false } },
  { name: 'failed verification check', case: baseCase, learning: { ...learning, outcome: { ...learning.outcome, checks: { material_improvement: { passed: false } } } } },
  { name: 'missing verification identity', case: baseCase, learning: { ...learning, verification_agent_run_id: null, outcome: { ...learning.outcome, verification_agent_run_id: null, verification_job_id: null } } },
]) {
  const isolated = new VerifiedEvaluationDatasetBuilder({
    listLearningCases: async () => [mutation.case],
    listDataQualityLearning: async () => [mutation.learning],
  })
  const result = await isolated.build({ projectId })
  assert.equal(result.cases.length, 0, mutation.name)
}

await assert.rejects(builder.build({ projectId: '   ' }), /projectId is required/)
await assert.rejects(builder.build({ projectId, limit: 0 }), /limit must be a positive integer/)

const retrievalDataset = buildGovernedRetrievalEvaluationDataset({
  projectId,
  records: [
    {
      caseId: 'retrieval-case-1',
      projectId,
      query: 'customer email quality policy',
      authority: 'HUMAN_REVIEWED',
      reviewedBy: 'reviewer-user-id',
      reviewedAt: '2026-09-09T00:00:00Z',
      evidenceRefs: ['governance.ai_evaluation_results:label-review-1'],
      judgments: [
        { objectKey: 'POLICY:customer-email-quality', relevance: 3 },
        { objectKey: 'DATASET:customer-profile', relevance: 1 },
      ],
    },
    {
      caseId: 'other-project-case',
      projectId: 'other-project',
      query: 'must not leak',
      authority: 'GOVERNED_IMPORT',
      evidenceRefs: ['external:verified-benchmark'],
      judgments: [{ objectKey: 'POLICY:other', relevance: 2 }],
    },
  ],
})
assert.equal(retrievalDataset.datasetKind, 'governed_retrieval_relevance')
assert.equal(retrievalDataset.projectId, projectId)
assert.equal(retrievalDataset.cases.length, 1)
assert.deepEqual(retrievalDataset.cases[0], {
  caseId: 'retrieval-case-1',
  query: 'customer email quality policy',
  rankedObjectKeys: [],
  relevance: {
    'POLICY:customer-email-quality': 3,
    'DATASET:customer-profile': 1,
  },
})
assert.deepEqual(retrievalDataset.evidenceRefs, ['governance.ai_evaluation_results:label-review-1'])

assert.throws(() => buildGovernedRetrievalEvaluationDataset({
  projectId,
  records: [{
    caseId: 'unreviewed-human-label',
    projectId,
    query: 'query',
    authority: 'HUMAN_REVIEWED',
    evidenceRefs: ['governance.review:1'],
    judgments: [{ objectKey: 'POLICY:key', relevance: 3 }],
  }],
}), /reviewedBy is required/)

assert.throws(() => buildGovernedRetrievalEvaluationDataset({
  projectId,
  records: [{
    caseId: 'missing-provenance',
    projectId,
    query: 'query',
    authority: 'GOVERNED_IMPORT',
    evidenceRefs: [],
    judgments: [{ objectKey: 'POLICY:key', relevance: 3 }],
  }],
}), /requires canonical evidenceRefs/)

assert.throws(() => buildGovernedRetrievalEvaluationDataset({
  projectId,
  records: [{
    caseId: 'no-positive-label',
    projectId,
    query: 'query',
    authority: 'GOVERNED_IMPORT',
    evidenceRefs: ['external:verified-benchmark'],
    judgments: [{ objectKey: 'POLICY:key', relevance: 0 }],
  }],
}), /requires at least one positive relevance judgment/)

console.log('ADR-006 verified evaluation and governed retrieval dataset behavior verified.')
