import { createAdminClient } from '@/lib/supabase/admin'

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Profiling replay-safe RPC returned an invalid payload')
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Profiling replay-safe RPC returned no ${field}`)
  }
  return value.trim()
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

export async function persistProfileSnapshotReplaySafe(input: Record<string, unknown>) {
  const profilingRunId = requiredString(
    input.profiling_run_id ?? input.profilingRunId,
    'profiling_run_id',
  )
  const admin = createAdminClient()
  const { data, error } = await admin.schema('profiling').rpc('persist_profile_snapshot_replay_safe', {
    p_profile_run_id: profilingRunId,
  })
  if (error) throw new Error(`Unable to persist replay-safe profile snapshot: ${error.message}`)

  const payload = record(data)
  const returnedRunId = requiredString(payload.profiling_run_id, 'profiling_run_id')
  if (returnedRunId !== profilingRunId) throw new Error('Replay-safe profile snapshot returned a different profiling run')

  return {
    profiling_run_id: returnedRunId,
    snapshot_id: requiredString(payload.snapshot_id, 'snapshot_id'),
    schema_hash: nullableString(payload.schema_hash),
  }
}

export async function completeProfileRunReplaySafe(input: Record<string, unknown>) {
  const profilingRunId = requiredString(
    input.profiling_run_id ?? input.profilingRunId,
    'profiling_run_id',
  )
  const status = requiredString(input.status, 'status')
  const errorCode = input.error_code === null || input.error_code === undefined
    ? null
    : requiredString(input.error_code, 'error_code')
  const errorMessage = input.error_message === null || input.error_message === undefined
    ? null
    : requiredString(input.error_message, 'error_message')

  const admin = createAdminClient()
  const { data, error } = await admin.schema('profiling').rpc('complete_profile_run_replay_safe', {
    p_profile_run_id: profilingRunId,
    p_status: status,
    p_error_code: errorCode,
    p_error_message: errorMessage,
  })
  if (error) throw new Error(`Unable to complete replay-safe profile run: ${error.message}`)

  const payload = record(data)
  const returnedRunId = requiredString(payload.profiling_run_id, 'profiling_run_id')
  const returnedStatus = requiredString(payload.status, 'status')
  if (returnedRunId !== profilingRunId) throw new Error('Replay-safe profile completion returned a different profiling run')
  if (returnedStatus !== status) throw new Error('Replay-safe profile completion returned a different terminal status')

  return {
    profiling_run_id: returnedRunId,
    status: returnedStatus,
  }
}
