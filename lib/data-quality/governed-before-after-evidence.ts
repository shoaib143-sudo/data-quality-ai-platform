import {
  buildAnalysisEvidenceEnvelope,
  type AnalysisEvidenceEnvelope,
} from '@/lib/data-quality/governed-analysis-foundation'

export const BEFORE_AFTER_EVIDENCE_VERSION = 'before-after-evidence-v1' as const

export type BeforeAfterEvidenceSource = 'REMEDIATION_KNOWLEDGE' | 'GOVERNED_ACTION_OUTCOME'

export type BeforeAfterEvidenceRow = {
  id: string
  projectId: string
  source: BeforeAfterEvidenceSource
  observedAt: string
  evidenceAvailableAt: string
  beforeEvidence: Record<string, unknown>
  afterEvidence: Record<string, unknown>
  outcomeLabel: string | null
  metadata?: Record<string, unknown> | null
}

type ComparableType = 'NUMBER' | 'BOOLEAN' | 'STRING'

type ComparableEvidence = {
  key: string
  type: ComparableType
  before: number | boolean | string
  after: number | boolean | string
  changed: boolean
  numericDelta: number | null
  numericMovement: 'INCREASED' | 'DECREASED' | 'UNCHANGED' | null
}

type ExcludedEvidence = {
  key: string
  reason: 'MISSING_BEFORE' | 'MISSING_AFTER' | 'TYPE_MISMATCH' | 'UNSUPPORTED_TYPE' | 'NON_FINITE_NUMBER'
}

export type GovernedBeforeAfterEvidenceResult = {
  status: 'OK' | 'INSUFFICIENT_EVIDENCE'
  caseSampleSize: number
  requiredCaseSampleSize: number
  comparablePairCount: number
  cases: Array<{
    sourceRecordId: string
    source: BeforeAfterEvidenceSource
    observedAt: string
    outcomeLabel: string | null
    comparable: ComparableEvidence[]
    excluded: ExcludedEvidence[]
  }>
  aggregate: null | {
    changedPairCount: number
    unchangedPairCount: number
    numeric: {
      increasedCount: number
      decreasedCount: number
      unchangedCount: number
    }
    categorical: {
      changedCount: number
      unchangedCount: number
    }
  }
  envelope: AnalysisEvidenceEnvelope
}

function timestamp(value: string, fieldName: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be a valid timestamp.`)
  return parsed
}

function scalarType(value: unknown): ComparableType | null {
  if (typeof value === 'number') return 'NUMBER'
  if (typeof value === 'boolean') return 'BOOLEAN'
  if (typeof value === 'string') return 'STRING'
  return null
}

function isSyntheticOrTestMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return false
  for (const key of ['is_synthetic', 'synthetic', 'is_test', 'test', 'is_demo', 'demo']) {
    if (metadata[key] === true) return true
  }
  const environment = typeof metadata.environment === 'string' ? metadata.environment.trim().toUpperCase() : ''
  return environment === 'TEST' || environment === 'DEMO' || environment === 'SYNTHETIC'
}

function qualifiedSourceRecordId(row: Pick<BeforeAfterEvidenceRow, 'source' | 'id'>) {
  return `${row.source}:${row.id}`
}

export function compareEvidenceObjects(
  beforeEvidence: Record<string, unknown>,
  afterEvidence: Record<string, unknown>,
) {
  const comparable: ComparableEvidence[] = []
  const excluded: ExcludedEvidence[] = []
  const keys = [...new Set([...Object.keys(beforeEvidence), ...Object.keys(afterEvidence)])].sort()

  for (const key of keys) {
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeEvidence, key)
    const hasAfter = Object.prototype.hasOwnProperty.call(afterEvidence, key)
    if (!hasBefore) {
      excluded.push({ key, reason: 'MISSING_BEFORE' })
      continue
    }
    if (!hasAfter) {
      excluded.push({ key, reason: 'MISSING_AFTER' })
      continue
    }

    const before = beforeEvidence[key]
    const after = afterEvidence[key]
    const beforeType = scalarType(before)
    const afterType = scalarType(after)
    if (!beforeType || !afterType) {
      excluded.push({ key, reason: 'UNSUPPORTED_TYPE' })
      continue
    }
    if (beforeType !== afterType) {
      excluded.push({ key, reason: 'TYPE_MISMATCH' })
      continue
    }

    if (beforeType === 'NUMBER') {
      const beforeNumber = before as number
      const afterNumber = after as number
      if (!Number.isFinite(beforeNumber) || !Number.isFinite(afterNumber)) {
        excluded.push({ key, reason: 'NON_FINITE_NUMBER' })
        continue
      }
      const delta = Number((afterNumber - beforeNumber).toFixed(12))
      comparable.push({
        key,
        type: 'NUMBER',
        before: beforeNumber,
        after: afterNumber,
        changed: delta !== 0,
        numericDelta: delta,
        numericMovement: delta > 0 ? 'INCREASED' : delta < 0 ? 'DECREASED' : 'UNCHANGED',
      })
      continue
    }

    comparable.push({
      key,
      type: beforeType,
      before: before as boolean | string,
      after: after as boolean | string,
      changed: before !== after,
      numericDelta: null,
      numericMovement: null,
    })
  }

  return { comparable, excluded }
}

export function buildGovernedBeforeAfterEvidenceAnalysis(input: {
  projectId: string
  rows: BeforeAfterEvidenceRow[]
  windowStart: string
  windowEnd: string
  evidenceCutoffAt: string
  minimumCaseSampleSize?: number
}): GovernedBeforeAfterEvidenceResult {
  const windowStart = timestamp(input.windowStart, 'windowStart')
  const windowEnd = timestamp(input.windowEnd, 'windowEnd')
  const cutoff = timestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')
  if (windowStart > windowEnd) throw new Error('windowStart must not be after windowEnd.')
  if (windowEnd > cutoff) throw new Error('windowEnd must not be after evidenceCutoffAt.')

  const minimumCaseSampleSize = Math.max(1, Math.floor(input.minimumCaseSampleSize ?? 5))
  const scopedRows = input.rows
    .filter((row) => row.projectId === input.projectId)
    .filter((row) => !isSyntheticOrTestMetadata(row.metadata))
    .filter((row) => {
      const observedAt = timestamp(row.observedAt, 'row.observedAt')
      const evidenceAvailableAt = timestamp(row.evidenceAvailableAt, 'row.evidenceAvailableAt')
      return observedAt >= windowStart && observedAt <= windowEnd && evidenceAvailableAt <= cutoff
    })
    .sort((a, b) => qualifiedSourceRecordId(a).localeCompare(qualifiedSourceRecordId(b)))

  const cases = scopedRows.map((row) => {
    const comparison = compareEvidenceObjects(row.beforeEvidence, row.afterEvidence)
    return {
      sourceRecordId: qualifiedSourceRecordId(row),
      source: row.source,
      observedAt: row.observedAt,
      outcomeLabel: row.outcomeLabel,
      comparable: comparison.comparable,
      excluded: comparison.excluded,
    }
  })

  const casesWithComparableEvidence = cases.filter((candidate) => candidate.comparable.length > 0)
  const comparablePairs = casesWithComparableEvidence.flatMap((candidate) => candidate.comparable)
  const caseSampleSize = casesWithComparableEvidence.length
  const ready = caseSampleSize >= minimumCaseSampleSize

  const aggregate = ready
    ? {
        changedPairCount: comparablePairs.filter((pair) => pair.changed).length,
        unchangedPairCount: comparablePairs.filter((pair) => !pair.changed).length,
        numeric: {
          increasedCount: comparablePairs.filter((pair) => pair.type === 'NUMBER' && pair.numericMovement === 'INCREASED').length,
          decreasedCount: comparablePairs.filter((pair) => pair.type === 'NUMBER' && pair.numericMovement === 'DECREASED').length,
          unchangedCount: comparablePairs.filter((pair) => pair.type === 'NUMBER' && pair.numericMovement === 'UNCHANGED').length,
        },
        categorical: {
          changedCount: comparablePairs.filter((pair) => pair.type !== 'NUMBER' && pair.changed).length,
          unchangedCount: comparablePairs.filter((pair) => pair.type !== 'NUMBER' && !pair.changed).length,
        },
      }
    : null

  const sourceRecordIds = casesWithComparableEvidence.map((candidate) => candidate.sourceRecordId).sort()
  const comparableSourceRecordIds = new Set(sourceRecordIds)
  const freshnessValues = scopedRows
    .filter((row) => comparableSourceRecordIds.has(qualifiedSourceRecordId(row)))
    .map((row) => row.evidenceAvailableAt)
    .sort()
  const dataFreshnessAt = freshnessValues.length > 0 ? freshnessValues[freshnessValues.length - 1] : null

  const envelope = buildAnalysisEvidenceEnvelope({
    projectId: input.projectId,
    analysisType: 'GOVERNED_BEFORE_AFTER_EVIDENCE_CHANGE',
    metricKey: 'governed_before_after_evidence_change',
    metricVersion: BEFORE_AFTER_EVIDENCE_VERSION,
    calculationMethod: 'Descriptive comparison of same-key, same-scalar-type persisted before and after evidence. Numeric deltas describe direction only; categorical values report changed versus unchanged. No improvement, effectiveness, prediction, or causal effect is inferred from value movement.',
    filters: {
      project_id: input.projectId,
      persisted_evidence_only: true,
      synthetic_demo_test_excluded: true,
      same_key_required: true,
      same_scalar_type_required: true,
      source_qualified_record_ids: true,
    },
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    evidenceCutoffAt: input.evidenceCutoffAt,
    sourceRecordIds,
    sampleSize: caseSampleSize,
    dataFreshnessAt,
    confidence: null,
    uncertainty: {
      status: ready ? 'OK' : 'INSUFFICIENT_EVIDENCE',
      minimum_case_sample_size: minimumCaseSampleSize,
      comparable_pair_count: comparablePairs.length,
      direction_is_not_improvement: true,
      effectiveness_claimed: false,
      predictive_probability_exposed: false,
      causal_effect_claimed: false,
    },
    evidenceLineage: {
      sources: [...new Set(casesWithComparableEvidence.map((candidate) => candidate.source))].sort(),
      source_record_ids: sourceRecordIds,
    },
    reproducibilityRef: [
      BEFORE_AFTER_EVIDENCE_VERSION,
      input.projectId,
      input.windowStart,
      input.windowEnd,
      input.evidenceCutoffAt,
      sourceRecordIds.join(','),
    ].join(':'),
    algorithmVersion: BEFORE_AFTER_EVIDENCE_VERSION,
  })

  return {
    status: ready ? 'OK' : 'INSUFFICIENT_EVIDENCE',
    caseSampleSize,
    requiredCaseSampleSize: minimumCaseSampleSize,
    comparablePairCount: comparablePairs.length,
    cases,
    aggregate,
    envelope,
  }
}
