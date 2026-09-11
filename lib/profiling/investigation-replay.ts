import { createAdminClient } from '@/lib/supabase/admin'

const INVESTIGATION_LEASE_SECONDS = 900

type ClaimResult =
  | { status: 'COMPLETED'; replay: true; result: Record<string, unknown> }
  | { status: 'CLAIMED'; replay: false; lease_token: string; lease_expires_at: string }
  | { status: 'IN_PROGRESS'; replay: false; lease_expires_at: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseClaim(value: unknown): ClaimResult {
  const claim = asRecord(value)
  const status = typeof claim?.status === 'string' ? claim.status : ''

  if (status === 'COMPLETED') {
    const result = asRecord(claim?.result)
    if (!result) throw new Error('Completed profiling investigation replay has no durable result.')
    return { status: 'COMPLETED', replay: true, result }
  }

  if (status === 'CLAIMED') {
    const leaseToken = typeof claim?.lease_token === 'string' ? claim.lease_token : ''
    const leaseExpiresAt = typeof claim?.lease_expires_at === 'string' ? claim.lease_expires_at : ''
    if (!leaseToken || !leaseExpiresAt) throw new Error('Profiling investigation replay claim is missing lease evidence.')
    return {
      status: 'CLAIMED',
      replay: false,
      lease_token: leaseToken,
      lease_expires_at: leaseExpiresAt,
    }
  }

  if (status === 'IN_PROGRESS') {
    const leaseExpiresAt = typeof claim?.lease_expires_at === 'string' ? claim.lease_expires_at : ''
    if (!leaseExpiresAt) throw new Error('Profiling investigation replay in-progress response is missing lease expiry.')
    return { status: 'IN_PROGRESS', replay: false, lease_expires_at: leaseExpiresAt }
  }

  throw new Error('Profiling investigation replay returned an invalid claim state.')
}

async function claimInvestigation(profileRunId: string, datasetVersionId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('profiling')
    .rpc('claim_profile_investigation_replay', {
      p_profile_run_id: profileRunId,
      p_dataset_version_id: datasetVersionId,
      p_lease_seconds: INVESTIGATION_LEASE_SECONDS,
    })

  if (error) throw new Error(`Unable to claim profiling investigation replay: ${error.message}`)
  return parseClaim(data)
}

async function completeInvestigation(
  profileRunId: string,
  datasetVersionId: string,
  leaseToken: string,
  investigation: Record<string, unknown>,
) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('profiling')
    .rpc('complete_profile_investigation_replay', {
      p_profile_run_id: profileRunId,
      p_dataset_version_id: datasetVersionId,
      p_lease_token: leaseToken,
      p_investigation: investigation,
    })

  if (error) throw new Error(`Unable to complete profiling investigation replay: ${error.message}`)
  const result = asRecord(data)
  if (!result) throw new Error('Profiling investigation replay completion returned no durable result.')
  return result
}

async function failInvestigation(
  profileRunId: string,
  leaseToken: string,
  error: unknown,
) {
  const admin = createAdminClient()
  const summary = error instanceof Error ? error.message : String(error)
  const { error: failureError } = await admin
    .schema('profiling')
    .rpc('fail_profile_investigation_replay', {
      p_profile_run_id: profileRunId,
      p_lease_token: leaseToken,
      p_error_summary: summary.slice(0, 2000),
    })

  if (failureError) {
    console.error('[profiling-investigation-replay] unable to release failed replay lease', failureError)
  }
}

export async function investigateProfilingRunReplaySafe(input: {
  profilingRunId: string
  datasetVersionId: string
  execute: () => Promise<Record<string, unknown>>
}) {
  const claim = await claimInvestigation(input.profilingRunId, input.datasetVersionId)

  if (claim.status === 'COMPLETED') return claim.result
  if (claim.status === 'IN_PROGRESS') {
    throw new Error(`Profiling investigation is already in progress until ${claim.lease_expires_at}.`)
  }

  try {
    const investigation = await input.execute()
    return await completeInvestigation(
      input.profilingRunId,
      input.datasetVersionId,
      claim.lease_token,
      investigation,
    )
  } catch (error) {
    await failInvestigation(input.profilingRunId, claim.lease_token, error)
    throw error
  }
}
