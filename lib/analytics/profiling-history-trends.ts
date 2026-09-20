import type { AnalyticsQueryProvider, AnalyticsQueryRow } from '@/lib/data-plane/contracts'

export type ProfilingHistoryTrendRequest = {
  projectId: string
  datasetId: string
  metricKey?: string | null
  from?: string | null
  to?: string | null
  limit?: number
}

export type ProfilingMetricTrendPoint = {
  bucketStart: string
  metricKey: string
  average: number
  minimum: number
  maximum: number
  samples: number
}

export type DataQualityTrendPoint = {
  bucketStart: string
  overallAverage: number | null
  completenessAverage: number | null
  uniquenessAverage: number | null
  validityAverage: number | null
  accuracyAverage: number | null
  samples: number
}

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
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function aggregateProfilingHistoryTrends(
  metricRows: AnalyticsQueryRow[],
  scoreRows: AnalyticsQueryRow[],
) {
  const metricGroups = new Map<string, number[]>()
  for (const row of metricRows) {
    const bucket = dayBucket(row.observedAt)
    const metricKey = typeof row.metricKey === 'string' ? row.metricKey.trim() : ''
    const numericValue = finite(row.numericValue)
    if (!bucket || !metricKey || numericValue === null) continue
    const key = `${bucket}\u0000${metricKey}`
    const values = metricGroups.get(key) ?? []
    values.push(numericValue)
    metricGroups.set(key, values)
  }

  const metrics: ProfilingMetricTrendPoint[] = [...metricGroups.entries()].map(([key, values]) => {
    const [bucketStart, metricKey] = key.split('\u0000')
    return {
      bucketStart,
      metricKey,
      average: average(values) as number,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      samples: values.length,
    }
  }).sort((a, b) => a.bucketStart.localeCompare(b.bucketStart) || a.metricKey.localeCompare(b.metricKey))

  type ScoreAccumulator = {
    overall: number[]
    completeness: number[]
    uniqueness: number[]
    validity: number[]
    accuracy: number[]
    samples: number
  }

  const scoreGroups = new Map<string, ScoreAccumulator>()
  for (const row of scoreRows) {
    const bucket = dayBucket(row.observedAt)
    if (!bucket) continue
    const group = scoreGroups.get(bucket) ?? {
      overall: [],
      completeness: [],
      uniqueness: [],
      validity: [],
      accuracy: [],
      samples: 0,
    }
    group.samples += 1
    const values: Array<[keyof Omit<ScoreAccumulator, 'samples'>, unknown]> = [
      ['overall', row.overallScore],
      ['completeness', row.completenessScore],
      ['uniqueness', row.uniquenessScore],
      ['validity', row.validityScore],
      ['accuracy', row.accuracyScore],
    ]
    for (const [key, raw] of values) {
      const value = finite(raw)
      if (value !== null) group[key].push(value)
    }
    scoreGroups.set(bucket, group)
  }

  const qualityScores: DataQualityTrendPoint[] = [...scoreGroups.entries()].map(([bucketStart, group]) => ({
    bucketStart,
    overallAverage: average(group.overall),
    completenessAverage: average(group.completeness),
    uniquenessAverage: average(group.uniqueness),
    validityAverage: average(group.validity),
    accuracyAverage: average(group.accuracy),
    samples: group.samples,
  })).sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))

  return { metrics, qualityScores }
}

export async function loadProfilingHistoryTrends(
  request: ProfilingHistoryTrendRequest,
  provider: AnalyticsQueryProvider,
) {
  const limit = Number.isFinite(request.limit)
    ? Math.max(1, Math.min(500, Math.trunc(request.limit as number)))
    : 500

  const metricFilters: Record<string, string> = { datasetId: request.datasetId }
  if (request.metricKey?.trim()) metricFilters.metricKey = request.metricKey.trim()

  const [metricRows, scoreRows] = await Promise.all([
    provider.query({
      projectId: request.projectId,
      metric: 'profiling.metric_history',
      from: request.from ?? null,
      to: request.to ?? null,
      filters: metricFilters,
      limit,
    }),
    provider.query({
      projectId: request.projectId,
      metric: 'dq.score_history',
      from: request.from ?? null,
      to: request.to ?? null,
      filters: { datasetId: request.datasetId },
      limit,
    }),
  ])

  return {
    provider: provider.providerKey,
    projectId: request.projectId,
    datasetId: request.datasetId,
    metricKey: request.metricKey?.trim() || null,
    ...aggregateProfilingHistoryTrends(metricRows, scoreRows),
  }
}
