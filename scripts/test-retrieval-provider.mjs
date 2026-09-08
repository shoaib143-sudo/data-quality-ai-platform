import assert from 'node:assert/strict'

const { SemanticProjectionRetrievalProvider } = await import('../lib/ai/retrieval-provider.ts')
const { DeterministicRelevanceReranker, RerankingRetrievalProvider } = await import('../lib/ai/reranker-provider.ts')

let embedCalls = 0
const searchedProjects = []
const provider = new SemanticProjectionRetrievalProvider({
  embedQuery: async (query) => {
    embedCalls += 1
    assert.equal(query, 'customer policy')
    return [1, 0, 0]
  },
  searchProject: async ({ projectId, embedding, objectTypes, threshold, limit }) => {
    searchedProjects.push({ projectId, embedding, objectTypes, threshold, limit })
    return projectId === 'project-a'
      ? [{ id: 'embedding-a', object_type: 'POLICY', object_key: 'policy-a', object_id: 'a', content: 'Policy A', metadata: { authority: 'approved' }, similarity: 0.8 }]
      : [{ id: 'embedding-b', object_type: 'DOCUMENT_CHUNK', object_key: 'chunk-b', object_id: 'b', content: 'Evidence B', metadata: {}, similarity: 0.9 }]
  },
})

const response = await provider.retrieve({
  query: '  customer policy  ',
  projectIds: ['project-a', 'project-b', 'project-a'],
  objectTypes: ['POLICY', 'DOCUMENT_CHUNK'],
  modes: ['semantic'],
  threshold: 0.4,
  limit: 10,
})

assert.equal(embedCalls, 1)
assert.equal(searchedProjects.length, 2)
assert.deepEqual(searchedProjects.map((entry) => entry.projectId).sort(), ['project-a', 'project-b'])
assert.deepEqual(response.modesApplied, ['semantic'])
assert.equal(response.capabilities.semantic, true)
assert.equal(response.capabilities.lexical, false)
assert.equal(response.matches.length, 2)
assert.equal(response.matches[0].projectionId, 'embedding-b')
assert.equal(response.matches[0].objectId, 'b')
assert.equal(response.matches[0].score, 0.9)
assert.equal(response.matches[0].provenance.source, 'governance.semantic_embeddings')
assert.equal(response.matches[0].provenance.projection, true)

await assert.rejects(
  provider.retrieve({ query: 'customer policy', projectIds: ['project-a'], modes: ['lexical'] }),
  /does not support requested modes: lexical/,
)
await assert.rejects(
  provider.retrieve({ query: '   ', projectIds: ['project-a'], modes: ['semantic'] }),
  /Retrieval query is required/,
)

const noProjects = await provider.retrieve({ query: 'customer policy', projectIds: [], modes: ['semantic'] })
assert.deepEqual(noProjects.matches, [])
assert.equal(embedCalls, 1)

const reranker = new DeterministicRelevanceReranker()
const candidates = [
  {
    projectId: 'project-a', projectionId: 'semantic-high', objectType: 'DOCUMENT_CHUNK', objectKey: 'high', objectId: 'high',
    content: 'Unrelated evidence about retention schedules', metadata: {}, score: 0.9, mode: 'semantic',
    provenance: { source: 'governance.semantic_embeddings', projection: true },
  },
  {
    projectId: 'project-a', projectionId: 'query-match', objectType: 'POLICY', objectKey: 'match', objectId: 'match',
    content: 'Customer policy requirements and customer policy controls', metadata: {}, score: 0.8, mode: 'semantic',
    provenance: { source: 'governance.semantic_embeddings', projection: true },
  },
]
const reranked = await reranker.rerank({ query: 'customer policy', candidates, limit: 2 })
assert.equal(reranked.providerId, 'deterministic_relevance_v1')
assert.equal(reranked.matches[0].projectionId, 'query-match')
assert.equal(reranked.matches[0].baseScore, 0.8)
assert.ok(reranked.matches[0].score > reranked.matches[1].score)
assert.equal(reranked.matches[0].provenance.rerankedBy, 'deterministic_relevance_v1')
assert.equal(candidates[1].baseScore, undefined, 'reranker must not mutate source candidates')
await assert.rejects(
  reranker.rerank({ query: '   ', candidates, limit: 2 }),
  /Reranker query is required/,
)

let upstreamRequest = null
const wrapped = new RerankingRetrievalProvider({
  id: 'fake_retrieval',
  capabilities: provider.capabilities,
  async retrieve(request) {
    upstreamRequest = request
    return { matches: candidates, modesApplied: ['semantic'], capabilities: provider.capabilities }
  },
}, reranker, 3)
const wrappedResponse = await wrapped.retrieve({ query: 'customer policy', projectIds: ['project-a'], modes: ['semantic'], limit: 2 })
assert.equal(upstreamRequest.limit, 6, 'wrapper must oversample before reranking')
assert.equal(wrappedResponse.matches.length, 2)
assert.equal(wrappedResponse.matches[0].projectionId, 'query-match')
assert.equal(wrapped.capabilities.semantic, true)

console.log('ADR-006 RetrievalProvider and dedicated RerankerProvider behavior verified.')
