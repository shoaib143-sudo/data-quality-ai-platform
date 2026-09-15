import {
  buildAnalysisEvidenceEnvelope,
  type AnalysisEvidenceEnvelope,
  type CanonicalOutcomeClass,
} from '@/lib/data-quality/governed-analysis-foundation'
import type { GovernedRealCaseResult } from '@/lib/data-quality/governed-real-case-analysis'

export const REAL_CASE_BUCKET_SERIES_VERSION = 'real-case-bucket-series-v1' as const
export type RealCaseBucketGranularity = 'DAY' | 'WEEK' | 'MONTH'

const OUTCOME_CLASSES: CanonicalOutcomeClass[] = [
  'SUCCESS',
  'PARTIAL_SUCCESS',
  'FAILURE',
  'UNRESOLVED',
  'ROLLED_BACK',
  'ESCALATED',
  'OVERRIDDEN',
  'REJECTED',
  'RECURRENT',
]

type BucketInput = {
  bucketStart: string
  bucketEnd: string
  result: GovernedRealCaseResult
}

export type GovernedRealCaseBucketPoint = {
  bucketStart: string
  bucketEnd: string
  status: 'OK' | 'INSUFFICIENT_EVIDENCE'
  sampleSize: number
  requiredSampleSize: number
  outcomeCounts: Record<CanonicalOutcomeClass, number> | null
  observedRates: Record<CanonicalOutcomeClass, number> | null
}

export type GovernedRealCaseBucketSeries = {
  status: 'OK' | 'INSUFFICIENT_EVIDENCE'
  granularity: RealCaseBucketGranularity
  bucketCount: number
  sufficientBucketCount: number
  minimumSampleSizePerBucket: number
  buckets: GovernedRealCaseBucketPoint[]
  envelope: AnalysisEvidenceEnvelope
}

function timestamp(value: string, name: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a valid timestamp.`)
  return parsed
}

function observedRates(counts: Record<CanonicalOutcomeClass, number>, sampleSize: number) {
  return Object.fromEntries(
    OUTCOME_CLASSES.map((outcome) => [outcome, Number((counts[outcome] / sampleSize).toFixed(6))]),
  ) as Record<CanonicalOutcomeClass, number>
}

export function buildGovernedRealCaseBucketSeries(input: {
  projectId: string
  granularity: RealCaseBucketGranularity
  buckets: BucketInput[]
  evidenceCutoffAt: string
  minimumSampleSize?: number
}): GovernedRealCaseBucketSeries {
  const cutoff = timestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')
  if (!input.buckets.length) throw new Error('At least one trend bucket is required.')
  if (input.buckets.length > 24) throw new Error('Trend bucket series is limited to 24 buckets per analysis.')

  const minimumSampleSize = Math.max(1, input.minimumSampleSize ?? 5)
  let priorEnd = -Infinity

  for (const bucket of input.buckets) {
    const start = timestamp(bucket.bucketStart, 'bucket.bucketStart')
    const end = timestamp(bucket.bucketEnd, 'bucket.bucketEnd')
    if (start > end) throw new Error('Trend bucket start must not be after its end.')
    if (start <= priorEnd) throw new Error('Trend buckets must be strictly ordered and non-overlapping.')
    if (end > cutoff) throw new Error('Trend buckets must not extend beyond the evidence cutoff.')
    if (bucket.result.envelope.projectId !== input.projectId) throw new Error('Trend bucket input belongs to a different project.')
    if (bucket.result.envelope.evidenceCutoffAt !== input.evidenceCutoffAt) throw new Error('Trend buckets must use the same evidence cutoff.')
    priorEnd = end
  }

  const points: GovernedRealCaseBucketPoint[] = input.buckets.map((bucket) => {
    const analysis = bucket.result.analysis
    const ready = analysis.status === 'OK' && analysis.sampleSize >= minimumSampleSize
    if (!ready) {
      return {
        bucketStart: bucket.bucketStart,
        bucketEnd: bucket.bucketEnd,
        status: 'INSUFFICIENT_EVIDENCE',
        sampleSize: analysis.sampleSize,
        requiredSampleSize: minimumSampleSize,
        outcomeCounts: null,
        observedRates: null,
      }
    }

    if (analysis.status !== 'OK') throw new Error('Trend bucket readiness invariant was violated.')
    return {
      bucketStart: bucket.bucketStart,
      bucketEnd: bucket.bucketEnd,
      status: 'OK',
      sampleSize: analysis.sampleSize,
      requiredSampleSize: minimumSampleSize,
      outcomeCounts: analysis.outcomeCounts,
      observedRates: observedRates(analysis.outcomeCounts, analysis.sampleSize),
    }
  })

  const sufficientBucketCount = points.filter((point) => point.status === 'OK').length
  const sourceRecordIds = [...new Set(input.buckets.flatMap((bucket) => bucket.result.envelope.sourceRecordIds))].sort()
  const freshness = input.buckets
    .map((bucket) => bucket.result.envelope.dataFreshnessAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null

  const envelope = buildAnalysisEvidenceEnvelope({
    projectId: input.projectId,
    analysisType: 'REAL_CASE_OUTCOME_BUCKET_SERIES',
    metricKey: 'governed_real_case_outcome_bucket_series',
    metricVersion: REAL_CASE_BUCKET_SERIES_VERSION,
    calculationMethod: 'Observed canonical outcome distributions grouped into deterministic UTC buckets. Each bucket is independently evidence-thresholded; insufficient buckets expose counts only and never inferred or interpolated rates.',
    filters: {
      project_id: input.projectId,
      granularity: input.granularity,
      bucket_count: input.buckets.length,
      minimum_sample_size_per_bucket: minimumSampleSize,
      synthetic_demo_test_excluded: true,
      adjudication_required: true,
      interpolation_permitted: false,
    },
    windowStart: input.buckets[0].bucketStart,
    windowEnd: input.buckets[input.buckets.length - 1].bucketEnd,
    evidenceCutoffAt: input.evidenceCutoffAt,
    sourceRecordIds,
    sampleSize: points.reduce((sum, point) => sum + point.sampleSize, 0),
    dataFreshnessAt: freshness,
    confidence: null,
    uncertainty: {
      sufficient_bucket_count: sufficientBucketCount,
      total_bucket_count: points.length,
      minimum_sample_size_per_bucket: minimumSampleSize,
      predictive_probability_exposed: false,
      causal_effect_claimed: false,
      interpolation_permitted: false,
    },
    evidenceLineage: {
      source: 'agent.agent_learning_cases',
      bucket_reproducibility_refs: input.buckets.map((bucket) => bucket.result.envelope.reproducibilityRef),
    },
    reproducibilityRef: [
      REAL_CASE_BUCKET_SERIES_VERSION,
      input.projectId,
      input.granularity,
      input.evidenceCutoffAt,
      ...input.buckets.flatMap((bucket) => [bucket.bucketStart, bucket.bucketEnd]),
      sourceRecordIds.join(','),
    ].join(':'),
    algorithmVersion: REAL_CASE_BUCKET_SERIES_VERSION,
  })

  return {
    status: sufficientBucketCount > 0 ? 'OK' : 'INSUFFICIENT_EVIDENCE',
    granularity: input.granularity,
    bucketCount: points.length,
    sufficientBucketCount,
    minimumSampleSizePerBucket: minimumSampleSize,
    buckets: points,
    envelope,
  }
}
