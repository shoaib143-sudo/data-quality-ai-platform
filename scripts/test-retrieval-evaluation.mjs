import assert from 'node:assert/strict'

const { evaluateRetrieval, recordRetrievalEvaluation } = await import('../lib/ai/retrieval-evaluation.ts')
const { runRetrievalBenchmark } = await import('../lib/ai/retrieval-benchmark-runner.ts')

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

const benchmarkRetrievalCalls = []
const benchmarkRetrieval = {
  id: 'governance_semantic_projection+deterministic_relevance_v1',
  capabilities: { lexical: false, semantic: true, graph: false, temporal: false, authority: false },
  async retrieve(request) {
    benchmarkRetrievalCalls.push(request)
    const order = request.query === 'customer policy'
      ? ['policy-a', 'irrelevant', 'policy-b']
      : ['other', 'evidence-a']
    return {
      matches: order.map((objectKey, index) => ({
        projectId: 'project-1', projectionId: null, objectType: 'POLICY', objectKey, objectId: null,
        content: 'not persisted by benchmark', metadata: {}, score: 1 - (index * 0.1), mode: 'semantic',
        provenance: { source: 'governance.semantic_embeddings', projection: true, rerankedBy: 'deterministic_relevance_v1' },
      })),
      modesApplied: ['semantic'],
      capabilities: { lexical: false, semantic: true, graph: false, temporal: false, authority: false },
    }
  },
}

const benchmarkRecorded = []
const benchmarkResult = await runRetrievalBenchmark({
  projectId: 'project-1',
  dataset: {
    datasetKind: 'governed_retrieval_relevance',
    projectId: 'project-1',
    cases: cases.map((item) => ({ ...item, rankedObjectKeys: [] })),
    evidenceRefs: ['governance.ai_retrieval_evaluation_case_versions:case-v1'],
  },
  retrieval: benchmarkRetrieval,
  evaluationEngine: engine,
  k: 3,
  recordEvaluation: async (input) => {
    benchmarkRecorded.push(input)
    return recordRetrievalEvaluation(input)
  },
})
assert.equal(benchmarkRetrievalCalls.length, 2)
assert.deepEqual(benchmarkRetrievalCalls[0].projectIds, ['project-1'])
assert.equal(benchmarkRetrievalCalls[0].limit, 3)
assert.equal(benchmarkRecorded.length, 1)
assert.deepEqual(benchmarkRecorded[0].cases[0].rankedObjectKeys, ['policy-a', 'irrelevant', 'policy-b'])
assert.deepEqual(benchmarkRecorded[0].evidenceRefs, ['governance.ai_retrieval_evaluation_case_versions:case-v1'])
assert.equal(benchmarkRecorded[0].rerankerId, 'deterministic_relevance_v1')
assert.equal(benchmarkResult.providerId, benchmarkRetrieval.id)
assert.equal(benchmarkResult.rerankerId, 'deterministic_relevance_v1')
assert.equal(benchmarkResult.caseCount, 2)
assert.equal(benchmarkResult.evaluationResultIds.length, 3)

await assert.rejects(runRetrievalBenchmark({
  projectId: 'project-1',
  dataset: { datasetKind: 'governed_retrieval_relevance', projectId: 'project-1', cases: [], evidenceRefs: [] },
  retrieval: benchmarkRetrieval,
  evaluationEngine: engine,
  recordEvaluation: async () => { throw new Error('must not record') },
}), /requires governed labeled cases/)

await assert.rejects(runRetrievalBenchmark({
  projectId: 'other-project',
  dataset: { datasetKind: 'governed_retrieval_relevance', projectId: 'project-1', cases: cases.slice(0, 1), evidenceRefs: ['ref'] },
  retrieval: benchmarkRetrieval,
  evaluationEngine: engine,
  recordEvaluation: async () => { throw new Error('must not record') },
}), /dataset project mismatch/)

console.log('ADR-006 retrieval relevance evaluation metrics and governed benchmark runner verified.')
