import { createAdminClient } from '@/lib/supabase/admin'

export type NativeInterruptTerminalStatus = 'PENDING' | 'RESOLVED' | 'RESUMED' | 'CANCELLED' | 'EXPIRED'
export type NativeInterruptRunStatus = 'CREATED' | 'QUEUED' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED'

export type NativeInterruptLifecycleResult = {
  interruptId: string
  agentRunId: string
  status: NativeInterruptTerminalStatus
  runStatus: NativeInterruptRunStatus
  applied: boolean
  reasonCode: string
}

export type NativeInterruptAuditEvent = {
  id: string
  interrupt_id: string
  agent_run_id: string
  event_type: 'INTERRUPT_TIMED_OUT' | 'INTERRUPT_ESCALATED' | 'INTERRUPT_CANCELLED' | 'RUN_CANCELLED' | 'LATE_DECISION_REJECTED'
  event_source: 'TIMEOUT_PROCESSOR' | 'EXPLICIT_CANCEL' | 'HUMAN_RESOLVE'
  reason: string | null
  created_at: string
}

const UUIDISH_PATTERN = /^[0-9a-f-]{8,}$/i
const INTERRUPT_STATUSES = new Set<NativeInterruptTerminalStatus>(['PENDING', 'RESOLVED', 'RESUMED', 'CANCELLED', 'EXPIRED'])
const RUN_STATUSES = new Set<NativeInterruptRunStatus>(['CREATED', 'QUEUED', 'RUNNING', 'WAITING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'])

function assertUuidish(value: string, field: string) {
  if (!UUIDISH_PATTERN.test(value)) throw new Error(`${field} is invalid`)
}

function normalizeReason(reason?: string | null) {
  if (reason == null) return null
  const normalized = reason.trim()
  if (!normalized) return null
  if (normalized.length > 2000) throw new Error('reason must contain at most 2000 characters')
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseLifecycleResult(data: unknown, operation: string): NativeInterruptLifecycleResult {
  if (!isRecord(data)) throw new Error(`${operation} returned an invalid lifecycle result`)

  const interruptId = String(data.interrupt_id ?? '')
  const agentRunId = String(data.agent_run_id ?? '')
  const status = String(data.status ?? '') as NativeInterruptTerminalStatus
  const runStatus = String(data.run_status ?? '') as NativeInterruptRunStatus
  const reasonCode = String(data.reason_code ?? '')

  assertUuidish(interruptId, 'interruptId')
  assertUuidish(agentRunId, 'agentRunId')
  if (!INTERRUPT_STATUSES.has(status)) throw new Error(`${operation} returned an invalid interrupt status`)
  if (!RUN_STATUSES.has(runStatus)) throw new Error(`${operation} returned an invalid agent run status`)
  if (typeof data.applied !== 'boolean') throw new Error(`${operation} returned an invalid applied flag`)
  if (!reasonCode) throw new Error(`${operation} returned no reason code`)

  return {
    interruptId,
    agentRunId,
    status,
    runStatus,
    applied: data.applied,
    reasonCode,
  }
}

/**
 * Expire one overdue PENDING interrupt. Timeout is fail-closed: the agent run remains
 * WAITING and append-only audit evidence records both timeout and escalation. Human
 * decisions that won the row lock before the deadline are never overridden.
 */
export async function processNativeRuntimeInterruptTimeout(input: {
  interruptId: string
  reason?: string | null
}): Promise<NativeInterruptLifecycleResult> {
  assertUuidish(input.interruptId, 'interruptId')
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('process_runtime_interrupt_timeout_internal', {
    p_interrupt_id: input.interruptId,
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw new Error(`Unable to process runtime interrupt timeout: ${error.message}`)
  return parseLifecycleResult(data, 'Runtime interrupt timeout')
}

/**
 * Cancel one still-PENDING governed interrupt and its WAITING agent run. Resolved,
 * resumed, expired, or already-cancelled interrupts are never rewritten.
 */
export async function cancelNativeRuntimeInterrupt(input: {
  interruptId: string
  reason?: string | null
}): Promise<NativeInterruptLifecycleResult> {
  assertUuidish(input.interruptId, 'interruptId')
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('cancel_runtime_interrupt_internal', {
    p_interrupt_id: input.interruptId,
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw new Error(`Unable to cancel runtime interrupt: ${error.message}`)
  return parseLifecycleResult(data, 'Runtime interrupt cancellation')
}

export async function getNativeRuntimeInterruptEvents(interruptId: string): Promise<NativeInterruptAuditEvent[]> {
  assertUuidish(interruptId, 'interruptId')
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_run_interrupt_events')
    .select('id,interrupt_id,agent_run_id,event_type,event_source,reason,created_at')
    .eq('interrupt_id', interruptId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Unable to load runtime interrupt audit events: ${error.message}`)
  return (data ?? []) as NativeInterruptAuditEvent[]
}
