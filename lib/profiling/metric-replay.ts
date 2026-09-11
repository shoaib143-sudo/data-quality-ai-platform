import { createAdminClient } from '@/lib/supabase/admin'

type ReplayClaim =
  | { status: 'COMPLETED'; replay: true; result: Record<string, unknown> }
  | { status: 'IN_PROGRESS'; replay: false; lease_expires_at?: string }
  | { status: 'CLAIMED'; replay: false; lease_token: string; lease_expires_at?: string }

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid payload`)
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Metric replay returned no ${field}`)
  }
  return value.trim()
}

function requiredInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`Metric replay returned invalid ${field}`)
  }
  return Number(value)
}

function normalizeResult(
  value: unknown,
  datasetVersionId: string,
  profilingRunId: string,
) {
  const payload = asRecord(value, 'Metric execution')
  const returnedDatasetVersionId = requiredString(payload.dataset_version_id, 'dataset_version_id')
  const returnedProfilingRunId = requiredString(payload.profiling_run_id, 'profiling_run_id')
  const status = requiredString(payload.status, 'status')
  if (returnedDatasetVersionId !== datasetVersionId) {
    throw new Error('Metric execution returned a different dataset version')
  }
  if (returnedProfilingRunId !== profilingRunId) {
    throw new Error('Metric execution returned a different profiling run')
  }
  if (status !== 'COMPLETED') {
    throw new Error(`Metric execution returned non-terminal success status ${status}`)
  }

  return {
    dataset_version_id: returnedDatasetVersionId,
    profiling_run_id: returnedProfilingRunId,
    status: 'COMPLETED' as const,
    metrics_persisted: requiredInteger(payload.metrics_persisted, 'metrics_persisted'),
    findings_persisted: requiredInteger(payload.findings_persisted, 'findings_persisted'),
    score: asRecord(payload.score, 'Metric execution score'),
  }
}

function parseClaim(value: unknown): ReplayClaim {
  const payload = asRecord(value, 'Metric replay claim')
  const status = requiredString(payload.status, 'status')
  if (status === 'COMPLETED') {
    return {
      status,
      replay: true,
      result: asRecord(payload.result, 'Metric replay result'),
    }
  }
  if (status === 'IN_PROGRESS') {
    return {
      status,
      replay: false,
      lease_expires_at: typeof payload.lease_expires_at === 'string' ? payload.lease_expires_at : undefined,
    }
  }
  if (status === 'CLAIMED') {
    return {
      status,
      replay: false,
      lease_token: requiredString(payload.lease_token, 'lease_token'),
      lease_expires_at: typeof payload.lease_expires_at === 'string' ? payload.lease_expires_at : undefined,
    }
  }
  throw new Error(`Metric replay claim returned unsupported status ${status}`)
}

export async function executeProfilingMetricsReplaySafe(input: {
  datasetVersionId: string
  profilingRunId: string
  execute: () => Promise<unknown>
}) {
  const { datasetVersionId, profilingRunId, execute } = input
  const admin = createAdminClient()
  const { data: claimData, error: claimError } = await admin
    .schema('profiling')
    .rpc('claim_profile_metric_execution_replay', {
      p_profile_run_id: profilingRunId,
      p_dataset_version_id: datasetVersionId,
      p_lease_seconds: 900,
    })

  if (claimError) {
    throw new Error(`Unable to claim replay-safe metric execution: ${claimError.message}`)
  }

  const claim = parseClaim(claimData)
  if (claim.status === 'COMPLETED') {
    return normalizeResult(claim.result, datasetVersionId, profilingRunId)
  }
  if (claim.status === 'IN_PROGRESS') {
    throw new Error(
      `Metric execution is already in progress for profiling run ${profilingRunId}${
        claim.lease_expires_at ? ` until ${claim.lease_expires_at}` : ''
      }`,
    )
  }

  try {
    const result = normalizeResult(await execute(), datasetVersionId, profilingRunId)
    const { data: completedData, error: completionError } = await admin
      .schema('profiling')
      .rpc('complete_profile_metric_execution_replay', {
        p_profile_run_id: profilingRunId,
        p_dataset_version_id: datasetVersionId,
        p_lease_token: claim.lease_token,
        p_result: result,
      })

    if (completionError) {
      throw new Error(`Unable to complete replay-safe metric execution: ${completionError.message}`)
    }

    return normalizeResult(completedData, datasetVersionId, profilingRunId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Metric execution failed'
    const { error: failureError } = await admin
      .schema('profiling')
      .rpc('fail_profile_metric_execution_replay', {
        p_profile_run_id: profilingRunId,
        p_lease_token: claim.lease_token,
        p_error_summary: message,
      })
    if (failureError) {
      console.error('[profiling-metrics-replay] unable to release metric replay lease', failureError)
    }
    throw error
  }
}
