import assert from 'node:assert/strict'

const { evaluateRetrieval, recordRetrievalEvaluation } = await import('../lib/ai/retrieval-evaluation.ts')

const cases = [
  {
    caseId: 'case-1',
    query: 'customer policy',
    rankedObjectKeys: ['irrelevant', 'policy-a', 'policy-b'],
    relevance: { 'policy-a': 3, 'policy-b': 1 },
  },
  {
    caseId: 'case-2',
    query: 'retention evidence',
    rankedObjectKeys: ['evidence-a', 'other'],
    relevance: { 'evidence-a': 2 },
  },
]

const summary = evaluateRetrieval(cases, 3)
assert.equal(summary.caseCount, 2)
assert.equal(summary.mrrAtK, 0.75)
assert.ok(summary.ndcgAtK > 0 && summary.ndcgAtK <= 1)
assert.equal(summary.recallAtK, 1)

await assert.rejects(async () => evaluateRetrieval([], 10), /at least one labeled case/)
assert.throws(() => evaluateRetrieval([{ ...cases[0], relevance: { none: 0 } }], 3), /no positive relevance judgments/)
assert.throws(() => evaluateRetrieval(cases, 0), /k must be a positive integer/)

const recorded = []
const engine = {
  id: 'test',
  async record(input) {
    recorded.push(input)
    return { resultId: `result-${recorded.length}`, persisted: true }
  },
  async scorecard() { return [] },
}
const result = await recordRetrievalEvaluation({
  engine,
  projectId: 'project-1',
  providerId: 'governance_semantic_projection',
  rerankerId: 'deterministic_relevance_v1',
  cases,
  k: 3,
  evidenceRefs: ['fixture:retrieval-relevance-v1'],
})
assert.equal(result.receipts.length, 3)
assert.deepEqual(recorded.map((item) => item.metricName), ['MRR@3', 'NDCG@3', 'RECALL@3'])
assert.ok(recorded.every((item) => item.evaluationType === 'RETRIEVAL_RELEVANCE'))
assert.ok(recorded.every((item) => item.capability === 'retrieval'))
assert.ok(recorded.every((item) => item.dimensions.reranker_provider_id === 'deterministic_relevance_v1'))
assert.ok(recorded.every((item) => !('query' in item.metadata)))
assert.ok(recorded.every((item) => !('rankedObjectKeys' in item.metadata)))

console.log('ADR-006 retrieval relevance evaluation metrics verified.')
