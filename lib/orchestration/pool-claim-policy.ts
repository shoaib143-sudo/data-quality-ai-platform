export type PoolClaimOutcome = {
  pool: string
  succeeded: boolean
  error?: string
}

export type PoolClaimAssessment = {
  successfulPoolCount: number
  failures: Array<{ pool: string; error: string }>
  allPoolsFailed: boolean
}

export type StaleReleaseFailureAssessment = {
  canContinueClaiming: boolean
  error: string
  disposition: 'STALE_RUNNING_LEFT_FENCED_FOR_RETRY' | 'FAIL_CLOSED'
}

export function assessPoolClaimOutcomes(outcomes: PoolClaimOutcome[]): PoolClaimAssessment {
  const successfulPoolCount = outcomes.filter((outcome) => outcome.succeeded).length
  const failures = outcomes
    .filter((outcome) => !outcome.succeeded)
    .map((outcome) => ({
      pool: outcome.pool,
      error: (outcome.error ?? 'Unknown workload-pool claim failure').slice(0, 500),
    }))

  return {
    successfulPoolCount,
    failures,
    allPoolsFailed: outcomes.length > 0 && successfulPoolCount === 0,
  }
}

export function assessStaleReleaseFailure(
  error: string | undefined,
  claimableStatuses: readonly string[],
): StaleReleaseFailureAssessment {
  const staleRunningCouldBeClaimed = claimableStatuses.includes('RUNNING')
  return {
    canContinueClaiming: !staleRunningCouldBeClaimed,
    error: (error || 'Unknown stale-job release failure').slice(0, 500),
    disposition: staleRunningCouldBeClaimed ? 'FAIL_CLOSED' : 'STALE_RUNNING_LEFT_FENCED_FOR_RETRY',
  }
}

export function formatPoolClaimFailures(failures: Array<{ pool: string; error: string }>) {
  return failures.map((failure) => `${failure.pool}: ${failure.error}`).join('; ')
}
