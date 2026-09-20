import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateProfilingHistoryTrends, loadProfilingHistoryTrends } from '../lib/analytics/profiling-history-trends.ts'

test('aggregates numeric profiling metrics and data-quality scores by UTC day', () => {
  const result = aggregateProfilingHistoryTrends([
    { observedAt: '2026-09-01T01:00:00Z', metricKey: 'null_rate', numericValue: 0.1 },
    { observedAt: '2026-09-01T23:00:00Z', metricKey: 'null_rate', numericValue: 0.3 },
    { observedAt: '2026-09-02T01:00:00Z', metricKey: 'null_rate', numericValue: 0.2 },
    { observedAt: 'bad-time', metricKey: 'null_rate', numericValue: 99 },
    { observedAt: '2026-09-01T02:00:00Z', metricKey: 'text_only', numericValue: null },
  ], [
    { observedAt: '2026-09-01T02:00:00Z', overallScore: 90, completenessScore: 80, uniquenessScore: 100, validityScore: 90, accuracyScore: null },
    { observedAt: '2026-09-01T04:00:00Z', overallScore: 70, completenessScore: 60, uniquenessScore: 80, validityScore: 70, accuracyScore: 50 },
  ])

  assert.deepEqual(result.metrics, [
    { bucketStart: '2026-09-01T00:00:00.000Z', metricKey: 'null_rate', average: 0.2, minimum: 0.1, maximum: 0.3, samples: 2 },
    { bucketStart: '2026-09-02T00:00:00.000Z', metricKey: 'null_rate', average: 0.2, minimum: 0.2, maximum: 0.2, samples: 1 },
  ])
  assert.deepEqual(result.qualityScores, [{
    bucketStart: '2026-09-01T00:00:00.000Z',
    overallAverage: 80,
    completenessAverage: 70,
    uniquenessAverage: 90,
    validityAverage: 80,
    accuracyAverage: 50,
    samples: 2,
  }])
})

test('loads bounded history through the provider contract with dataset-scoped filters', async () => {
  const calls = []
  const provider = {
    providerKey: 'fake',
    async query(request) {
      calls.push(request)
      return request.metric === 'profiling.metric_history'
        ? [{ observedAt: '2026-09-01T00:00:00Z', metricKey: 'null_rate', numericValue: 0.1 }]
        : [{ observedAt: '2026-09-01T00:00:00Z', overallScore: 95 }]
    },
  }

  const result = await loadProfilingHistoryTrends({
    projectId: 'project-a',
    datasetId: 'dataset-a',
    metricKey: ' null_rate ',
    from: '2026-09-01T00:00:00Z',
    to: '2026-09-30T23:59:59Z',
    limit: 9999,
  }, provider)

  assert.equal(result.provider, 'fake')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].limit, 500)
  assert.deepEqual(calls[0].filters, { datasetId: 'dataset-a', metricKey: 'null_rate' })
  assert.deepEqual(calls[1].filters, { datasetId: 'dataset-a' })
  assert.equal(result.metrics.length, 1)
  assert.equal(result.qualityScores.length, 1)
})
