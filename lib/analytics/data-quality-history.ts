import type { AnalyticsQueryProvider, AnalyticsQueryRow } from '@/lib/data-plane/contracts'

export type DataQualityHistoryRequest = {
  projectId: string
  datasetId?: string | null
  from?: string | null
  to?: string | null
  limit?: number
  changeThreshold?: number
}

type DimensionKey = 'overallScore' | 'completenessScore' | 'uniquenessScore' | 'validityScore' | 'accuracyScore'

const DIMENSIONS: DimensionKey[] = [
  'overallScore',
  'completenessScore',
  'uniquenessScore',
  'validityScore',
  'accuracyScore',
]

function dayBucket(value: unknown) {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10) + 'T00:00:00.000Z'
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function aggregateDataQualityHistory(rows: AnalyticsQueryRow[], changeThreshold = 5) {
  const threshold = Number.isFinite(changeThreshold) ? Math.max(0, changeThreshold) : 5
  const grouped = new Map<string, { samples: number; values: Record<DimensionKey, number[]> }>()

  for (const row of rows) {
    const bucket = dayBucket(row.observedAt)
    if (!bucket) continue
    const group = grouped.get(bucket) ?? {
      samples: 0,
      values: {
        overallScore: [],
        completenessScore: [],
        uniquenessScore: [],
        validityScore: [],
        accuracyScore: [],
      },
    }
    group.samples += 1
    for (const dimension of DIMENSIONS) {
      const value = finite(row[dimension])
      if (value !== null) group.values[dimension].push(value)
    }
    grouped.set(bucket, group)
  }

  const buckets = [...grouped.entries()]
    .map(([bucketStart, group]) => ({
      bucketStart,
      samples: group.samples,
      overallAverage: average(group.values.overallScore),
      completenessAverage: average(group.values.completenessScore),
      uniquenessAverage: average(group.values.uniquenessScore),
      validityAverage: average(group.values.validityScore),
      accuracyAverage: average(group.values.accuracyScore),
    }))
    .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))

  const comparisons = buckets.map((current, index) => {
    const previous = index > 0 ? buckets[index - 1] : null
    const pairs = {
      overall: [current.overallAverage, previous?.overallAverage ?? null],
      completeness: [current.completenessAverage, previous?.completenessAverage ?? null],
      uniqueness: [current.uniquenessAverage, previous?.uniquenessAverage ?? null],
      validity: [current.validityAverage, previous?.validityAverage ?? null],
      accuracy: [current.accuracyAverage, previous?.accuracyAverage ?? null],
    } as const

    const deltas = Object.fromEntries(
      Object.entries(pairs).map(([key, [now, before]]) => [
        key,
        now === null || before === null ? null : Number((now - before).toFixed(6)),
      ]),
    ) as Record<string, number | null>

    const changedDimensions = Object.entries(deltas)
      .filter(([, delta]) => delta !== null && Math.abs(delta) >= threshold)
      .map(([dimension, delta]) => ({ dimension, delta: delta as number }))

    return {
      bucketStart: current.bucketStart,
      previousBucketStart: previous?.bucketStart ?? null,
      deltas,
      changedDimensions,
      materialChange: changedDimensions.length > 0,
    }
  })

  return {
    threshold,
    buckets,
    comparisons,
    materialChangeCount: comparisons.filter((item) => item.materialChange).length,
  }
}

export async function loadDataQualityHistory(
  request: DataQualityHistoryRequest,
  provider: AnalyticsQueryProvider,
) {
  const limit = Number.isFinite(request.limit)
    ? Math.max(1, Math.min(500, Math.trunc(request.limit as number)))
    : 500
  const filters: Record<string, string> = {}
  if (request.datasetId?.trim()) filters.datasetId = request.datasetId.trim()

  const rows = await provider.query({
    projectId: request.projectId,
    metric: 'dq.score_history',
    from: request.from ?? null,
    to: request.to ?? null,
    filters,
    limit,
  })

  return {
    provider: provider.providerKey,
    projectId: request.projectId,
    datasetId: request.datasetId?.trim() || null,
    ...aggregateDataQualityHistory(rows, request.changeThreshold),
  }
}
