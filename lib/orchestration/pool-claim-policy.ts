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

export function formatPoolClaimFailures(failures: Array<{ pool: string; error: string }>) {
  return failures.map((failure) => `${failure.pool}: ${failure.error}`).join('; ')
}
