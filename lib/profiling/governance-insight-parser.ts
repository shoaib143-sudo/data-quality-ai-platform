export type ProfilingGovernanceInsight = {
  profileRunId: string
  datasetVersionId: string
  datasetId: string
  projectId: string
  runStatus: string
  startedAt: string
  completedAt: string | null
  rowCount: number | null
  columnCount: number | null
  duplicateRowCount: number | null
  completenessScore: number | null
  uniquenessScore: number | null
  validityScore: number | null
  accuracyScore: number | null
  overallScore: number | null
  totalFindings: number
  highFindings: number
  mediumFindings: number
  infoFindings: number
  investigationPresent: boolean
}

function optionalNumber(value: unknown) {
  if (value == null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error('Canonical profiling governance insight contains an invalid numeric value')
  return parsed
}

function requiredCount(value: unknown) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Canonical profiling governance insight contains an invalid count')
  return parsed
}

export function parseProfilingGovernanceInsightRow(row: Record<string, unknown>): ProfilingGovernanceInsight {
  if (typeof row.profile_run_id !== 'string' || typeof row.dataset_version_id !== 'string' || typeof row.dataset_id !== 'string' || typeof row.project_id !== 'string') {
    throw new Error('Canonical profiling governance insight identity is invalid')
  }
  if (typeof row.run_status !== 'string' || typeof row.started_at !== 'string' || typeof row.investigation_present !== 'boolean') {
    throw new Error('Canonical profiling governance insight state is invalid')
  }
  return {
    profileRunId: row.profile_run_id,
    datasetVersionId: row.dataset_version_id,
    datasetId: row.dataset_id,
    projectId: row.project_id,
    runStatus: row.run_status,
    startedAt: row.started_at,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
    rowCount: optionalNumber(row.row_count),
    columnCount: optionalNumber(row.column_count),
    duplicateRowCount: optionalNumber(row.duplicate_row_count),
    completenessScore: optionalNumber(row.completeness_score),
    uniquenessScore: optionalNumber(row.uniqueness_score),
    validityScore: optionalNumber(row.validity_score),
    accuracyScore: optionalNumber(row.accuracy_score),
    overallScore: optionalNumber(row.overall_score),
    totalFindings: requiredCount(row.total_findings),
    highFindings: requiredCount(row.high_findings),
    mediumFindings: requiredCount(row.medium_findings),
    infoFindings: requiredCount(row.info_findings),
    investigationPresent: row.investigation_present,
  }
}

