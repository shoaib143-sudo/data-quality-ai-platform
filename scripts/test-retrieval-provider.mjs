import assert from 'node:assert/strict'

const {
  SemanticProjectionRetrievalProvider,
  classifyRetrievalAuthority,
  resolveRetrievalTemporalEvidence,
} = await import('../lib/ai/retrieval-provider.ts')
const { DeterministicRelevanceReranker, RerankingRetrievalProvider } = await import('../lib/ai/reranker-provider.ts')

let embedCalls = 0
const searchedProjects = []
const provider = new SemanticProjectionRetrievalProvider({
  embedQuery: async (query) => {
    embedCalls += 1
    assert.equal(query, 'customer policy')
    return { embedding: [1, 0, 0], embeddingSpaceId: 'space-v1' }
  },
  searchProject: async ({ projectId, embedding, embeddingSpaceId, objectTypes, threshold, limit }) => {
    searchedProjects.push({ projectId, embedding, embeddingSpaceId, objectTypes, threshold, limit })
    return projectId === 'project-a'
      ? [{
          id: 'embedding-a', object_type: 'POLICY', object_key: 'policy-a', object_id: 'a', content: 'Policy A', similarity: 0.8,
          metadata: {
            approval_status: 'APPROVED', approved_by: 'reviewer-a', approved_at: '2026-09-01T00:00:00Z',
            effective_from: '2026-09-02T00:00:00Z', effective_to: '2026-09-30T23:59:59Z', decision_id: 'decision-a',
          },
        }]
      : [{
          id: 'embedding-b', object_type: 'DOCUMENT_CHUNK', object_key: 'chunk-b', object_id: 'b', content: 'Evidence B', similarity: 0.9,
          metadata: { source_table: 'profiling.profile_findings', observed_at: '2026-09-05T00:00:00Z' },
        }]
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
assert.ok(searchedProjects.every((entry) => entry.embeddingSpaceId === 'space-v1'))
assert.deepEqual(response.modesApplied, ['semantic'])
assert.equal(response.capabilities.semantic, true)
assert.equal(response.capabilities.temporal, true)
assert.equal(response.capabilities.authority, true)
assert.equal(response.capabilities.lexical, false)
assert.equal(response.matches.length, 2)
assert.equal(response.matches[0].projectionId, 'embedding-b')
assert.equal(response.matches[0].objectId, 'b')
assert.equal(response.matches[0].score, 0.9)
assert.equal(response.matches[0].provenance.source, 'governance.semantic_embeddings')
assert.equal(response.matches[0].provenance.projection, true)
assert.equal(response.matches[0].provenance.embeddingSpaceId, 'space-v1')
assert.equal(response.matches[0].provenance.authority, 'OBSERVATION')
assert.equal(response.matches[1].provenance.authority, 'GOVERNED')
assert.equal(response.matches[1].metadata.retrieval_normalization.authorityClass, 'GOVERNED_DECISION')

const authorityOnly = await provider.retrieve({
  query: 'customer policy', projectIds: ['project-a', 'project-b'], modes: ['semantic', 'authority'], limit: 10,
})
assert.deepEqual(authorityOnly.modesApplied, ['semantic', 'authority'])
assert.equal(authorityOnly.matches.length, 1)
assert.equal(authorityOnly.matches[0].projectionId, 'embedding-a')
assert.equal(authorityOnly.matches[0].provenance.authority, 'GOVERNED')
assert.ok(authorityOnly.matches[0].provenance.authorityEvidenceKeys.includes('approval_status'))
assert.ok(authorityOnly.matches[0].provenance.authorityEvidenceKeys.includes('approved_by'))

const temporalOnly = await provider.retrieve({
  query: 'customer policy', projectIds: ['project-a', 'project-b'], modes: ['semantic', 'temporal'], asOf: '2026-09-10T00:00:00Z', limit: 10,
})
assert.equal(temporalOnly.matches.length, 2, 'observed point-in-time evidence and effective windows are both eligible as-of their timestamp')
const governedTemporal = temporalOnly.matches.find((match) => match.projectionId === 'embedding-a')
assert.equal(governedTemporal.provenance.temporal.validFrom, '2026-09-02T00:00:00.000Z')
assert.equal(governedTemporal.provenance.temporal.validTo, '2026-09-30T23:59:59.000Z')
assert.ok(governedTemporal.provenance.temporal.evidenceKeys.includes('effective_from'))

const expired = await provider.retrieve({
  query: 'customer policy', projectIds: ['project-a'], modes: ['authority', 'temporal'], asOf: '2026-10-01T00:00:00Z', limit: 10,
})
assert.deepEqual(expired.matches, [], 'expired governed evidence must fail closed for an as-of query')

await assert.rejects(
  provider.retrieve({ query: 'customer policy', projectIds: ['project-a'], modes: ['temporal'] }),
  /Temporal retrieval requires an asOf timestamp/,
)
await assert.rejects(
  provider.retrieve({ query: 'customer policy', projectIds: ['project-a'], modes: ['temporal'], asOf: 'not-a-time' }),
  /Temporal retrieval requires a valid asOf timestamp/,
)
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
assert.equal(embedCalls, 4, 'empty project retrieval must not embed another query')

const invalidSpaceProvider = new SemanticProjectionRetrievalProvider({
  embedQuery: async () => ({ embedding: [1, 0, 0], embeddingSpaceId: '' }),
  searchProject: async () => [],
})
await assert.rejects(
  invalidSpaceProvider.retrieve({ query: 'customer policy', projectIds: ['project-a'], modes: ['semantic'] }),
  /requires an exact embeddingSpaceId/,
)

assert.deepEqual(
  classifyRetrievalAuthority({ approval_status: 'APPROVED' }),
  { authority: 'UNVERIFIED', evidenceKeys: [] },
  'a status without reviewer/decision provenance must not become governance authority',
)
assert.equal(classifyRetrievalAuthority({ authority: 'approved' }).authority, 'UNVERIFIED', 'a bare authority label is insufficient')
assert.equal(classifyRetrievalAuthority({ governed: true }).authority, 'UNVERIFIED', 'a bare governed flag is insufficient')
assert.equal(classifyRetrievalAuthority({ source_table: 'profiling.profile_metrics', observed_at: '2026-09-01T00:00:00Z' }).authority, 'OBSERVATION')
assert.equal(classifyRetrievalAuthority({ approval_status: 'APPROVED', approved_by: 'u1' }).authority, 'GOVERNED')
assert.equal(resolveRetrievalTemporalEvidence({}, '2026-09-10T00:00:00Z'), null)
assert.equal(resolveRetrievalTemporalEvidence({ valid_from: '2026-09-11T00:00:00Z' }, '2026-09-10T00:00:00Z'), null)

const bareClaimProvider = new SemanticProjectionRetrievalProvider({
  embedQuery: async () => ({ embedding: [1], embeddingSpaceId: 'space-v1' }),
  searchProject: async () => [{
    id: 'bare-claim', object_type: 'POLICY', object_key: 'bare', object_id: 'bare', content: 'Bare claim', similarity: 0.99,
    metadata: { authority: 'approved', created_at: '2026-09-01T00:00:00Z' },
  }],
})
const bareAuthority = await bareClaimProvider.retrieve({
  query: 'customer policy', projectIds: ['project-a'], modes: ['semantic', 'authority'], limit: 10,
})
assert.deepEqual(bareAuthority.matches, [], 'bare authority metadata must fail closed in authority mode')

const reranker = new DeterministicRelevanceReranker()
const candidates = [
  {
    projectId: 'project-a', projectionId: 'semantic-high', objectType: 'DOCUMENT_CHUNK', objectKey: 'high', objectId: 'high',
    content: 'Unrelated evidence about retention schedules', metadata: {}, score: 0.9, mode: 'semantic',
    provenance: { source: 'governance.semantic_embeddings', projection: true, embeddingSpaceId: 'space-v1', authority: 'UNVERIFIED', authorityEvidenceKeys: [] },
  },
  {
    projectId: 'project-a', projectionId: 'query-match', objectType: 'POLICY', objectKey: 'match', objectId: 'match',
    content: 'Customer policy requirements and customer policy controls', metadata: {}, score: 0.8, mode: 'semantic',
    provenance: { source: 'governance.semantic_embeddings', projection: true, embeddingSpaceId: 'space-v1', authority: 'UNVERIFIED', authorityEvidenceKeys: [] },
  },
]
const reranked = await reranker.rerank({ query: 'customer policy', candidates, limit: 2 })
assert.equal(reranked.providerId, 'deterministic_relevance_v1')
assert.equal(reranked.matches[0].projectionId, 'query-match')
assert.equal(reranked.matches[0].baseScore, 0.8)
assert.ok(reranked.matches[0].score > reranked.matches[1].score)
assert.equal(reranked.matches[0].provenance.rerankedBy, 'deterministic_relevance_v1')
assert.equal(reranked.matches[0].provenance.authority, 'UNVERIFIED', 'reranking must preserve authority evidence unchanged')
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

console.log('ADR-006 RetrievalProvider authority, temporal, normalization, embedding-space isolation, and RerankerProvider behavior verified.')
