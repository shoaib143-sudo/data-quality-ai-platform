import assert from 'node:assert/strict'
import test from 'node:test'

import { reembedProjectSemanticObjects } from '../lib/governance/semantic-reembedding.ts'

test('re-embedding writes candidates into the requested model revision without pruning the previous space', async () => {
  const calls = []
  const result = await reembedProjectSemanticObjects(
    {
      projectId: 'project-1',
      model: 'model-v2',
      revision: '2026-09-20',
      concurrency: 2,
    },
    {
      collect: async () => [
        { objectType: 'DATASET', objectKey: 'dataset-1', objectId: 'dataset-1', content: 'Customers' },
        { objectType: 'COLUMN', objectKey: 'column-1', objectId: 'column-1', content: 'customer_email' },
      ],
      index: async (input) => {
        calls.push(input)
        return {
          id: `embedding-${input.objectKey}`,
          embedding_space_id: 'space-v2',
          unchanged: false,
        }
      },
    },
  )

  assert.equal(result.total, 2)
  assert.equal(result.indexed, 2)
  assert.equal(result.failed, 0)
  assert.deepEqual(result.embeddingSpaceIds, ['space-v2'])
  assert.equal(calls.length, 2)
  assert.ok(calls.every((call) => call.embeddingModel === 'model-v2'))
  assert.ok(calls.every((call) => call.embeddingVersion === '2026-09-20'))
})

test('re-embedding reports partial failures without hiding successful objects', async () => {
  const result = await reembedProjectSemanticObjects(
    {
      projectId: 'project-1',
      model: 'model-v2',
      revision: '2',
    },
    {
      collect: async () => [
        { objectType: 'DATASET', objectKey: 'ok', content: 'ok' },
        { objectType: 'POLICY', objectKey: 'bad', content: 'bad' },
      ],
      index: async (input) => {
        if (input.objectKey === 'bad') throw new Error('provider rejected input')
        return {
          id: 'embedding-ok',
          embedding_space_id: 'space-v2',
          unchanged: true,
        }
      },
    },
  )

  assert.equal(result.total, 2)
  assert.equal(result.unchanged, 1)
  assert.equal(result.failed, 1)
  assert.equal(result.results.find((row) => row.objectKey === 'bad')?.status, 'FAILED')
  assert.match(result.results.find((row) => row.objectKey === 'bad')?.error ?? '', /provider rejected input/)
})

test('re-embedding fails closed on missing identity inputs', async () => {
  await assert.rejects(
    () => reembedProjectSemanticObjects(
      { projectId: 'project-1', model: ' ', revision: '2' },
      { collect: async () => [], index: async () => ({ embedding_space_id: 'x', unchanged: false }) },
    ),
    /embedding model is required/,
  )
})
