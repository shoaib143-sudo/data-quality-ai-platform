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
    throw new Error(`Profile dataset replay returned no ${field}`)
  }
  return value.trim()
}

function nullableInteger(value: unknown, field: string) {
  if (value === null || value === undefined) return null
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`Profile dataset replay returned invalid ${field}`)
  }
  return Number(value)
}

function requiredInteger(value: unknown, field: string) {
  const parsed = nullableInteger(value, field)
  if (parsed === null) throw new Error(`Profile dataset replay returned no ${field}`)
  return parsed
}

function normalizeResult(value: unknown, datasetVersionId: string, profilingRunId: string) {
  const payload = asRecord(value, 'Profile dataset execution')
  const returnedDatasetVersionId = requiredString(payload.dataset_version_id, 'dataset_version_id')
  const returnedProfilingRunId = requiredString(payload.profiling_run_id, 'profiling_run_id')
  const status = requiredString(payload.status, 'status')
  if (returnedDatasetVersionId !== datasetVersionId) {
    throw new Error('Profile dataset execution returned a different dataset version')
  }
  if (returnedProfilingRunId !== profilingRunId) {
    throw new Error('Profile dataset execution returned a different profiling run')
  }
  if (status !== 'COMPLETED') {
    throw new Error(`Profile dataset execution returned non-success status ${status}`)
  }

  return {
    profiling_run_id: returnedProfilingRunId,
    dataset_version_id: returnedDatasetVersionId,
    status: 'COMPLETED' as const,
    row_count: nullableInteger(payload.row_count, 'row_count'),
    column_count: nullableInteger(payload.column_count, 'column_count'),
    anomalies_found: requiredInteger(payload.anomalies_found, 'anomalies_found'),
  }
}

function parseClaim(value: unknown): ReplayClaim {
  const payload = asRecord(value, 'Profile dataset replay claim')
  const status = requiredString(payload.status, 'status')
  if (status === 'COMPLETED') {
    return { status, replay: true, result: asRecord(payload.result, 'Profile dataset replay result') }
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
  throw new Error(`Profile dataset replay claim returned unsupported status ${status}`)
}

export async function executeProfileDatasetReplaySafe(input: {
  datasetVersionId: string
  profilingRunId: string
  execute: () => Promise<unknown>
}) {
  const { datasetVersionId, profilingRunId, execute } = input
  const admin = createAdminClient()
  const { data: claimData, error: claimError } = await admin
    .schema('profiling')
    .rpc('claim_profile_dataset_replay', {
      p_profile_run_id: profilingRunId,
      p_dataset_version_id: datasetVersionId,
      p_lease_seconds: 900,
    })

  if (claimError) {
    throw new Error(`Unable to claim replay-safe profile dataset execution: ${claimError.message}`)
  }

  const claim = parseClaim(claimData)
  if (claim.status === 'COMPLETED') {
    return normalizeResult(claim.result, datasetVersionId, profilingRunId)
  }
  if (claim.status === 'IN_PROGRESS') {
    throw new Error(
      `Profile dataset execution is already in progress for profiling run ${profilingRunId}${
        claim.lease_expires_at ? ` until ${claim.lease_expires_at}` : ''
      }`,
    )
  }

  try {
    const result = normalizeResult(await execute(), datasetVersionId, profilingRunId)
    const { data: completedData, error: completionError } = await admin
      .schema('profiling')
      .rpc('complete_profile_dataset_replay', {
        p_profile_run_id: profilingRunId,
        p_dataset_version_id: datasetVersionId,
        p_lease_token: claim.lease_token,
        p_result: result,
      })

    if (completionError) {
      throw new Error(`Unable to complete replay-safe profile dataset execution: ${completionError.message}`)
    }
    return normalizeResult(completedData, datasetVersionId, profilingRunId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile dataset execution failed'
    const { error: failureError } = await admin
      .schema('profiling')
      .rpc('fail_profile_dataset_replay', {
        p_profile_run_id: profilingRunId,
        p_lease_token: claim.lease_token,
        p_error_summary: message,
      })
    if (failureError) {
      console.error('[profiling-dataset-replay] unable to release replay lease', failureError)
    }
    throw error
  }
}

export async function persistProfileDatasetEvidenceReplaySafe(input: {
  datasetVersionId: string
  profilingRunId: string
  rowCount: number | null
  columnCount: number
  schemaHash: string
  columns: unknown[]
  schema: Record<string, unknown>
  summary: Record<string, unknown>
  contentHash?: string | null
  markRunCompleted?: boolean
}) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('profiling')
    .rpc('persist_profile_dataset_evidence_replay_safe', {
      p_profile_run_id: input.profilingRunId,
      p_dataset_version_id: input.datasetVersionId,
      p_row_count: input.rowCount,
      p_column_count: input.columnCount,
      p_schema_hash: input.schemaHash,
      p_columns: input.columns,
      p_schema: input.schema,
      p_summary: input.summary,
      p_content_hash: input.contentHash ?? null,
      p_mark_run_completed: input.markRunCompleted ?? false,
    })

  if (error) {
    throw new Error(`Unable to persist replay-safe profile dataset evidence: ${error.message}`)
  }

  return normalizeResult(data, input.datasetVersionId, input.profilingRunId)
}
