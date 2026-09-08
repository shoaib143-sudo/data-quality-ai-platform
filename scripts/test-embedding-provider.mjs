import assert from 'node:assert/strict'

const { RuntimeEmbeddingProvider } = await import('../lib/ai/embedding-provider.ts')

const calls = []
const provider = new RuntimeEmbeddingProvider(' governed_embedding ', {
  embedText: async (input, model) => {
    calls.push({ input, model })
    return [0.25, 0.5, 0.75]
  },
})

const result = await provider.embed({
  input: ' governance query ',
  purpose: 'query',
  model: ' embedding-model-v1 ',
})

assert.equal(provider.id, 'governed_embedding')
assert.deepEqual(calls, [{ input: 'governance query', model: 'embedding-model-v1' }])
assert.deepEqual(result, {
  embedding: [0.25, 0.5, 0.75],
  providerId: 'governed_embedding',
  model: 'embedding-model-v1',
  dimensions: 3,
})

const runtimeSelected = new RuntimeEmbeddingProvider('runtime-selected', {
  embedText: async (_input, model) => {
    assert.equal(model, undefined)
    return [1]
  },
})
assert.deepEqual(await runtimeSelected.embed({ input: 'query', purpose: 'query' }), {
  embedding: [1],
  providerId: 'runtime-selected',
  model: null,
  dimensions: 1,
})

await assert.rejects(
  provider.embed({ input: '   ', purpose: 'query' }),
  /embedding input is required/,
)
await assert.rejects(
  new RuntimeEmbeddingProvider('empty-vector', { embedText: async () => [] }).embed({ input: 'query', purpose: 'query' }),
  /empty vector/,
)
await assert.rejects(
  new RuntimeEmbeddingProvider('bad-vector', { embedText: async () => [Number.NaN] }).embed({ input: 'query', purpose: 'query' }),
  /non-finite values/,
)
await assert.rejects(
  new RuntimeEmbeddingProvider('propagate', { embedText: async () => {
    const error = new Error('No governance embedding provider is configured')
    error.name = 'EmbeddingProviderNotConfiguredError'
    throw error
  } }).embed({ input: 'query', purpose: 'query' }),
  (error) => error?.name === 'EmbeddingProviderNotConfiguredError',
)

console.log('ADR-006 EmbeddingProvider behavior verified.')
