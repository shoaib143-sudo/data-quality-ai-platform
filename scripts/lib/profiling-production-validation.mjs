export function evaluateProfilingProductionSnapshot(snapshot) {
  const failures = []
  const warnings = []
  const latestRuns = Array.isArray(snapshot.latestRuns) ? snapshot.latestRuns : []
  const sourceTypes = snapshot.activeSourceTypes && typeof snapshot.activeSourceTypes === 'object'
    ? snapshot.activeSourceTypes
    : {}
  const latestAttempts = Array.isArray(snapshot.latestAttempts) ? snapshot.latestAttempts : []
  const ambiguousActiveSourceDatasetVersions = Array.isArray(snapshot.ambiguousActiveSourceDatasetVersions)
    ? snapshot.ambiguousActiveSourceDatasetVersions
    : []

  if (!Number.isFinite(snapshot.profileRuns) || snapshot.profileRuns < 1) failures.push('NO_PROFILE_RUNS')
  if (!Number.isFinite(snapshot.completedRuns) || snapshot.completedRuns < 1) failures.push('NO_COMPLETED_PROFILE_RUNS')
  if (latestRuns.length < 1) failures.push('NO_LATEST_COMPLETED_DATASET_VERSIONS')
  if (Number(sourceTypes.FILE ?? 0) < 1) failures.push('NO_ACTIVE_FILE_EXECUTION_SOURCE')
  if (Number(sourceTypes.JDBC ?? 0) < 1) failures.push('NO_ACTIVE_JDBC_EXECUTION_SOURCE')
  for (const datasetVersionId of ambiguousActiveSourceDatasetVersions) {
    failures.push(`AMBIGUOUS_ACTIVE_EXECUTION_SOURCE_${datasetVersionId}`)
  }

  const completedFileRuns = latestRuns.filter((run) => String(run.sourceType ?? '').toUpperCase() === 'FILE').length
  const completedJdbcRuns = latestRuns.filter((run) => String(run.sourceType ?? '').toUpperCase() === 'JDBC').length
  if (completedFileRuns < 1) failures.push('NO_COMPLETED_FILE_PROFILE')
  if (completedJdbcRuns < 1) failures.push('NO_COMPLETED_JDBC_PROFILE')

  for (const attempt of latestAttempts) {
    if (attempt.activeSource === true && attempt.status && attempt.status !== 'COMPLETED') {
      const code = attempt.errorCode ? `_${String(attempt.errorCode).toUpperCase()}` : ''
      warnings.push(`LATEST_ATTEMPT_${attempt.datasetVersionId ?? 'UNKNOWN'}_${String(attempt.status).toUpperCase()}${code}`)
    }
  }

  for (const run of latestRuns) {
    const prefix = `RUN_${run.id ?? 'UNKNOWN'}`
    if (!run.contract || run.contract.valid !== true) failures.push(`${prefix}_METRIC_CONTRACT_INVALID`)
    for (const key of ['metric_contract_valid', 'score_present', 'score_values_valid', 'score_consistent', 'completed_facts_present']) {
      if (run.contract?.[key] !== true) failures.push(`${prefix}_${key.toUpperCase()}_FALSE`)
    }
    if (Number(run.profileColumns ?? 0) < 1) failures.push(`${prefix}_NO_PROFILE_COLUMNS`)
    if (Number(run.metrics ?? 0) < 1) failures.push(`${prefix}_NO_METRICS`)
    if (run.scorePresent !== true) failures.push(`${prefix}_NO_QUALITY_SCORE`)
    if (run.investigationPresent !== true) failures.push(`${prefix}_NO_CANONICAL_INVESTIGATION`)
    if (run.governanceInsightPresent !== true) failures.push(`${prefix}_NO_GOVERNANCE_INSIGHT`)
    if (Number(run.findings ?? 0) === 0) warnings.push(`${prefix}_NO_FINDINGS`)
  }

  return {
    valid: failures.length === 0,
    failures,
    warnings,
    summary: {
      profileRuns: Number(snapshot.profileRuns ?? 0),
      completedRuns: Number(snapshot.completedRuns ?? 0),
      latestCompletedDatasetVersions: latestRuns.length,
      activeFileSources: Number(sourceTypes.FILE ?? 0),
      activeJdbcSources: Number(sourceTypes.JDBC ?? 0),
      ambiguousActiveSourceDatasetVersions: ambiguousActiveSourceDatasetVersions.length,
      latestCompletedFileProfiles: completedFileRuns,
      latestCompletedJdbcProfiles: completedJdbcRuns,
      latestRunsWithFindings: latestRuns.filter((run) => Number(run.findings ?? 0) > 0).length,
      latestRunsWithoutFindings: latestRuns.filter((run) => Number(run.findings ?? 0) === 0).length,
      activeDatasetsWithNonCompletedLatestAttempt: latestAttempts.filter(
        (attempt) => attempt.activeSource === true && attempt.status && attempt.status !== 'COMPLETED',
      ).length,
    },
  }
}
