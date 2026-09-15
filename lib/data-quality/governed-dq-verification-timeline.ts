import { buildAnalysisEvidenceEnvelope, type AnalysisEvidenceEnvelope } from '@/lib/data-quality/governed-analysis-foundation'

export const DQ_VERIFICATION_TIMELINE_VERSION = 'dq-verification-timeline-v1' as const

export type DqVerificationOutcomeRow = {
  id: string
  projectId: string
  status: string
  executionMode: string
  productionMutationPerformed: boolean
  checks: Record<string, unknown>
  outcome: Record<string, unknown>
  createdAt: string
  verifiedAt: string | null
  verificationGeneration: number
  verificationProfileRunId: string | null
}

export type DqVerificationTimelineResult = {
  status: 'OK' | 'INSUFFICIENT_EVIDENCE'
  sampleSize: number
  requiredSampleSize: number
  events: Array<{
    sourceRecordId: string
    verifiedAt: string
    executionMode: string
    productionMutationPerformed: boolean
    verificationGeneration: number
    verificationPassed: boolean | null
    verificationSource: string | null
    sourceFailedRuleCount: number | null
    verificationFailedRuleCount: number | null
    failedRuleDelta: number | null
    sourceSevereFailureCount: number | null
    verificationSevereFailureCount: number | null
    severeFailureDelta: number | null
    checkResults: Record<string, boolean>
    verificationProfileRunId: string | null
  }>
  envelope: AnalysisEvidenceEnvelope
}

function timestamp(value: string, label: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`)
  return parsed
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function checkResults(checks: Record<string, unknown>) {
  const result: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(checks).sort(([a], [b]) => a.localeCompare(b))) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const passed = (value as Record<string, unknown>).passed
    if (typeof passed === 'boolean') result[key] = passed
  }
  return result
}

export function buildGovernedDqVerificationTimeline(input: {
  projectId: string
  rows: DqVerificationOutcomeRow[]
  windowStart: string
  windowEnd: string
  evidenceCutoffAt: string
  minimumSampleSize?: number
}): DqVerificationTimelineResult {
  const start = timestamp(input.windowStart, 'windowStart')
  const end = timestamp(input.windowEnd, 'windowEnd')
  const cutoff = timestamp(input.evidenceCutoffAt, 'evidenceCutoffAt')
  if (start > end) throw new Error('windowStart must not be after windowEnd.')
  if (end > cutoff) throw new Error('windowEnd must not be after evidenceCutoffAt.')

  const requiredSampleSize = Math.max(1, Math.floor(input.minimumSampleSize ?? 1))
  const rows = input.rows
    .filter((row) => row.projectId === input.projectId)
    .filter((row) => row.status === 'VERIFIED' && row.verifiedAt)
    .filter((row) => {
      const verifiedAt = timestamp(row.verifiedAt as string, 'row.verifiedAt')
      const createdAt = timestamp(row.createdAt, 'row.createdAt')
      return verifiedAt >= start && verifiedAt <= end && verifiedAt <= cutoff && createdAt <= cutoff
    })
    .sort((a, b) => (a.verifiedAt as string).localeCompare(b.verifiedAt as string) || a.id.localeCompare(b.id))

  const events = rows.map((row) => {
    const sourceFailed = finiteNumber(row.outcome.source_failed_rule_count)
    const verificationFailed = finiteNumber(row.outcome.verification_failed_rule_count)
    const sourceSevere = finiteNumber(row.outcome.source_severe_failure_count)
    const verificationSevere = finiteNumber(row.outcome.verification_severe_failure_count)
    return {
      sourceRecordId: `GOVERNANCE.DATA_QUALITY_REMEDIATION_OUTCOMES:${row.id}`,
      verifiedAt: row.verifiedAt as string,
      executionMode: row.executionMode,
      productionMutationPerformed: row.productionMutationPerformed,
      verificationGeneration: row.verificationGeneration,
      verificationPassed: booleanValue(row.outcome.verification_passed),
      verificationSource: textValue(row.outcome.verification_source),
      sourceFailedRuleCount: sourceFailed,
      verificationFailedRuleCount: verificationFailed,
      failedRuleDelta: sourceFailed != null && verificationFailed != null ? verificationFailed - sourceFailed : null,
      sourceSevereFailureCount: sourceSevere,
      verificationSevereFailureCount: verificationSevere,
      severeFailureDelta: sourceSevere != null && verificationSevere != null ? verificationSevere - sourceSevere : null,
      checkResults: checkResults(row.checks),
      verificationProfileRunId: row.verificationProfileRunId,
    }
  })

  const sourceRecordIds = events.map((event) => event.sourceRecordId)
  const ready = events.length >= requiredSampleSize
  const dataFreshnessAt = events.length ? events[events.length - 1].verifiedAt : null

  const envelope = buildAnalysisEvidenceEnvelope({
    projectId: input.projectId,
    analysisType: 'DQ_VERIFICATION_EVIDENCE_TIMELINE',
    metricKey: 'dq_verification_evidence_timeline',
    metricVersion: DQ_VERIFICATION_TIMELINE_VERSION,
    calculationMethod: 'Chronological projection of persisted VERIFIED data-quality remediation verification evidence. Rule-count deltas are descriptive observations only and do not establish remediation effectiveness or causality.',
    filters: {
      project_id: input.projectId,
      verified_only: true,
      persisted_evidence_only: true,
      production_mutation_not_required_for_observation: true,
      descriptive_only: true,
    },
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    evidenceCutoffAt: input.evidenceCutoffAt,
    sourceRecordIds,
    sampleSize: events.length,
    dataFreshnessAt,
    confidence: null,
    uncertainty: {
      status: ready ? 'OK' : 'INSUFFICIENT_EVIDENCE',
      minimum_sample_size: requiredSampleSize,
      effectiveness_claimed: false,
      predictive_probability_exposed: false,
      causal_effect_claimed: false,
      rule_count_direction_is_not_causal_effect: true,
    },
    evidenceLineage: {
      source: 'governance.data_quality_remediation_outcomes',
      source_record_ids: sourceRecordIds,
    },
    reproducibilityRef: [DQ_VERIFICATION_TIMELINE_VERSION, input.projectId, input.windowStart, input.windowEnd, input.evidenceCutoffAt, sourceRecordIds.join(',')].join(':'),
    algorithmVersion: DQ_VERIFICATION_TIMELINE_VERSION,
  })

  return { status: ready ? 'OK' : 'INSUFFICIENT_EVIDENCE', sampleSize: events.length, requiredSampleSize, events, envelope }
}
