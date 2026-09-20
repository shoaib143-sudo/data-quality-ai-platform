import '../scripts/lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'

const {
  findSimilarGovernanceObjects,
  normalizeSimilarityTargetTypes,
  similarityCapability,
} = await import('../lib/governance/governed-similarity.ts')

test('maps supported similarity types to existing read capabilities', () => {
  assert.equal(similarityCapability('COLUMN'), 'profiling.read')
  assert.equal(similarityCapability('GLOSSARY_TERM'), 'glossary.read')
  assert.equal(similarityCapability('FINDING'), 'quality.read')
  assert.equal(similarityCapability('QUALITY_INCIDENT'), 'quality.read')
})

test('normalizes and deduplicates target types with safe defaults', () => {
  assert.deepEqual(normalizeSimilarityTargetTypes('COLUMN'), ['COLUMN'])
  assert.deepEqual(
    normalizeSimilarityTargetTypes('FINDING', 'finding,quality_incident,FINDING'),
    ['FINDING', 'QUALITY_INCIDENT'],
  )
  assert.throws(
    () => normalizeSimilarityTargetTypes('COLUMN', ['POLICY']),
    /Unsupported similarity object type/,
  )
})

test('finds similar objects, excludes the source and bounds the request', async () => {
  const calls = []
  const result = await findSimilarGovernanceObjects({
    projectId: 'project-1',
    sourceType: 'COLUMN',
    sourceKey: 'column-1',
    targetTypes: ['COLUMN'],
    threshold: 9,
    limit: 1,
  }, {
    loadSource: async () => ({
      objectType: 'COLUMN',
      objectKey: 'column-1',
      objectId: 'column-1',
      content: 'customer email address',
      metadata: { dataset_id: 'dataset-1' },
    }),
    search: async (input) => {
      calls.push(input)
      return [
        {
          id: 'embedding-source',
          object_type: 'COLUMN',
          object_key: 'column-1',
          object_id: 'column-1',
          content: 'customer email address',
          metadata: {},
          similarity: 1,
        },
        {
          id: 'embedding-2',
          object_type: 'COLUMN',
          object_key: 'column-2',
          object_id: 'column-2',
          content: 'email contact',
          metadata: {},
          similarity: 0.92,
        },
      ]
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].threshold, 1)
  assert.equal(calls[0].limit, 2)
  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].objectKey, 'column-2')
})

test('fails closed when the source is missing from the governed semantic index', async () => {
  await assert.rejects(
    () => findSimilarGovernanceObjects({
      projectId: 'project-1',
      sourceType: 'GLOSSARY_TERM',
      sourceKey: 'missing',
    }, {
      loadSource: async () => null,
      search: async () => [],
    }),
    /not indexed/,
  )
})
