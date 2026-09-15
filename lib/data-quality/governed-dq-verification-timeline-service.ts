import { createAdminClient } from '@/lib/supabase/admin'
import { buildGovernedDqVerificationTimeline, type DqVerificationOutcomeRow } from '@/lib/data-quality/governed-dq-verification-timeline'

function assertTimestamp(value: string, fieldName: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be a valid timestamp.`)
  return parsed
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function runGovernedDqVerificationTimeline(input: {
  projectId: string
  windowStart: string
  windowEnd: string
  evidenceCutoffAt: string
  minimumSampleSize?: number
  persist?: boolean
}) {
  const start = assertTimestamp(input.windowStart, 'windowStart')
  const end = assertTimestamp(input.windowEnd, 'windowEnd')
  const cutoff = assertTimestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')
  if (start > end) throw new Error('windowStart must not be after windowEnd.')
  if (end > cutoff) throw new Error('windowEnd must not be after evidenceCutoffAt.')

  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('governance')
    .from('data_quality_remediation_outcomes')
    .select('id,project_id,status,execution_mode,production_mutation_performed,checks,outcome,created_at,verified_at,verification_generation,verification_profile_run_id')
    .eq('project_id', input.projectId)
    .eq('status', 'VERIFIED')
    .not('verified_at', 'is', null)
    .gte('verified_at', input.windowStart)
    .lte('verified_at', input.windowEnd)
    .lte('verified_at', input.evidenceCutoffAt)
    .lte('created_at', input.evidenceCutoffAt)
    .order('verified_at', { ascending: true })
    .limit(1000)

  if (error) throw new Error(`Unable to load DQ verification outcomes: ${error.message}`)

  const rows: DqVerificationOutcomeRow[] = (data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    executionMode: row.execution_mode,
    productionMutationPerformed: row.production_mutation_performed,
    checks: objectValue(row.checks),
    outcome: objectValue(row.outcome),
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    verificationGeneration: row.verification_generation,
    verificationProfileRunId: row.verification_profile_run_id,
  }))

  const result = buildGovernedDqVerificationTimeline({
    projectId: input.projectId,
    rows,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    evidenceCutoffAt: input.evidenceCutoffAt,
    minimumSampleSize: input.minimumSampleSize,
  })

  if (input.persist === false) return result

  const envelope = result.envelope
  const { error: insertError } = await admin
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

  if (insertError) throw new Error(`Unable to persist DQ verification timeline envelope: ${insertError.message}`)
  return result
}
