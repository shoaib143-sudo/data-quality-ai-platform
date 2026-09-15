import { createAdminClient } from '@/lib/supabase/admin'
import { runGovernedRealCaseAnalysis } from '@/lib/data-quality/governed-real-case-analysis-service'
import { buildGovernedRealCaseTrendComparison } from '@/lib/data-quality/governed-real-case-trends'

export async function runGovernedRealCaseTrendComparison(input: {
  projectId: string
  previousWindowStart: string
  previousWindowEnd: string
  currentWindowStart: string
  currentWindowEnd: string
  evidenceCutoffAt: string
  minimumSampleSize?: number
  persist?: boolean
}) {
  const [previous, current] = await Promise.all([
    runGovernedRealCaseAnalysis({
      projectId: input.projectId,
      windowStart: input.previousWindowStart,
      windowEnd: input.previousWindowEnd,
      evidenceCutoffAt: input.evidenceCutoffAt,
      minimumSampleSize: input.minimumSampleSize,
      persist: false,
    }),
    runGovernedRealCaseAnalysis({
      projectId: input.projectId,
      windowStart: input.currentWindowStart,
      windowEnd: input.currentWindowEnd,
      evidenceCutoffAt: input.evidenceCutoffAt,
      minimumSampleSize: input.minimumSampleSize,
      persist: false,
    }),
  ])

  const comparison = buildGovernedRealCaseTrendComparison({
    projectId: input.projectId,
    previous: {
      windowStart: input.previousWindowStart,
      windowEnd: input.previousWindowEnd,
      result: previous,
    },
    current: {
      windowStart: input.currentWindowStart,
      windowEnd: input.currentWindowEnd,
      result: current,
    },
    evidenceCutoffAt: input.evidenceCutoffAt,
    minimumSampleSize: input.minimumSampleSize,
  })

  if (input.persist === false) return comparison

  const envelope = comparison.envelope
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

  if (error) throw new Error(`Unable to persist governed real-case trend evidence envelope: ${error.message}`)
  return comparison
}
