import { createAdminClient } from '@/lib/supabase/admin'

type Finding = {
  id: string
  finding_type: string
  severity: string
  title: string
  description: string
  confidence: number | null
  evidence: Record<string, unknown> | null
  recommendation: Record<string, unknown> | null
  profile_column_id: string | null
}

type Score = {
  completeness_score: number | null
  uniqueness_score: number | null
  validity_score: number | null
  accuracy_score: number | null
  overall_score: number | null
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function scorePercent(value: number | null) {
  return value === null ? null : Math.round(value * 1000) / 10
}

export async function investigateProfilingRun(
  profilingRunId: string,
  datasetVersionId: string,
) {
  const supabase = createAdminClient()

  const [{ data: profileRun, error: runError }, { data: score, error: scoreError }, { data: findings, error: findingsError }, { data: columns, error: columnsError }] = await Promise.all([
    supabase
      .schema('profiling')
      .from('profile_runs')
      .select('id, dataset_version_id, row_count, column_count, summary, status')
      .eq('id', profilingRunId)
      .single(),
    supabase
      .schema('profiling')
      .from('data_quality_scores')
      .select('completeness_score, uniqueness_score, validity_score, accuracy_score, overall_score')
      .eq('profile_run_id', profilingRunId)
      .maybeSingle(),
    supabase
      .schema('profiling')
      .from('profile_findings')
      .select('id, finding_type, severity, title, description, confidence, evidence, recommendation, profile_column_id')
      .eq('profile_run_id', profilingRunId)
      .order('created_at', { ascending: true }),
    supabase
      .schema('profiling')
      .from('profile_columns')
      .select('id, column_name, semantic_type, inferred_type, confidence')
      .eq('profile_run_id', profilingRunId)
      .order('ordinal_position', { ascending: true }),
  ])

  if (runError) throw new Error(`Unable to load profiling run for investigation: ${runError.message}`)
  if (scoreError) throw new Error(`Unable to load quality score for investigation: ${scoreError.message}`)
  if (findingsError) throw new Error(`Unable to load profiling findings for investigation: ${findingsError.message}`)
  if (columnsError) throw new Error(`Unable to load profiling columns for investigation: ${columnsError.message}`)
  if (!profileRun) throw new Error(`Profiling run ${profilingRunId} was not found.`)

  const typedFindings = (findings ?? []) as Finding[]
  const typedScore = (score ?? null) as Score | null
  const scoreValue = asNumber(typedScore?.overall_score ?? null)
  const highSeverity = typedFindings.filter((finding) => ['HIGH', 'CRITICAL'].includes(String(finding.severity).toUpperCase()))
  const completenessFindings = typedFindings.filter((finding) => finding.finding_type === 'COMPLETENESS')
  const sensitivityFindings = typedFindings.filter((finding) => finding.finding_type === 'SENSITIVITY')

  const technicalSummary = scoreValue === null
    ? `The profiling run completed with ${typedFindings.length} persisted findings, but no overall quality score is available.`
    : `The profiling run scored ${scorePercent(scoreValue)}% overall quality across ${profileRun.column_count ?? columns?.length ?? 0} columns and ${profileRun.row_count ?? 0} source rows.`

  const probableRootCauses: Array<Record<string, unknown>> = []
  if (completenessFindings.length) {
    probableRootCauses.push({
      cause: 'upstream_or_source_completeness_issue',
      confidence: 0.65,
      rationale: 'One or more columns exceed the configured completeness threshold. Profiling evidence identifies the symptom, but does not prove which upstream process introduced the missing values.',
      evidence_finding_ids: completenessFindings.map((finding) => finding.id),
    })
  }
  if (sensitivityFindings.length) {
    probableRootCauses.push({
      cause: 'sensitive_data_present_in_profiled_columns',
      confidence: 0.9,
      rationale: 'Observed values matched the profiling engine sensitive-data patterns. Classification is evidence based and should be reviewed before governance action.',
      evidence_finding_ids: sensitivityFindings.map((finding) => finding.id),
    })
  }
  if (!probableRootCauses.length && highSeverity.length === 0) {
    probableRootCauses.push({
      cause: 'no_high_confidence_root_cause_detected',
      confidence: 0.95,
      rationale: 'The current deterministic profiling evidence does not contain enough signal to attribute a specific root cause.',
      evidence_finding_ids: [],
    })
  }

  const businessIssue = highSeverity.length
    ? 'Critical or high-severity data quality conditions require investigation before the dataset can be treated as fully trustworthy for downstream business use.'
    : typedFindings.length
      ? 'The dataset contains observable data quality or governance conditions that may affect downstream reporting, analytics, operations, or controlled data use.'
      : 'No material deterministic profiling finding was generated for this run.'

  const businessImpact = highSeverity.length
    ? 'Potential impact includes incorrect decisions, failed downstream processing, customer or operational disruption, and increased regulatory or control exposure. The current profiling evidence does not quantify financial impact.'
    : typedFindings.length
      ? 'Potential impact depends on how the affected columns are consumed. Business criticality must be combined with lineage, usage, and ownership context before impact is quantified.'
      : 'No material business impact is inferred from the current deterministic evidence.'

  const recommendations: Array<Record<string, unknown>> = []
  if (completenessFindings.length) {
    recommendations.push({
      action: 'investigate_upstream_completeness',
      priority: highSeverity.length ? 'HIGH' : 'MEDIUM',
      approval_required: false,
      rationale: 'Trace affected fields to the source and upstream transformation that introduced missing values. Do not modify production data automatically.',
      finding_ids: completenessFindings.map((finding) => finding.id),
    })
  }
  if (sensitivityFindings.length) {
    recommendations.push({
      action: 'review_sensitive_data_classification_and_access',
      priority: 'MEDIUM',
      approval_required: true,
      rationale: 'Validate the classification and apply governed access controls through the appropriate approval workflow.',
      finding_ids: sensitivityFindings.map((finding) => finding.id),
    })
  }
  if (!recommendations.length) {
    recommendations.push({
      action: 'continue_monitoring',
      priority: 'LOW',
      approval_required: false,
      rationale: 'No corrective action is justified by the current deterministic evidence.',
      finding_ids: [],
    })
  }

  const evidence = typedFindings.map((finding) => ({
    finding_id: finding.id,
    type: finding.finding_type,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    confidence: finding.confidence,
    evidence: finding.evidence,
    recommendation: finding.recommendation,
    column: columns?.find((column) => column.id === finding.profile_column_id)?.column_name ?? null,
  }))

  const investigationConfidence = typedFindings.length
    ? Math.round((typedFindings.reduce((sum, finding) => sum + (finding.confidence ?? 0), 0) / typedFindings.length) * 100) / 100
    : 0.95

  return {
    investigation_version: '1.0',
    investigation_mode: 'deterministic_evidence_first',
    profiling_run_id: profilingRunId,
    dataset_version_id: datasetVersionId,
    status: 'COMPLETED',
    technical_summary: technicalSummary,
    quality_score: typedScore
      ? {
          overall: scoreValue,
          overall_percent: scorePercent(scoreValue),
          completeness: typedScore.completeness_score,
          uniqueness: typedScore.uniqueness_score,
          validity: typedScore.validity_score,
          accuracy: typedScore.accuracy_score,
        }
      : null,
    finding_summary: {
      total: typedFindings.length,
      high_or_critical: highSeverity.length,
      completeness: completenessFindings.length,
      sensitivity: sensitivityFindings.length,
    },
    probable_root_causes: probableRootCauses,
    business_issue: businessIssue,
    business_impact: businessImpact,
    risk: highSeverity.length ? 'HIGH' : typedFindings.length ? 'MEDIUM' : 'LOW',
    recommendations,
    approval_required: recommendations.some((recommendation) => recommendation.approval_required === true),
    confidence: investigationConfidence,
    evidence,
    limitations: [
      'Root cause attribution is evidence based and does not claim upstream causality without lineage or operational evidence.',
      'Business impact is qualitative until business criticality, lineage, usage, and financial or operational impact data are available.',
      'No production data, schema, governance policy, or pipeline change is executed by this investigation step.',
    ],
  }
}
