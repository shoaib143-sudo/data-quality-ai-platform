import {
  analyzeHistoricalOutcomes,
  assessLearningCase,
  buildAnalysisEvidenceEnvelope,
  type AdjudicationState,
  type AnalysisEvidenceEnvelope,
  type CanonicalOutcomeClass,
  type HistoricalCase,
  type HistoricalOutcomeAnalysis,
} from '@/lib/data-quality/governed-analysis-foundation'

export const REAL_CASE_ANALYSIS_VERSION = 'real-case-analysis-v1' as const

export type PersistedLearningCaseRow = {
  id: string
  project_id: string
  source_agent_run_id: string | null
  case_key: string
  source_kind: string
  decision_status: string | null
  outcome_status: string | null
  confidence: number | string | null
  evidence: Record<string, unknown> | null
  occurred_at: string | null
  created_at: string
  updated_at: string
}

export type GovernedActionOutcomeRow = {
  id: string
  project_id: string
  source_agent_run_id: string | null
  verification_key: string
  decision_state: string
  execution_state: string
  verification_state: string
  outcome_type: string
  effectiveness: number | string | null
  verified_at: string | null
  recorded_at: string
}

export type GovernedRealCaseResult = {
  cases: HistoricalCase[]
  assessments: Array<{
    learningCaseId: string
    projectId: string
    evidenceCutoffAt: string
    learningEligible: boolean
    learningExclusionReason: string | null
    adjudicationState: AdjudicationState
    outcomeConfidence: number | null
    caseQualityScore: number | null
    caseQualityVersion: string
    qualityFactors: Record<string, unknown>
    lastObservedAt: string | null
  }>
  analysis: HistoricalOutcomeAnalysis
  envelope: AnalysisEvidenceEnvelope
}

function normalized(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? ''
}

function numericConfidence(value: number | string | null): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null
  return parsed
}

export function adjudicationFromDecisionStatus(status: string | null): AdjudicationState {
  switch (normalized(status)) {
    case 'VERIFIED':
    case 'ADJUDICATED':
      return 'ADJUDICATED'
    case 'PENDING':
    case 'PENDING_REVIEW':
      return 'PENDING'
    default:
      return 'UNADJUDICATED'
  }
}

export function canonicalOutcomeFromPersistedStatus(status: string | null): CanonicalOutcomeClass | null {
  switch (normalized(status)) {
    case 'WORKED':
    case 'SUCCESS':
      return 'SUCCESS'
    case 'PARTIAL_SUCCESS':
      return 'PARTIAL_SUCCESS'
    case 'FAILED':
    case 'FAILURE':
      return 'FAILURE'
    case 'UNRESOLVED':
      return 'UNRESOLVED'
    case 'ROLLED_BACK':
      return 'ROLLED_BACK'
    case 'ESCALATED':
      return 'ESCALATED'
    case 'OVERRIDDEN':
      return 'OVERRIDDEN'
    case 'REJECTED':
      return 'REJECTED'
    case 'RECURRENT':
      return 'RECURRENT'
    default:
      return null
  }
}

export function canonicalOutcomeFromVerifiedActionOutcome(row: GovernedActionOutcomeRow): CanonicalOutcomeClass | null {
  if (normalized(row.verification_state) !== 'VERIFIED' || !row.verified_at) return null

  switch (normalized(row.outcome_type)) {
    case 'EFFECTIVE':
      return 'SUCCESS'
    case 'INEFFECTIVE':
    case 'FAILED':
      return 'FAILURE'
    case 'PARTIAL':
      return 'PARTIAL_SUCCESS'
    case 'ROLLED_BACK':
      return 'ROLLED_BACK'
    case 'REJECTED':
      return 'REJECTED'
    default:
      return null
  }
}

export function matchUniqueVerifiedOutcome(
  learningCase: PersistedLearningCaseRow,
  outcomeRows: GovernedActionOutcomeRow[],
): GovernedActionOutcomeRow | null {
  if (!learningCase.source_agent_run_id) return null

  const matches = outcomeRows.filter(
    (outcome) =>
      outcome.project_id === learningCase.project_id &&
      outcome.source_agent_run_id === learningCase.source_agent_run_id &&
      normalized(outcome.verification_state) === 'VERIFIED' &&
      Boolean(outcome.verified_at) &&
      canonicalOutcomeFromVerifiedActionOutcome(outcome) !== null,
  )

  return matches.length === 1 ? matches[0] : null
}

export function mapPersistedLearningCase(
  row: PersistedLearningCaseRow,
  verifiedOutcome?: GovernedActionOutcomeRow | null,
): HistoricalCase {
  const evidence = row.evidence && typeof row.evidence === 'object' ? row.evidence : {}
  const hasPersistedEvidence = Object.keys(evidence).length > 0
  const verifiedCanonicalOutcome = verifiedOutcome ? canonicalOutcomeFromVerifiedActionOutcome(verifiedOutcome) : null
  const verifiedAt = verifiedCanonicalOutcome ? verifiedOutcome?.verified_at ?? null : null
  const temporalComplete = Boolean((verifiedAt ?? row.occurred_at) && (verifiedAt ?? row.updated_at))

  return {
    id: row.id,
    projectId: row.project_id,
    caseKey: row.case_key,
    persisted: true,
    sourceKind: row.source_kind,
    outcomeClass: verifiedCanonicalOutcome ?? canonicalOutcomeFromPersistedStatus(row.outcome_status),
    adjudicationState: verifiedCanonicalOutcome ? 'ADJUDICATED' : adjudicationFromDecisionStatus(row.decision_status),
    observedAt: verifiedAt ?? row.occurred_at,
    evidenceAvailableAt: verifiedAt ?? row.updated_at,
    outcomeConfidence: numericConfidence(row.confidence),
    provenanceCompleteness: hasPersistedEvidence || verifiedCanonicalOutcome ? 1 : 0,
    sourceReliability: verifiedCanonicalOutcome ? 1 : undefined,
    temporalCompleteness: temporalComplete ? 1 : 0,
    domainRelevance: undefined,
    recurrenceObservationCompleteness: undefined,
    hasExecutionEvidence: verifiedOutcome ? normalized(verifiedOutcome.execution_state) !== 'NOT_EXECUTED' : false,
    hasDownstreamImpactEvidence: false,
  }
}

export function buildGovernedRealCaseAnalysis(input: {
  projectId: string
  rows: PersistedLearningCaseRow[]
  outcomeRows?: GovernedActionOutcomeRow[]
  windowStart: string
  windowEnd: string
  evidenceCutoffAt: string
  minimumSampleSize?: number
}): GovernedRealCaseResult {
  const outcomeRows = input.outcomeRows ?? []
  const cases = input.rows.map((row) => mapPersistedLearningCase(row, matchUniqueVerifiedOutcome(row, outcomeRows)))
  const assessments = cases.map((candidate) => {
    const assessment = assessLearningCase(candidate, input.evidenceCutoffAt)
    return {
      learningCaseId: candidate.id,
      projectId: candidate.projectId,
      evidenceCutoffAt: input.evidenceCutoffAt,
      learningEligible: assessment.learningEligible,
      learningExclusionReason: assessment.exclusionReason,
      adjudicationState: candidate.adjudicationState,
      outcomeConfidence: candidate.outcomeConfidence ?? null,
      caseQualityScore: assessment.caseQualityScore,
      caseQualityVersion: assessment.caseQualityVersion,
      qualityFactors: {
        provenance_completeness: candidate.provenanceCompleteness ?? null,
        source_reliability: candidate.sourceReliability ?? null,
        temporal_completeness: candidate.temporalCompleteness ?? null,
        domain_relevance: candidate.domainRelevance ?? null,
        recurrence_observation_completeness: candidate.recurrenceObservationCompleteness ?? null,
        has_execution_evidence: candidate.hasExecutionEvidence ?? false,
        has_downstream_impact_evidence: candidate.hasDownstreamImpactEvidence ?? false,
      },
      lastObservedAt: candidate.observedAt,
    }
  })

  const analysis = analyzeHistoricalOutcomes({
    projectId: input.projectId,
    cases,
    evidenceCutoffAt: input.evidenceCutoffAt,
    minimumSampleSize: input.minimumSampleSize,
  })

  const eligibleIds = analysis.cases.map((candidate) => candidate.id).sort()
  const freshnessValues = analysis.cases
    .map((candidate) => candidate.evidenceAvailableAt)
    .filter((value): value is string => Boolean(value))
    .sort()
  const freshest = freshnessValues.length > 0 ? freshnessValues[freshnessValues.length - 1] : null

  const envelope = buildAnalysisEvidenceEnvelope({
    projectId: input.projectId,
    analysisType: 'REAL_CASE_OUTCOME_DISTRIBUTION',
    metricKey: 'governed_real_case_outcome_distribution',
    metricVersion: REAL_CASE_ANALYSIS_VERSION,
    calculationMethod: 'Project-scoped count of unique, persisted, adjudicated canonical learning cases with observed outcome evidence available on or before the evidence cutoff. A uniquely matched VERIFIED governed action outcome may enrich the canonical case; execution state alone never determines outcome success.',
    filters: {
      status: 'ACTIVE',
      project_id: input.projectId,
      synthetic_demo_test_excluded: true,
      adjudication_required: true,
      verified_action_outcome_enrichment_requires_unique_source_agent_run_match: true,
    },
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    evidenceCutoffAt: input.evidenceCutoffAt,
    sourceRecordIds: eligibleIds,
    sampleSize: analysis.sampleSize,
    dataFreshnessAt: freshest,
    confidence: null,
    uncertainty: {
      status: analysis.status,
      minimum_sample_size: input.minimumSampleSize ?? 5,
      predictive_probability_exposed: false,
    },
    evidenceLineage: {
      canonical_source: 'agent.agent_learning_cases',
      canonical_source_record_ids: eligibleIds,
      verified_outcome_enrichment_source: 'governance.governed_action_outcomes',
      assessment_contract: 'governance.learning_case_assessments',
    },
    reproducibilityRef: [
      REAL_CASE_ANALYSIS_VERSION,
      input.projectId,
      input.windowStart,
      input.windowEnd,
      input.evidenceCutoffAt,
      eligibleIds.join(','),
    ].join(':'),
    algorithmVersion: REAL_CASE_ANALYSIS_VERSION,
  })

  return { cases, assessments, analysis, envelope }
}
