import assert from 'node:assert/strict'

const { SemanticProjectionRetrievalProvider } = await import('../lib/ai/retrieval-provider.ts')

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
      ? [{ object_type: 'POLICY', object_key: 'policy-a', object_id: 'a', content: 'Policy A', metadata: { authority: 'approved' }, similarity: 0.8 }]
      : [{ object_type: 'DOCUMENT_CHUNK', object_key: 'chunk-b', object_id: 'b', content: 'Evidence B', metadata: {}, similarity: 0.9 }]
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

console.log('ADR-006 RetrievalProvider behavior verified.')
