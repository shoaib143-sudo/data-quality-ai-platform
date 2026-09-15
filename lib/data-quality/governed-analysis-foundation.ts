export const CASE_QUALITY_VERSION = 'case-quality-v1' as const
export const ANALYSIS_CONTRACT_VERSION = 'governed-analysis-v1' as const

export type CanonicalOutcomeClass =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'FAILURE'
  | 'UNRESOLVED'
  | 'ROLLED_BACK'
  | 'ESCALATED'
  | 'OVERRIDDEN'
  | 'REJECTED'
  | 'RECURRENT'

export type AdjudicationState = 'UNADJUDICATED' | 'PENDING' | 'ADJUDICATED'

export type HistoricalCase = {
  id: string
  projectId: string
  caseKey: string
  persisted: boolean
  sourceKind: string
  outcomeClass: CanonicalOutcomeClass | null
  adjudicationState: AdjudicationState
  observedAt: string | null
  evidenceAvailableAt: string | null
  outcomeConfidence?: number | null
  provenanceCompleteness?: number | null
  sourceReliability?: number | null
  temporalCompleteness?: number | null
  domainRelevance?: number | null
  recurrenceObservationCompleteness?: number | null
  hasExecutionEvidence?: boolean
  hasDownstreamImpactEvidence?: boolean
}

export type ObservedOutcomeEvidence = {
  executionSucceeded: boolean | null
  verifiedOutcomeClass: CanonicalOutcomeClass | null
  adjudicationState: AdjudicationState
  observedAt: string | null
  evidenceAvailableAt: string | null
}

export type CaseAssessment = {
  learningEligible: boolean
  exclusionReason: string | null
  caseQualityScore: number | null
  caseQualityVersion: typeof CASE_QUALITY_VERSION
}

export type AnalysisEvidenceEnvelope = {
  contractVersion: typeof ANALYSIS_CONTRACT_VERSION
  projectId: string
  analysisType: string
  metricKey: string
  metricVersion: string
  calculationMethod: string
  filters: Record<string, unknown>
  windowStart: string
  windowEnd: string
  evidenceCutoffAt: string
  sourceRecordIds: string[]
  sampleSize: number
  dataFreshnessAt: string | null
  confidence: number | null
  uncertainty: Record<string, unknown>
  evidenceLineage: Record<string, unknown>
  reproducibilityRef: string
  algorithmVersion: string | null
}

export type HistoricalOutcomeAnalysis =
  | {
      status: 'INSUFFICIENT_EVIDENCE'
      sampleSize: number
      requiredSampleSize: number
      cases: HistoricalCase[]
    }
  | {
      status: 'OK'
      sampleSize: number
      cases: HistoricalCase[]
      outcomeCounts: Record<CanonicalOutcomeClass, number>
    }

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

function parseTimestamp(value: string, fieldName: string): number {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`${fieldName} must be a valid timestamp.`)
  return timestamp
}

function clampUnit(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function isSyntheticOrTestSource(sourceKind: string): boolean {
  const normalized = sourceKind.trim().toUpperCase()
  return normalized.includes('SYNTHETIC') || normalized.includes('DEMO') || normalized.includes('TEST')
}

export function canonicalOutcomeFromObservedEvidence(input: ObservedOutcomeEvidence): CanonicalOutcomeClass | null {
  if (input.adjudicationState !== 'ADJUDICATED') return null
  if (!input.verifiedOutcomeClass || !input.observedAt || !input.evidenceAvailableAt) return null
  return input.verifiedOutcomeClass
}

export function assessLearningCase(input: HistoricalCase, evidenceCutoffAt: string): CaseAssessment {
  const cutoff = parseTimestamp(evidenceCutoffAt, 'evidenceCutoffAt')

  if (!input.persisted) {
    return { learningEligible: false, exclusionReason: 'NON_PERSISTED_CASE', caseQualityScore: null, caseQualityVersion: CASE_QUALITY_VERSION }
  }
  if (isSyntheticOrTestSource(input.sourceKind)) {
    return { learningEligible: false, exclusionReason: 'SYNTHETIC_OR_TEST_CASE', caseQualityScore: null, caseQualityVersion: CASE_QUALITY_VERSION }
  }
  if (input.adjudicationState !== 'ADJUDICATED') {
    return { learningEligible: false, exclusionReason: 'OUTCOME_NOT_ADJUDICATED', caseQualityScore: null, caseQualityVersion: CASE_QUALITY_VERSION }
  }
  if (!input.outcomeClass || !input.observedAt || !input.evidenceAvailableAt) {
    return { learningEligible: false, exclusionReason: 'OBSERVED_OUTCOME_EVIDENCE_INCOMPLETE', caseQualityScore: null, caseQualityVersion: CASE_QUALITY_VERSION }
  }

  const observedAt = parseTimestamp(input.observedAt, 'observedAt')
  const evidenceAvailableAt = parseTimestamp(input.evidenceAvailableAt, 'evidenceAvailableAt')
  if (observedAt > cutoff || evidenceAvailableAt > cutoff) {
    return { learningEligible: false, exclusionReason: 'EVIDENCE_AFTER_CUTOFF', caseQualityScore: null, caseQualityVersion: CASE_QUALITY_VERSION }
  }

  const quality = scoreCaseQuality(input)
  return { learningEligible: true, exclusionReason: null, caseQualityScore: quality, caseQualityVersion: CASE_QUALITY_VERSION }
}

export function scoreCaseQuality(input: HistoricalCase): number {
  const factors = [
    [clampUnit(input.provenanceCompleteness), 0.2],
    [clampUnit(input.sourceReliability), 0.15],
    [clampUnit(input.outcomeConfidence), 0.2],
    [input.adjudicationState === 'ADJUDICATED' ? 1 : 0, 0.15],
    [clampUnit(input.temporalCompleteness), 0.1],
    [clampUnit(input.domainRelevance), 0.05],
    [clampUnit(input.recurrenceObservationCompleteness), 0.05],
    [input.hasExecutionEvidence ? 1 : 0, 0.05],
    [input.hasDownstreamImpactEvidence ? 1 : 0, 0.05],
  ] as const

  const weighted = factors.reduce((sum, [value, weight]) => sum + value * weight, 0)
  return Number(weighted.toFixed(4))
}

export function deduplicateHistoricalCases(cases: HistoricalCase[]): HistoricalCase[] {
  const byIdentity = new Map<string, HistoricalCase>()
  for (const candidate of cases) {
    const identity = `${candidate.projectId}:${candidate.caseKey}`
    const existing = byIdentity.get(identity)
    if (!existing) {
      byIdentity.set(identity, candidate)
      continue
    }

    const existingTime = existing.evidenceAvailableAt ? Date.parse(existing.evidenceAvailableAt) : 0
    const candidateTime = candidate.evidenceAvailableAt ? Date.parse(candidate.evidenceAvailableAt) : 0
    if (candidateTime > existingTime) byIdentity.set(identity, candidate)
  }
  return [...byIdentity.values()]
}

export function analyzeHistoricalOutcomes(input: {
  projectId: string
  cases: HistoricalCase[]
  evidenceCutoffAt: string
  minimumSampleSize?: number
}): HistoricalOutcomeAnalysis {
  const minimumSampleSize = Math.max(1, input.minimumSampleSize ?? 5)
  const eligible = deduplicateHistoricalCases(input.cases)
    .filter((candidate) => candidate.projectId === input.projectId)
    .filter((candidate) => assessLearningCase(candidate, input.evidenceCutoffAt).learningEligible)

  if (eligible.length < minimumSampleSize) {
    return { status: 'INSUFFICIENT_EVIDENCE', sampleSize: eligible.length, requiredSampleSize: minimumSampleSize, cases: eligible }
  }

  const outcomeCounts = Object.fromEntries(OUTCOME_CLASSES.map((outcome) => [outcome, 0])) as Record<CanonicalOutcomeClass, number>
  for (const candidate of eligible) {
    if (candidate.outcomeClass) outcomeCounts[candidate.outcomeClass] += 1
  }

  return { status: 'OK', sampleSize: eligible.length, cases: eligible, outcomeCounts }
}

export function buildAnalysisEvidenceEnvelope(input: Omit<AnalysisEvidenceEnvelope, 'contractVersion'>): AnalysisEvidenceEnvelope {
  const windowStart = parseTimestamp(input.windowStart, 'windowStart')
  const windowEnd = parseTimestamp(input.windowEnd, 'windowEnd')
  const cutoff = parseTimestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')
  if (windowStart > windowEnd) throw new Error('Analysis window start must not be after its end.')
  if (windowEnd > cutoff) throw new Error('Analysis window must not extend beyond the evidence cutoff.')
  if (input.dataFreshnessAt && parseTimestamp(input.dataFreshnessAt, 'dataFreshnessAt') > cutoff) {
    throw new Error('Data freshness timestamp must not extend beyond the evidence cutoff.')
  }
  if (!input.metricVersion.trim()) throw new Error('metricVersion is required for reproducibility.')
  if (!input.calculationMethod.trim()) throw new Error('calculationMethod is required for reproducibility.')
  if (!input.reproducibilityRef.trim()) throw new Error('reproducibilityRef is required.')
  if (input.sampleSize < 0 || !Number.isInteger(input.sampleSize)) throw new Error('sampleSize must be a non-negative integer.')
  if (input.confidence != null && (input.confidence < 0 || input.confidence > 1)) throw new Error('confidence must be between 0 and 1.')

  return { contractVersion: ANALYSIS_CONTRACT_VERSION, ...input }
}
