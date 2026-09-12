import { randomUUID } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  assertNativeJsonContract,
  hashNativeRuntimeValue,
  type NativePinnedToolContract,
} from './native-tool-contracts'

export type NativeCompensationInvocationLease = {
  invocationId: string
  executionOwner: string
  executionGeneration: number
  leaseExpiresAt: string
  reclaimed: boolean
  businessExecutionCompleted?: boolean
}

export type NativeCompensationClaimRejectionReason =
  | 'ACTIVE_LEASE'
  | 'TERMINAL'
  | 'CONTRACT_DRIFT'
  | 'UNSAFE_REPLAY'

export type NativeCompensationClaimResult =
  | { claimed: true; lease: NativeCompensationInvocationLease }
  | { claimed: false; reason: NativeCompensationClaimRejectionReason; status?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function createNativeCompensationExecutionOwner() {
  const deployment =
    process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.RENDER_GIT_COMMIT
    ?? process.env.GITHUB_SHA
    ?? process.env.HOSTNAME
    ?? 'local'
  return `compensation:${deployment.slice(0, 120)}:${randomUUID()}`
}

export async function claimNativeCompensationInvocation(input: {
  invocationId: string
  agentRunId: string
  failedToolKey: string
  compensationToolKey: string
  contract: NativePinnedToolContract
  inputHash: string
  idempotencyKey: string
  executionOwner: string
  leaseSeconds?: number
}): Promise<NativeCompensationClaimResult> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('claim_compensation_tool_invocation_internal', {
    p_invocation_id: input.invocationId,
    p_agent_run_id: input.agentRunId,
    p_failed_tool_key: input.failedToolKey,
    p_compensation_tool_key: input.compensationToolKey,
    p_expected_contract_hash: input.contract.contract_hash,
    p_expected_input_hash: input.inputHash,
    p_expected_idempotency_key: input.idempotencyKey,
    p_execution_owner: input.executionOwner,
    p_lease_seconds: input.leaseSeconds ?? 120,
  })
  if (error || !isRecord(data)) {
    throw new Error(`Unable to claim compensation invocation: ${error?.message ?? 'invalid claim result'}`)
  }
  if (data.claimed !== true) {
    const reason = String(data.reason ?? 'TERMINAL') as NativeCompensationClaimRejectionReason
    if (!['ACTIVE_LEASE', 'TERMINAL', 'CONTRACT_DRIFT', 'UNSAFE_REPLAY'].includes(reason)) {
      throw new Error(`Unknown compensation claim rejection: ${String(data.reason ?? 'UNKNOWN')}`)
    }
    return { claimed: false, reason, status: typeof data.status === 'string' ? data.status : undefined }
  }

  const generation = Number(data.execution_generation)
  const leaseExpiresAt = String(data.lease_expires_at ?? '')
  if (!Number.isInteger(generation) || generation < 1 || !leaseExpiresAt) {
    throw new Error('Compensation claim returned invalid fencing metadata')
  }
  return {
    claimed: true,
    lease: {
      invocationId: input.invocationId,
      executionOwner: input.executionOwner,
      executionGeneration: generation,
      leaseExpiresAt,
      reclaimed: data.reclaimed === true,
      businessExecutionCompleted: false,
    },
  }
}

export async function renewNativeCompensationInvocationLease(input: {
  lease: NativeCompensationInvocationLease
  leaseSeconds?: number
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('renew_compensation_tool_invocation_lease_internal', {
    p_invocation_id: input.lease.invocationId,
    p_execution_owner: input.lease.executionOwner,
    p_execution_generation: input.lease.executionGeneration,
    p_lease_seconds: input.leaseSeconds ?? 120,
  })
  if (error || !isRecord(data)) {
    throw new Error(`Unable to renew compensation invocation lease: ${error?.message ?? 'invalid renewal result'}`)
  }
  const leaseExpiresAt = String(data.lease_expires_at ?? '')
  if (!leaseExpiresAt) throw new Error('Compensation lease renewal returned no expiry')
  input.lease.leaseExpiresAt = leaseExpiresAt
}

async function finishNativeCompensationInvocation(input: {
  lease: NativeCompensationInvocationLease
  status: 'SUCCEEDED' | 'FAILED'
  outputHash?: string | null
  errorCode?: string | null
  errorSummary?: string | null
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('complete_compensation_tool_invocation_internal', {
    p_invocation_id: input.lease.invocationId,
    p_execution_owner: input.lease.executionOwner,
    p_execution_generation: input.lease.executionGeneration,
    p_status: input.status,
    p_output_hash: input.outputHash ?? null,
    p_error_code: input.errorCode ?? null,
    p_error_summary: input.errorSummary ?? null,
  })
  if (error || !isRecord(data)) {
    throw new Error(`Unable to finalize compensation invocation: ${error?.message ?? 'invalid completion result'}`)
  }
  if (data.completed !== true) {
    throw new Error(`Compensation completion rejected: ${String(data.reason ?? 'UNKNOWN')}`)
  }
}

export async function completeNativeCompensationInvocation(input: {
  lease: NativeCompensationInvocationLease
  contract: NativePinnedToolContract
  output: unknown
}) {
  assertNativeJsonContract(input.contract.output_schema, input.output, `${input.contract.tool_key} output`)
  await finishNativeCompensationInvocation({
    lease: input.lease,
    status: 'SUCCEEDED',
    outputHash: hashNativeRuntimeValue(input.output),
  })
}

export async function failNativeCompensationInvocation(input: {
  lease: NativeCompensationInvocationLease
  errorCode?: string
  error: unknown
}) {
  if (input.lease.businessExecutionCompleted) {
    throw new Error('Compensation business execution completed; failure evidence would be unsafe')
  }
  const summary = input.error instanceof Error ? input.error.message : String(input.error)
  await finishNativeCompensationInvocation({
    lease: input.lease,
    status: 'FAILED',
    errorCode: input.errorCode?.trim() || 'RECOVERY_COMPENSATION_FAILED',
    errorSummary: summary.slice(0, 2000),
  })
}

export async function executeWithNativeCompensationLease<T>(input: {
  lease: NativeCompensationInvocationLease
  execute: () => Promise<T>
  leaseSeconds?: number
  heartbeatSeconds?: number
}) {
  const leaseSeconds = input.leaseSeconds ?? 120
  const heartbeatMs = Math.max(5, input.heartbeatSeconds ?? Math.floor(leaseSeconds / 3)) * 1000
  let heartbeatRunning = false
  const timer = setInterval(() => {
    if (heartbeatRunning) return
    heartbeatRunning = true
    void renewNativeCompensationInvocationLease({ lease: input.lease, leaseSeconds })
      .catch(() => undefined)
      .finally(() => { heartbeatRunning = false })
  }, heartbeatMs)
  timer.unref?.()

  try {
    const result = await input.execute()
    input.lease.businessExecutionCompleted = true
    return result
  } finally {
    clearInterval(timer)
  }
}
