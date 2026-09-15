import { createAdminClient } from '@/lib/supabase/admin'
import { runGovernedRealCaseAnalysis } from '@/lib/data-quality/governed-real-case-analysis-service'
import {
  buildGovernedRealCaseBucketSeries,
  type RealCaseBucketGranularity,
} from '@/lib/data-quality/governed-real-case-buckets'

function parseTimestamp(value: string, fieldName: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be a valid timestamp.`)
  return parsed
}

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function advanceBucket(startMs: number, granularity: RealCaseBucketGranularity) {
  const start = new Date(startMs)
  if (granularity === 'DAY') return startMs + 24 * 60 * 60 * 1000
  if (granularity === 'WEEK') return startMs + 7 * 24 * 60 * 60 * 1000

  const sourceMonth = start.getUTCMonth()
  const absoluteTargetMonth = sourceMonth + 1
  const targetYear = start.getUTCFullYear() + Math.floor(absoluteTargetMonth / 12)
  const targetMonth = absoluteTargetMonth % 12
  const targetDay = Math.min(start.getUTCDate(), daysInUtcMonth(targetYear, targetMonth))

  return Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  )
}

export function buildAnchoredUtcBucketWindows(input: {
  windowStart: string
  windowEnd: string
  granularity: RealCaseBucketGranularity
}) {
  const start = parseTimestamp(input.windowStart, 'windowStart')
  const end = parseTimestamp(input.windowEnd, 'windowEnd')
  if (start > end) throw new Error('Trend series window start must not be after its end.')

  const buckets: Array<{ bucketStart: string; bucketEnd: string }> = []
  let cursor = start
  while (cursor <= end) {
    if (buckets.length >= 24) throw new Error('Trend bucket series is limited to 24 buckets per analysis.')
    const nextStart = advanceBucket(cursor, input.granularity)
    if (!(nextStart > cursor)) throw new Error('Unable to advance trend bucket boundary.')
    const bucketEnd = Math.min(end, nextStart - 1)
    buckets.push({
      bucketStart: new Date(cursor).toISOString(),
      bucketEnd: new Date(bucketEnd).toISOString(),
    })
    cursor = nextStart
  }
  return buckets
}

export async function runGovernedRealCaseBucketSeries(input: {
  projectId: string
  windowStart: string
  windowEnd: string
  evidenceCutoffAt: string
  granularity: RealCaseBucketGranularity
  minimumSampleSize?: number
  persist?: boolean
}) {
  const cutoff = parseTimestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')
  const windowEnd = parseTimestamp(input.windowEnd, 'windowEnd')
  if (windowEnd > cutoff) throw new Error('Trend series window must not extend beyond the evidence cutoff.')

  const windows = buildAnchoredUtcBucketWindows({
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    granularity: input.granularity,
  })

  const results = await Promise.all(windows.map((window) => runGovernedRealCaseAnalysis({
    projectId: input.projectId,
    windowStart: window.bucketStart,
    windowEnd: window.bucketEnd,
    evidenceCutoffAt: input.evidenceCutoffAt,
    minimumSampleSize: input.minimumSampleSize,
    persist: false,
  })))

  const series = buildGovernedRealCaseBucketSeries({
    projectId: input.projectId,
    granularity: input.granularity,
    buckets: windows.map((window, index) => ({ ...window, result: results[index] })),
    evidenceCutoffAt: input.evidenceCutoffAt,
    minimumSampleSize: input.minimumSampleSize,
  })

  if (input.persist === false) return series

  const envelope = series.envelope
  const admin = createAdminClient()
  const { error } = await admin
    .schema('governance')
    .from('analysis_evidence_envelopes')
    .insert({
      project_id: envelope.projectId,
      analysis_type: envelope.analysisType,
      metric_definition_version_id: null,
      analysis_parameters: {
        contract_version: envelope.contractVersion,
        metric_key: envelope.metricKey,
        metric_version: envelope.metricVersion,
        calculation_method: envelope.calculationMethod,
        algorithm_version: envelope.algorithmVersion,
      },
      filters: envelope.filters,
      window_start: envelope.windowStart,
      window_end: envelope.windowEnd,
      evidence_cutoff_at: envelope.evidenceCutoffAt,
      source_records: envelope.sourceRecordIds,
      sample_size: envelope.sampleSize,
      data_freshness_at: envelope.dataFreshnessAt,
      confidence: envelope.confidence,
      uncertainty: envelope.uncertainty,
      evidence_lineage: envelope.evidenceLineage,
      reproducibility_ref: envelope.reproducibilityRef,
      algorithm_version: envelope.algorithmVersion,
    })

  if (error) throw new Error(`Unable to persist governed real-case bucket evidence envelope: ${error.message}`)
  return series
}
