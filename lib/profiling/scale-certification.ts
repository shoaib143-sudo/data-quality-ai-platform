export type ProfilingScaleState = 'NOT_MEASURED' | 'PASS' | 'FAIL'

export type ProfilingScaleEvidence = {
  tierId: 'ROWS_10K' | 'ROWS_100K' | 'ROWS_1M'
  rowCount: number
  columnCount: number
  durationSeconds: number
  peakMemoryBytes: number
  errorRate: number
  profileRunId: string
  datasetVersionId: string
  observedAt: string
  productionRepresentative: boolean
  shapes: string[]
}

type Tier = { id: ProfilingScaleEvidence['tierId']; minRows: number; maxP95Seconds: number; maxErrorRate: number }

const TIERS: Tier[] = [
  { id: 'ROWS_10K', minRows: 10_000, maxP95Seconds: 60, maxErrorRate: 0.01 },
  { id: 'ROWS_100K', minRows: 100_000, maxP95Seconds: 300, maxErrorRate: 0.01 },
  { id: 'ROWS_1M', minRows: 1_000_000, maxP95Seconds: 1800, maxErrorRate: 0.01 },
]

const REQUIRED_SHAPES = ['WIDE_TABLE','HIGH_CARDINALITY','NULL_HEAVY','UNICODE','LARGE_STRINGS','SCHEMA_DRIFT','MALFORMED_RECORDS'] as const
export const PROFILING_SCALE_MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000

export function evaluateProfilingScaleEvidence(evidence: ProfilingScaleEvidence[], nowMs = Date.now()) {
  if (evidence.length === 0) return { state: 'NOT_MEASURED' as const, blockers: ['NO_RUNTIME_EVIDENCE'] }

  const blockers: string[] = []
  for (const tier of TIERS) {
    const rows = evidence.filter((item) => item.tierId === tier.id && item.productionRepresentative)
    if (rows.length === 0) {
      blockers.push(`${tier.id}_NOT_MEASURED`)
      continue
    }

    if (rows.some((item) => !Number.isFinite(item.rowCount) || item.rowCount < 0)) blockers.push(`${tier.id}_ROW_COUNT_INVALID`)
    if (rows.some((item) => !Number.isFinite(item.columnCount) || item.columnCount <= 0)) blockers.push(`${tier.id}_COLUMN_COUNT_INVALID`)
    if (rows.some((item) => !Number.isFinite(item.durationSeconds) || item.durationSeconds < 0)) blockers.push(`${tier.id}_DURATION_INVALID`)
    if (rows.some((item) => !Number.isFinite(item.peakMemoryBytes) || item.peakMemoryBytes < 0)) blockers.push(`${tier.id}_MEMORY_INVALID`)
    if (rows.some((item) => !Number.isFinite(item.errorRate) || item.errorRate < 0 || item.errorRate > 1)) blockers.push(`${tier.id}_ERROR_RATE_INVALID`)

    const validDurations = rows.filter((item) => Number.isFinite(item.durationSeconds) && item.durationSeconds >= 0).map((item) => item.durationSeconds).sort((a,b) => a-b)
    if (validDurations.length > 0) {
      const p95 = validDurations[Math.min(validDurations.length - 1, Math.ceil(validDurations.length * 0.95) - 1)]
      if (p95 > tier.maxP95Seconds) blockers.push(`${tier.id}_P95_EXCEEDED`)
    }

    if (rows.some((item) => item.rowCount < tier.minRows)) blockers.push(`${tier.id}_ROW_COUNT_BELOW_TIER`)
    if (rows.some((item) => item.errorRate > tier.maxErrorRate)) blockers.push(`${tier.id}_ERROR_RATE_EXCEEDED`)
    if (rows.some((item) => !item.profileRunId?.trim() || !item.datasetVersionId?.trim())) blockers.push(`${tier.id}_IDENTITY_EVIDENCE_MISSING`)

    for (const item of rows) {
      const observedMs = Date.parse(item.observedAt)
      if (!Number.isFinite(observedMs)) {
        blockers.push(`${tier.id}_TIMESTAMP_INVALID`)
        continue
      }
      if (observedMs > nowMs + 5 * 60 * 1000) blockers.push(`${tier.id}_TIMESTAMP_FUTURE`)
      if (nowMs - observedMs > PROFILING_SCALE_MAX_EVIDENCE_AGE_MS) blockers.push(`${tier.id}_EVIDENCE_STALE`)
    }
  }

  const productionEvidence = evidence.filter((item) => item.productionRepresentative)
  const observedShapes = new Set(productionEvidence.flatMap((item) => item.shapes))
  for (const shape of REQUIRED_SHAPES) {
    if (!observedShapes.has(shape)) blockers.push(`SHAPE_${shape}_NOT_MEASURED`)
  }

  return { state: blockers.length === 0 ? 'PASS' as const : 'FAIL' as const, blockers: [...new Set(blockers)] }
}
