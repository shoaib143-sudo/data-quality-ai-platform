export type DiscoveryJobHealthInput = {
  status: string
  attempts: number
  max_attempts: number
  lease_expires_at: string | null
  last_error: string | null
  updated_at: string
}

export type DiscoveryJobHealth = {
  severity: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  rawError: string | null
}

function upper(value: string | null | undefined) {
  return String(value ?? '').toUpperCase()
}

export function discoveryJobHealth(job: DiscoveryJobHealthInput, now = Date.now()): DiscoveryJobHealth {
  const status = upper(job.status)
  const rawError = job.last_error?.trim() || null
  const leaseExpired = Boolean(job.lease_expires_at && Date.parse(job.lease_expires_at) < now)
  const retriesRemaining = Math.max(0, job.max_attempts - job.attempts)
  const leaseFailure = rawError?.toLowerCase().includes('lease expired before completion') ?? false

  if (status === 'SUCCEEDED') {
    return { severity: 'success', title: 'Discovery completed', message: 'The durable worker completed this discovery job successfully.', rawError }
  }

  if (status === 'DEAD' || status === 'FAILED') {
    const exhausted = job.attempts >= job.max_attempts
    return {
      severity: 'error',
      title: exhausted ? 'Discovery failed after all retry attempts' : 'Discovery failed',
      message: leaseFailure
        ? `The worker stopped before the scan completed and its execution lease expired. ${exhausted ? 'No retries remain; this run needs investigation before it can be restarted.' : `${retriesRemaining} automatic ${retriesRemaining === 1 ? 'retry remains' : 'retries remain'}.`}`
        : rawError || 'The durable worker reported a terminal failure for this discovery job.',
      rawError,
    }
  }

  if (status === 'QUEUED' && leaseFailure) {
    return {
      severity: 'warning',
      title: 'Retry scheduled after worker interruption',
      message: `The previous attempt did not finish before the worker lease expired. The job is queued for an automatic retry; attempt ${Math.min(job.attempts + 1, job.max_attempts)} of ${job.max_attempts} will run when capacity is available.`,
      rawError,
    }
  }

  if (status === 'RUNNING' && leaseFailure) {
    return {
      severity: 'warning',
      title: 'Retry in progress after worker interruption',
      message: `A previous attempt was interrupted before completion. Attempt ${job.attempts} of ${job.max_attempts} is now running under a new worker lease. If this attempt also exceeds the execution window, the job will retry until the configured limit is reached.`,
      rawError,
    }
  }

  if (status === 'RUNNING' && leaseExpired) {
    return {
      severity: 'warning',
      title: 'Worker heartbeat is stale',
      message: 'The job still says RUNNING, but its worker lease has expired. The recovery process should reclaim it and either retry or mark it failed. If this state persists, the worker scheduler needs investigation.',
      rawError,
    }
  }

  if (status === 'RUNNING') return { severity: 'info', title: 'Discovery is running', message: `Attempt ${job.attempts} of ${job.max_attempts} is actively owned by a worker.`, rawError }
  if (status === 'QUEUED') return { severity: 'info', title: 'Discovery is queued', message: `The job is waiting for worker capacity. ${job.attempts > 0 ? `It has already used ${job.attempts} of ${job.max_attempts} attempts.` : 'No execution attempt has started yet.'}`, rawError }

  return { severity: rawError ? 'warning' : 'info', title: rawError ? 'Discovery needs attention' : `Discovery status: ${status || 'UNKNOWN'}`, message: rawError || 'No additional worker detail is available for this job.', rawError }
}
