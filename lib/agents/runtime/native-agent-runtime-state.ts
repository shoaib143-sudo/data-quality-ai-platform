import { createHash } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { ensureNativeRuntimeManifest } from '@/lib/agents/runtime/native-tool-contracts'

export type NativeRuntimeCheckpointKind =
  | 'STEP_BOUNDARY'
  | 'PAUSE'
  | 'RESUME'
  | 'REPLAY_SOURCE'
  | 'TERMINAL'

export type NativeRuntimeInterruptType =
  | 'HUMAN_APPROVAL'
  | 'EXTERNAL_INPUT'
  | 'DEPENDENCY'
  | 'MANUAL_REVIEW'

export type NativeRuntimeEvidenceRef = {
  domain: string
  id: string
  version?: string
}

export type NativeRuntimeStep = {
  name: string
  order: number
  attempt: number
}

export type NativeRuntimePendingAction = {
  actionKey: string
  payloadHash: string
  riskTier?: string
  requiresHumanApproval: boolean
}

/**
 * Checkpoint state is deliberately reference-oriented. It must be sufficient to resume
 * deterministic execution without persisting prompts, model completions, hidden reasoning,
 * credentials, connection strings, or arbitrary tool output.
 */
export type NativeAgentRuntimeStateV1 = {
  version: '1.0'
  phase: string
  step?: NativeRuntimeStep
  evidenceRefs?: NativeRuntimeEvidenceRef[]
  memoryRefs?: string[]
  pendingAction?: NativeRuntimePendingAction
  userVisibleSummary?: string
}

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/
const UUIDISH_PATTERN = /^[0-9a-f-]{8,}$/i

function boundedText(value: string, field: string, max: number) {
  const normalized = value.trim()
  if (!normalized || normalized.length > max) {
    throw new Error(`${field} must contain between 1 and ${max} characters`)
  }
  return normalized
}

function assertRuntimeState(state: NativeAgentRuntimeStateV1) {
  if (state.version !== '1.0') throw new Error('Unsupported native agent runtime state version')
  boundedText(state.phase, 'phase', 120)

  if (state.step) {
    boundedText(state.step.name, 'step.name', 200)
    if (!Number.isInteger(state.step.order) || state.step.order < 1) throw new Error('step.order must be a positive integer')
    if (!Number.isInteger(state.step.attempt) || state.step.attempt < 1) throw new Error('step.attempt must be a positive integer')
  }

  if ((state.evidenceRefs?.length ?? 0) > 200) throw new Error('A checkpoint may reference at most 200 evidence records')
  for (const ref of state.evidenceRefs ?? []) {
    boundedText(ref.domain, 'evidenceRefs.domain', 120)
    boundedText(ref.id, 'evidenceRefs.id', 500)
    if (ref.version) boundedText(ref.version, 'evidenceRefs.version', 120)
  }

  if ((state.memoryRefs?.length ?? 0) > 100) throw new Error('A checkpoint may reference at most 100 memory records')
  for (const ref of state.memoryRefs ?? []) boundedText(ref, 'memoryRefs', 500)

  if (state.pendingAction) {
    boundedText(state.pendingAction.actionKey, 'pendingAction.actionKey', 200)
    if (!SHA256_PATTERN.test(state.pendingAction.payloadHash)) throw new Error('pendingAction.payloadHash must be a sha256 digest')
    if (state.pendingAction.riskTier) boundedText(state.pendingAction.riskTier, 'pendingAction.riskTier', 80)
  }

  if (state.userVisibleSummary) boundedText(state.userVisibleSummary, 'userVisibleSummary', 4000)
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Governed action payload cannot contain non-finite numbers')
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  throw new Error(`Governed action payload contains unsupported value type: ${typeof value}`)
}

export function hashGovernedActionPayload(payload: unknown) {
  const canonical = JSON.stringify(canonicalize(payload))
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`
}

function normalizeState(state: NativeAgentRuntimeStateV1) {
  assertRuntimeState(state)
  return canonicalize(state) as Record<string, unknown>
}

function assertUuidish(value: string, field: string) {
  if (!UUIDISH_PATTERN.test(value)) throw new Error(`${field} is invalid`)
}

export async function createNativeRuntimeCheckpoint(input: {
  agentRunId: string
  kind: NativeRuntimeCheckpointKind
  state: NativeAgentRuntimeStateV1
  parentCheckpointId?: string | null
  replaySourceCheckpointId?: string | null
}) {
  assertUuidish(input.agentRunId, 'agentRunId')
  if (input.parentCheckpointId) assertUuidish(input.parentCheckpointId, 'parentCheckpointId')
  if (input.replaySourceCheckpointId) assertUuidish(input.replaySourceCheckpointId, 'replaySourceCheckpointId')
  await ensureNativeRuntimeManifest({ agentRunId: input.agentRunId })
  const state = normalizeState(input.state)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('create_runtime_checkpoint_internal', {
    p_agent_run_id: input.agentRunId,
    p_checkpoint_kind: input.kind,
    p_state_version: input.state.version,
    p_state: state,
    p_parent_checkpoint_id: input.parentCheckpointId ?? null,
    p_replay_source_checkpoint_id: input.replaySourceCheckpointId ?? null,
    p_step_name: input.state.step?.name ?? null,
    p_step_order: input.state.step?.order ?? null,
  })
  if (error || typeof data !== 'string') throw new Error(`Unable to create runtime checkpoint: ${error?.message ?? 'invalid checkpoint id'}`)
  return data
}

export async function requestNativeRuntimeInterrupt(input: {
  agentRunId: string
  type: NativeRuntimeInterruptType
  requestSummary: string
  state: NativeAgentRuntimeStateV1
  actionKey?: string | null
  actionPayloadHash?: string | null
  idempotencyKey?: string | null
  expiresAt?: string | null
}) {
  assertUuidish(input.agentRunId, 'agentRunId')
  const requestSummary = boundedText(input.requestSummary, 'requestSummary', 2000)
  const actionPayloadHash = input.actionPayloadHash?.trim().toLowerCase() || null
  if (input.type === 'HUMAN_APPROVAL' && !actionPayloadHash) throw new Error('HUMAN_APPROVAL requires an exact action payload hash')
  if (actionPayloadHash && !SHA256_PATTERN.test(actionPayloadHash)) throw new Error('actionPayloadHash must be a sha256 digest')
  if (input.actionKey) boundedText(input.actionKey, 'actionKey', 200)
  if (input.idempotencyKey) boundedText(input.idempotencyKey, 'idempotencyKey', 300)
  if (input.expiresAt && Number.isNaN(Date.parse(input.expiresAt))) throw new Error('expiresAt must be an ISO timestamp')

  await ensureNativeRuntimeManifest({ agentRunId: input.agentRunId })
  const state = normalizeState(input.state)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('request_runtime_interrupt_internal', {
    p_agent_run_id: input.agentRunId,
    p_interrupt_type: input.type,
    p_request_summary: requestSummary,
    p_state_version: input.state.version,
    p_state: state,
    p_action_key: input.actionKey?.trim() || null,
    p_action_payload_hash: actionPayloadHash,
    p_idempotency_key: input.idempotencyKey?.trim() || null,
    p_expires_at: input.expiresAt ?? null,
    p_step_name: input.state.step?.name ?? null,
    p_step_order: input.state.step?.order ?? null,
  })
  if (error || typeof data !== 'string') throw new Error(`Unable to request runtime interrupt: ${error?.message ?? 'invalid interrupt id'}`)
  return data
}

export async function resumeNativeRuntimeInterrupt(input: {
  interruptId: string
  state: NativeAgentRuntimeStateV1
}) {
  assertUuidish(input.interruptId, 'interruptId')
  const admin = createAdminClient()
  const { data: interrupt, error: interruptError } = await admin
    .schema('agent')
    .from('agent_run_interrupts')
    .select('agent_run_id')
    .eq('id', input.interruptId)
    .maybeSingle()
  if (interruptError || !interrupt) throw new Error(`Unable to resolve runtime interrupt: ${interruptError?.message ?? 'not found'}`)
  await ensureNativeRuntimeManifest({ agentRunId: interrupt.agent_run_id })

  const state = normalizeState(input.state)
  const { data, error } = await admin.schema('agent').rpc('resume_runtime_interrupt_internal', {
    p_interrupt_id: input.interruptId,
    p_state_version: input.state.version,
    p_state: state,
    p_step_name: input.state.step?.name ?? null,
    p_step_order: input.state.step?.order ?? null,
  })
  if (error || typeof data !== 'string') throw new Error(`Unable to resume runtime interrupt: ${error?.message ?? 'invalid checkpoint id'}`)
  return data
}

export async function createNativeRuntimeReplay(input: {
  sourceAgentRunId: string
  sourceCheckpointId: string
  reason: string
  idempotencyKey?: string | null
  requestedBy?: string | null
}) {
  assertUuidish(input.sourceAgentRunId, 'sourceAgentRunId')
  assertUuidish(input.sourceCheckpointId, 'sourceCheckpointId')
  if (input.requestedBy) assertUuidish(input.requestedBy, 'requestedBy')
  const reason = boundedText(input.reason, 'reason', 2000)
  if (input.idempotencyKey) boundedText(input.idempotencyKey, 'idempotencyKey', 300)
  await ensureNativeRuntimeManifest({ agentRunId: input.sourceAgentRunId })
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('create_runtime_replay_internal', {
    p_source_agent_run_id: input.sourceAgentRunId,
    p_source_checkpoint_id: input.sourceCheckpointId,
    p_reason: reason,
    p_idempotency_key: input.idempotencyKey?.trim() || null,
    p_requested_by: input.requestedBy ?? null,
  })
  if (error || typeof data !== 'string') throw new Error(`Unable to create runtime replay: ${error?.message ?? 'invalid replay run id'}`)
  return data
}

export async function getNativeRuntimeCheckpointHistory(agentRunId: string) {
  assertUuidish(agentRunId, 'agentRunId')
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_run_checkpoints')
    .select('id,checkpoint_seq,checkpoint_kind,state_version,state_hash,parent_checkpoint_id,replay_source_checkpoint_id,step_name,step_order,created_at')
    .eq('agent_run_id', agentRunId)
    .order('checkpoint_seq', { ascending: true })
  if (error) throw new Error(`Unable to load runtime checkpoint history: ${error.message}`)
  return data ?? []
}
