import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildGovernedBeforeAfterEvidenceAnalysis,
  type BeforeAfterEvidenceRow,
} from '@/lib/data-quality/governed-before-after-evidence'

function assertTimestamp(value: string, fieldName: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be a valid timestamp.`)
  return parsed
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function runGovernedBeforeAfterEvidenceAnalysis(input: {
  projectId: string
  windowStart: string
  windowEnd: string
  evidenceCutoffAt: string
  minimumCaseSampleSize?: number
  persist?: boolean
}) {
  const windowStart = assertTimestamp(input.windowStart, 'windowStart')
  const windowEnd = assertTimestamp(input.windowEnd, 'windowEnd')
  const cutoff = assertTimestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')
  if (windowStart > windowEnd) throw new Error('windowStart must not be after windowEnd.')
  if (windowEnd > cutoff) throw new Error('windowEnd must not be after evidenceCutoffAt.')

  const admin = createAdminClient()
  const [knowledgeResult, actionResult] = await Promise.all([
    admin
      .schema('governance')
      .from('remediation_knowledge')
      .select('id,project_id,outcome_status,before_evidence,after_evidence,metadata,created_at,updated_at')
      .eq('project_id', input.projectId)
      .gte('updated_at', input.windowStart)
      .lte('updated_at', input.windowEnd)
      .lte('created_at', input.evidenceCutoffAt)
      .lte('updated_at', input.evidenceCutoffAt)
      .order('updated_at', { ascending: true })
      .limit(1000),
    admin
      .schema('governance')
      .from('governed_action_outcomes')
      .select('id,project_id,outcome_type,before_evidence,after_evidence,evidence_context,runtime_evidence,verification_state,execution_state,verified_at,recorded_at')
      .eq('project_id', input.projectId)
      .eq('verification_state', 'VERIFIED')
      .in('execution_state', ['EXECUTED', 'ROLLED_BACK', 'FAILED'])
      .not('verified_at', 'is', null)
      .gte('verified_at', input.windowStart)
      .lte('verified_at', input.windowEnd)
      .lte('verified_at', input.evidenceCutoffAt)
      .lte('recorded_at', input.evidenceCutoffAt)
      .order('verified_at', { ascending: true })
      .limit(1000),
  ])

  if (knowledgeResult.error) {
    throw new Error(`Unable to load remediation before/after evidence: ${knowledgeResult.error.message}`)
  }
  if (actionResult.error) {
    throw new Error(`Unable to load governed action before/after evidence: ${actionResult.error.message}`)
  }

  const rows: BeforeAfterEvidenceRow[] = [
    ...(knowledgeResult.data ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      source: 'REMEDIATION_KNOWLEDGE' as const,
      observedAt: row.updated_at,
      evidenceAvailableAt: row.updated_at,
      beforeEvidence: objectValue(row.before_evidence),
      afterEvidence: objectValue(row.after_evidence),
      outcomeLabel: row.outcome_status ?? null,
      metadata: objectValue(row.metadata),
    })),
    ...(actionResult.data ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      source: 'GOVERNED_ACTION_OUTCOME' as const,
      observedAt: row.verified_at as string,
      evidenceAvailableAt: row.recorded_at,
      beforeEvidence: objectValue(row.before_evidence),
      afterEvidence: objectValue(row.after_evidence),
      outcomeLabel: row.outcome_type ?? null,
      metadata: {
        ...objectValue(row.evidence_context),
        ...objectValue(row.runtime_evidence),
      },
    })),
  ]

  const result = buildGovernedBeforeAfterEvidenceAnalysis({
    projectId: input.projectId,
    rows,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    evidenceCutoffAt: input.evidenceCutoffAt,
    minimumCaseSampleSize: input.minimumCaseSampleSize,
  })

  if (input.persist === false) return result

  const envelope = result.envelope
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

  if (error) throw new Error(`Unable to persist governed before/after evidence envelope: ${error.message}`)
  return result
}
