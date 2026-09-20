import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateDataQualityHistory,
  loadDataQualityHistory,
} from '../lib/analytics/data-quality-history.ts'

test('aggregates daily DQ scores and flags only material bucket changes', () => {
  const result = aggregateDataQualityHistory([
    { observedAt: '2026-09-18T08:00:00Z', overallScore: 90, completenessScore: 92, validityScore: 88 },
    { observedAt: '2026-09-18T12:00:00Z', overallScore: 92, completenessScore: 94, validityScore: 90 },
    { observedAt: '2026-09-19T08:00:00Z', overallScore: 82, completenessScore: 93, validityScore: 78 },
  ], 5)

  assert.equal(result.buckets.length, 2)
  assert.equal(result.buckets[0].overallAverage, 91)
  assert.equal(result.buckets[1].overallAverage, 82)
  assert.equal(result.comparisons[0].materialChange, false)
  assert.equal(result.comparisons[1].materialChange, true)
  assert.deepEqual(
    result.comparisons[1].changedDimensions.map((item) => item.dimension).sort(),
    ['overall', 'validity'],
  )
  assert.equal(result.materialChangeCount, 1)
})

test('ignores malformed timestamps and non-finite/non-numeric score values', () => {
  const result = aggregateDataQualityHistory([
    { observedAt: 'bad', overallScore: 90 },
    { observedAt: '2026-09-19T08:00:00Z', overallScore: Number.NaN, completenessScore: '95' },
    { observedAt: '2026-09-19T09:00:00Z', overallScore: 80 },
  ])

  assert.equal(result.buckets.length, 1)
  assert.equal(result.buckets[0].samples, 2)
  assert.equal(result.buckets[0].overallAverage, 80)
  assert.equal(result.buckets[0].completenessAverage, null)
})

test('loads governed DQ score history through the configured analytics provider', async () => {
  const requests = []
  const provider = {
    providerKey: 'test-provider',
    async query(request) {
      requests.push(request)
      return [{ observedAt: '2026-09-19T08:00:00Z', overallScore: 95 }]
    },
  }

  const result = await loadDataQualityHistory({
    projectId: 'project-1',
    datasetId: 'dataset-1',
    from: '2026-09-01T00:00:00Z',
    to: '2026-09-20T00:00:00Z',
    limit: 9999,
    changeThreshold: 3,
  }, provider)

  assert.equal(result.provider, 'test-provider')
  assert.equal(result.threshold, 3)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].metric, 'dq.score_history')
  assert.deepEqual(requests[0].filters, { datasetId: 'dataset-1' })
  assert.equal(requests[0].limit, 500)
})
