import { createAdminClient } from '@/lib/supabase/admin'
import { buildGovernedRealCaseAnalysis, type PersistedLearningCaseRow } from '@/lib/data-quality/governed-real-case-analysis'

function assertTimestamp(value: string, fieldName: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be a valid timestamp.`)
  return parsed
}

export async function runGovernedRealCaseAnalysis(input: {
  projectId: string
  windowStart: string
  windowEnd: string
  evidenceCutoffAt: string
  minimumSampleSize?: number
  persist?: boolean
}) {
  const windowStart = assertTimestamp(input.windowStart, 'windowStart')
  const windowEnd = assertTimestamp(input.windowEnd, 'windowEnd')
  const cutoff = assertTimestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')
  if (windowStart > windowEnd) throw new Error('windowStart must not be after windowEnd.')
  if (windowEnd > cutoff) throw new Error('windowEnd must not be after evidenceCutoffAt.')

  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_learning_cases')
    .select('id,project_id,case_key,source_kind,decision_status,outcome_status,confidence,evidence,occurred_at,created_at,updated_at')
    .eq('project_id', input.projectId)
    .eq('status', 'ACTIVE')
    .gte('occurred_at', input.windowStart)
    .lte('occurred_at', input.windowEnd)
    .lte('created_at', input.evidenceCutoffAt)
    .lte('updated_at', input.evidenceCutoffAt)
    .order('occurred_at', { ascending: true })
    .limit(1000)

  if (error) throw new Error(`Unable to load governed historical learning cases: ${error.message}`)

  const rows = (data ?? []) as PersistedLearningCaseRow[]
  const result = buildGovernedRealCaseAnalysis({
    projectId: input.projectId,
    rows,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    evidenceCutoffAt: input.evidenceCutoffAt,
    minimumSampleSize: input.minimumSampleSize,
  })

  if (input.persist === false) return result

  if (result.assessments.length > 0) {
    const assessmentRows = result.assessments.map((assessment) => ({
      project_id: assessment.projectId,
      learning_case_id: assessment.learningCaseId,
      evidence_cutoff_at: assessment.evidenceCutoffAt,
      learning_eligible: assessment.learningEligible,
      learning_exclusion_reason: assessment.learningExclusionReason,
      adjudication_state: assessment.adjudicationState,
      outcome_confidence: assessment.outcomeConfidence,
      case_quality_score: assessment.caseQualityScore,
      case_quality_version: assessment.caseQualityVersion,
      quality_factors: assessment.qualityFactors,
      last_observed_at: assessment.lastObservedAt,
      assessed_at: new Date().toISOString(),
    }))

    const { error: assessmentError } = await admin
      .schema('governance')
      .from('learning_case_assessments')
      .upsert(assessmentRows, { onConflict: 'learning_case_id,evidence_cutoff_at' })

    if (assessmentError) throw new Error(`Unable to persist governed learning case assessments: ${assessmentError.message}`)
  }

  const envelope = result.envelope
  const { error: envelopeError } = await admin
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

  if (envelopeError) throw new Error(`Unable to persist governed analysis evidence envelope: ${envelopeError.message}`)

  return result
}
