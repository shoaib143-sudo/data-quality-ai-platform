import assert from 'node:assert/strict'

const { normalizeHumanRetrievalRelevanceCase } = await import('../lib/ai/retrieval-label-recorder.ts')

const normalized = normalizeHumanRetrievalRelevanceCase({
  projectId: 'project-1',
  caseKey: 'case-1',
  query: ' customer retention policy ',
  evidenceRefs: ['governance:doc:1', 'governance:doc:1', ' governance:review:2 '],
  judgments: [
    { objectKey: 'policy-a', relevance: 3 },
    { objectKey: 'policy-b', relevance: 0 },
  ],
  reviewerUserId: 'user-1',
  reviewerCapability: 'admin.manage',
})

assert.equal(normalized.query, 'customer retention policy')
assert.deepEqual(normalized.evidenceRefs, ['governance:doc:1', 'governance:review:2'])
assert.deepEqual(normalized.judgments, [
  { objectKey: 'policy-a', relevance: 3 },
  { objectKey: 'policy-b', relevance: 0 },
])

assert.throws(() => normalizeHumanRetrievalRelevanceCase({ ...normalized, evidenceRefs: [] }), /canonical reference/)
assert.throws(() => normalizeHumanRetrievalRelevanceCase({ ...normalized, judgments: [] }), /at least one relevance judgment/)
assert.throws(() => normalizeHumanRetrievalRelevanceCase({ ...normalized, judgments: [{ objectKey: 'policy-a', relevance: 0 }] }), /positive relevance judgment/)
assert.throws(() => normalizeHumanRetrievalRelevanceCase({ ...normalized, judgments: [{ objectKey: 'policy-a', relevance: -1 }] }), /non-negative integer/)
assert.throws(() => normalizeHumanRetrievalRelevanceCase({ ...normalized, judgments: [{ objectKey: 'policy-a', relevance: 1.5 }] }), /non-negative integer/)
assert.throws(() => normalizeHumanRetrievalRelevanceCase({ ...normalized, judgments: [{ objectKey: 'policy-a', relevance: 1 }, { objectKey: 'policy-a', relevance: 2 }] }), /duplicate relevance judgment/)
assert.throws(() => normalizeHumanRetrievalRelevanceCase({ ...normalized, reviewerCapability: 'policy.approve' }), /admin\.manage/)

console.log('ADR-006 human retrieval relevance label recorder behavior verified.')
