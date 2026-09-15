import {
  buildAnalysisEvidenceEnvelope,
  type AnalysisEvidenceEnvelope,
  type CanonicalOutcomeClass,
} from '@/lib/data-quality/governed-analysis-foundation'
import type { GovernedRealCaseResult } from '@/lib/data-quality/governed-real-case-analysis'

export const REAL_CASE_TREND_VERSION = 'real-case-trend-v1' as const

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

type TrendWindow = {
  windowStart: string
  windowEnd: string
  result: GovernedRealCaseResult
}

export type GovernedRealCaseTrendComparison =
  | {
      status: 'INSUFFICIENT_EVIDENCE'
      previousSampleSize: number
      currentSampleSize: number
      requiredSampleSize: number
      reason: 'PREVIOUS_WINDOW_INSUFFICIENT' | 'CURRENT_WINDOW_INSUFFICIENT' | 'BOTH_WINDOWS_INSUFFICIENT'
      envelope: AnalysisEvidenceEnvelope
    }
  | {
      status: 'OK'
      previousSampleSize: number
      currentSampleSize: number
      previousOutcomeCounts: Record<CanonicalOutcomeClass, number>
      currentOutcomeCounts: Record<CanonicalOutcomeClass, number>
      previousObservedRates: Record<CanonicalOutcomeClass, number>
      currentObservedRates: Record<CanonicalOutcomeClass, number>
      observedRateDelta: Record<CanonicalOutcomeClass, number>
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

export function buildGovernedRealCaseTrendComparison(input: {
  projectId: string
  previous: TrendWindow
  current: TrendWindow
  evidenceCutoffAt: string
  minimumSampleSize?: number
}): GovernedRealCaseTrendComparison {
  const previousStart = timestamp(input.previous.windowStart, 'previous.windowStart')
  const previousEnd = timestamp(input.previous.windowEnd, 'previous.windowEnd')
  const currentStart = timestamp(input.current.windowStart, 'current.windowStart')
  const currentEnd = timestamp(input.current.windowEnd, 'current.windowEnd')
  const cutoff = timestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')

  if (previousStart > previousEnd) throw new Error('Previous analysis window start must not be after its end.')
  if (currentStart > currentEnd) throw new Error('Current analysis window start must not be after its end.')
  if (previousEnd >= currentStart) throw new Error('Trend comparison windows must not overlap.')
  if (currentEnd > cutoff) throw new Error('Current analysis window must not extend beyond the evidence cutoff.')

  if (input.previous.result.envelope.projectId !== input.projectId || input.current.result.envelope.projectId !== input.projectId) {
    throw new Error('Trend comparison inputs must belong to the requested project.')
  }
  if (input.previous.result.envelope.evidenceCutoffAt !== input.evidenceCutoffAt || input.current.result.envelope.evidenceCutoffAt !== input.evidenceCutoffAt) {
    throw new Error('Trend comparison inputs must use the same evidence cutoff.')
  }

  const minimumSampleSize = Math.max(1, input.minimumSampleSize ?? 5)
  const previousAnalysis = input.previous.result.analysis
  const currentAnalysis = input.current.result.analysis
  const previousSampleSize = previousAnalysis.sampleSize
  const currentSampleSize = currentAnalysis.sampleSize
  const previousReady = previousAnalysis.status === 'OK' && previousSampleSize >= minimumSampleSize
  const currentReady = currentAnalysis.status === 'OK' && currentSampleSize >= minimumSampleSize

  const sourceRecordIds = [
    ...input.previous.result.envelope.sourceRecordIds,
    ...input.current.result.envelope.sourceRecordIds,
  ].sort()
  const freshest = [
    input.previous.result.envelope.dataFreshnessAt,
    input.current.result.envelope.dataFreshnessAt,
  ].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null

  const envelope = buildAnalysisEvidenceEnvelope({
    projectId: input.projectId,
    analysisType: 'REAL_CASE_OUTCOME_TREND_COMPARISON',
    metricKey: 'governed_real_case_outcome_trend_comparison',
    metricVersion: REAL_CASE_TREND_VERSION,
    calculationMethod: 'Comparison of observed canonical outcome distributions across two explicit, non-overlapping historical windows. Observed rates are emitted only when both windows independently satisfy the minimum evidence threshold.',
    filters: {
      project_id: input.projectId,
      previous_window_start: input.previous.windowStart,
      previous_window_end: input.previous.windowEnd,
      current_window_start: input.current.windowStart,
      current_window_end: input.current.windowEnd,
      synthetic_demo_test_excluded: true,
      adjudication_required: true,
      windows_non_overlapping: true,
    },
    windowStart: input.previous.windowStart,
    windowEnd: input.current.windowEnd,
    evidenceCutoffAt: input.evidenceCutoffAt,
    sourceRecordIds,
    sampleSize: previousSampleSize + currentSampleSize,
    dataFreshnessAt: freshest,
    confidence: null,
    uncertainty: {
      previous_status: previousAnalysis.status,
      current_status: currentAnalysis.status,
      minimum_sample_size_per_window: minimumSampleSize,
      predictive_probability_exposed: false,
      causal_effect_claimed: false,
    },
    evidenceLineage: {
      source: 'agent.agent_learning_cases',
      previous_source_record_ids: input.previous.result.envelope.sourceRecordIds,
      current_source_record_ids: input.current.result.envelope.sourceRecordIds,
      previous_reproducibility_ref: input.previous.result.envelope.reproducibilityRef,
      current_reproducibility_ref: input.current.result.envelope.reproducibilityRef,
    },
    reproducibilityRef: [
      REAL_CASE_TREND_VERSION,
      input.projectId,
      input.previous.windowStart,
      input.previous.windowEnd,
      input.current.windowStart,
      input.current.windowEnd,
      input.evidenceCutoffAt,
      sourceRecordIds.join(','),
    ].join(':'),
    algorithmVersion: REAL_CASE_TREND_VERSION,
  })

  if (!previousReady || !currentReady) {
    const reason = !previousReady && !currentReady
      ? 'BOTH_WINDOWS_INSUFFICIENT'
      : !previousReady
        ? 'PREVIOUS_WINDOW_INSUFFICIENT'
        : 'CURRENT_WINDOW_INSUFFICIENT'
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      previousSampleSize,
      currentSampleSize,
      requiredSampleSize: minimumSampleSize,
      reason,
      envelope,
    }
  }

  if (previousAnalysis.status !== 'OK' || currentAnalysis.status !== 'OK') {
    throw new Error('Trend comparison readiness invariant was violated.')
  }

  const previousOutcomeCounts = previousAnalysis.outcomeCounts
  const currentOutcomeCounts = currentAnalysis.outcomeCounts
  const previousObservedRates = observedRates(previousOutcomeCounts, previousSampleSize)
  const currentObservedRates = observedRates(currentOutcomeCounts, currentSampleSize)
  const observedRateDelta = Object.fromEntries(
    OUTCOME_CLASSES.map((outcome) => [
      outcome,
      Number((currentObservedRates[outcome] - previousObservedRates[outcome]).toFixed(6)),
    ]),
  ) as Record<CanonicalOutcomeClass, number>

  return {
    status: 'OK',
    previousSampleSize,
    currentSampleSize,
    previousOutcomeCounts,
    currentOutcomeCounts,
    previousObservedRates,
    currentObservedRates,
    observedRateDelta,
    envelope,
  }
}
