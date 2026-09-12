import { randomUUID } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'

export const NATIVE_COMPENSATION_LEASE_SECONDS = 120
const NATIVE_COMPENSATION_HEARTBEAT_MS = 40_000

type CompensationClaim = {
  claimed: boolean
  status: string
  reason: string
  generation: number
  ownerId: string | null
  leaseExpiresAt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeClaim(data: unknown): CompensationClaim {
  if (!isRecord(data)) throw new Error('Compensation claim returned an invalid result')
  const generation = Number(data.generation ?? 0)
  if (!Number.isInteger(generation) || generation < 0) {
    throw new Error('Compensation claim returned an invalid generation')
  }
  return {
    claimed: data.claimed === true,
    status: String(data.status ?? ''),
    reason: String(data.reason ?? ''),
    generation,
    ownerId: typeof data.owner_id === 'string' ? data.owner_id : null,
    leaseExpiresAt: typeof data.lease_expires_at === 'string' ? data.lease_expires_at : null,
  }
}

export function createNativeCompensationOwnerId() {
  return randomUUID()
}

export async function claimNativeCompensationInvocation(input: {
  agentRunId: string
  invocationId: string
  ownerId: string
  leaseSeconds?: number
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('claim_compensation_tool_invocation_internal', {
    p_agent_run_id: input.agentRunId,
    p_invocation_id: input.invocationId,
    p_owner_id: input.ownerId,
    p_lease_seconds: input.leaseSeconds ?? NATIVE_COMPENSATION_LEASE_SECONDS,
  })
  if (error) throw new Error(`Unable to claim compensation invocation: ${error.message}`)
  return normalizeClaim(data)
}

export async function completeNativeCompensationInvocation(input: {
  invocationId: string
  ownerId: string
  generation: number
  outputHash: string
}) {
  const admin = createAdminClient()
  const { error } = await admin.schema('agent').rpc('complete_compensation_tool_invocation_internal', {
    p_invocation_id: input.invocationId,
    p_owner_id: input.ownerId,
    p_generation: input.generation,
    p_status: 'SUCCEEDED',
    p_output_hash: input.outputHash,
    p_error_code: null,
    p_error_summary: null,
  })
  if (error) throw new Error(`Unable to complete compensation invocation: ${error.message}`)
}

export async function failNativeCompensationInvocation(input: {
  invocationId: string
  ownerId: string
  generation: number
  errorCode?: string
  error: unknown
}) {
  const summary = input.error instanceof Error ? input.error.message : String(input.error)
  const admin = createAdminClient()
  const { error } = await admin.schema('agent').rpc('complete_compensation_tool_invocation_internal', {
    p_invocation_id: input.invocationId,
    p_owner_id: input.ownerId,
    p_generation: input.generation,
    p_status: 'FAILED',
    p_output_hash: null,
    p_error_code: input.errorCode?.trim() || 'RECOVERY_COMPENSATION_FAILED',
    p_error_summary: summary.slice(0, 2000),
  })
  if (error) throw new Error(`Unable to record compensation invocation failure: ${error.message}`)
}

export async function withNativeCompensationLease<T>(input: {
  agentRunId: string
  invocationId: string
  ownerId: string
  generation: number
  execute: () => Promise<T>
}): Promise<T> {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const renew = async () => {
    if (stopped) return
    try {
      const claim = await claimNativeCompensationInvocation({
        agentRunId: input.agentRunId,
        invocationId: input.invocationId,
        ownerId: input.ownerId,
      })
      if (!claim.claimed || claim.generation !== input.generation || claim.ownerId !== input.ownerId) {
        return
      }
    } catch {
      // Transport failure is not terminal evidence. The owner/generation fenced completion
      // decides whether this worker still owns the invocation after execution settles.
      return
    }
    if (!stopped) timer = setTimeout(renew, NATIVE_COMPENSATION_HEARTBEAT_MS)
  }

  timer = setTimeout(renew, NATIVE_COMPENSATION_HEARTBEAT_MS)
  try {
    return await input.execute()
  } finally {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
