import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeDerivedStateRebuildTargets,
  rebuildProjectDerivedState,
} from '../lib/data-plane/derived-state-rebuild.ts'

test('normalizes targets deterministically and removes duplicates', () => {
  assert.deepEqual(normalizeDerivedStateRebuildTargets(), ['PROJECTION_SNAPSHOT', 'SEMANTIC_CORPUS'])
  assert.deepEqual(
    normalizeDerivedStateRebuildTargets(['SEMANTIC_CORPUS', 'SEMANTIC_CORPUS', 'PROJECTION_SNAPSHOT']),
    ['SEMANTIC_CORPUS', 'PROJECTION_SNAPSHOT'],
  )
  assert.throws(
    () => normalizeDerivedStateRebuildTargets(['RAW_SOURCE']),
    /Unsupported derived-state rebuild target/,
  )
})

test('coordinates projection and semantic rebuilds without claiming false success', async () => {
  const calls = []
  const result = await rebuildProjectDerivedState({
    projectId: 'project-1',
    reason: 'rebuild stale derived state',
    actorUserId: 'user-1',
    semanticConcurrency: 99,
  }, {
    projectionSnapshot: async (input) => {
      calls.push(['projection', input])
      return { rows: 10 }
    },
    semanticCorpus: async (projectId, options) => {
      calls.push(['semantic', { projectId, options }])
      return { indexed: 9, unchanged: 1, failed: 0, pruned: 0 }
    },
  })

  assert.equal(result.status, 'COMPLETED')
  assert.equal(result.results.length, 2)
  assert.equal(calls[1][1].options.concurrency, 8)
})

test('reports partial rebuild when one independent derived surface fails', async () => {
  const result = await rebuildProjectDerivedState({
    projectId: 'project-1',
    reason: 'repair derived projections',
  }, {
    projectionSnapshot: async () => {
      throw new Error('projection unavailable')
    },
    semanticCorpus: async () => ({ indexed: 4, failed: 0, pruned: 1 }),
  })

  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.results[0].status, 'FAILED')
  assert.match(result.results[0].error ?? '', /projection unavailable/)
  assert.equal(result.results[1].status, 'COMPLETED')
})

test('semantic per-object failures are surfaced as partial, not complete', async () => {
  const result = await rebuildProjectDerivedState({
    projectId: 'project-1',
    reason: 'repair semantic derived state',
    targets: ['SEMANTIC_CORPUS'],
  }, {
    projectionSnapshot: async () => null,
    semanticCorpus: async () => ({ indexed: 3, failed: 2, pruned: 0 }),
  })

  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.results[0].status, 'PARTIAL')
})

test('fails validation before invoking rebuild dependencies', async () => {
  let invoked = false
  await assert.rejects(
    () => rebuildProjectDerivedState({
      projectId: 'project-1',
      reason: 'short',
    }, {
      projectionSnapshot: async () => {
        invoked = true
        return null
      },
      semanticCorpus: async () => {
        invoked = true
        return { indexed: 0, failed: 0, pruned: 0 }
      },
    }),
    /reason of at least 8 characters/,
  )
  assert.equal(invoked, false)
})
