import { createAdminClient } from '@/lib/supabase/admin'
import type { GovernedHandoffEnvelope, HandoffState, PersistedGateResult } from '@/lib/agents/runtime/governed-handoff'
import { nextHandoffState } from '@/lib/agents/runtime/governed-handoff'

export async function persistGovernedHandoff(envelope: GovernedHandoffEnvelope) {
  const admin = createAdminClient()
  const { error } = await admin.schema('agent').from('governed_handoffs').insert({
    envelope_id: envelope.envelopeId,
    schema_version: envelope.schemaVersion,
    correlation_id: envelope.correlationId,
    parent_run_id: envelope.parentRunId,
    source_run_id: envelope.sourceRunId,
    source_agent: envelope.sourceAgent,
    target_agent: envelope.targetAgent,
    project_id: envelope.projectId,
    capability_key: envelope.capabilityKey,
    payload_type: envelope.payloadType,
    payload: envelope.payload,
    evidence_refs: envelope.evidenceRefs,
    policy_snapshot_id: envelope.policySnapshotId,
    payload_hash: envelope.payloadHash,
    integrity_hash: envelope.integrityHash,
    state: 'SENT',
    created_at: envelope.createdAt,
    expires_at: envelope.expiresAt,
  })
  if (error) throw new Error(`Unable to persist governed handoff: ${error.message}`)
  return envelope.envelopeId
}

export async function transitionGovernedHandoff(input: {
  envelopeId: string
  expectedState: HandoffState
  nextState: HandoffState
}) {
  const nextState = nextHandoffState(input.expectedState, input.nextState)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').from('governed_handoffs')
    .update({ state: nextState, updated_at: new Date().toISOString() })
    .eq('envelope_id', input.envelopeId)
    .eq('state', input.expectedState)
    .select('envelope_id,state')
    .maybeSingle()
  if (error) throw new Error(`Unable to transition governed handoff: ${error.message}`)
  if (!data) throw new Error(`Governed handoff transition lost a concurrency race or expected state ${input.expectedState} no longer matches.`)
  return nextState
}

export async function persistRunGateResult(input: {
  runId: string
  envelopeId?: string | null
  gate: PersistedGateResult
}) {
  const admin = createAdminClient()
  const { error } = await admin.schema('agent').from('governed_run_gates').insert({
    run_id: input.runId,
    envelope_id: input.envelopeId ?? null,
    gate_type: input.gate.gateType,
    status: input.gate.status,
    checks: input.gate.checks,
    reason: input.gate.reason,
    evaluated_at: input.gate.evaluatedAt,
  })
  if (error) throw new Error(`Unable to persist ${input.gate.gateType}: ${error.message}`)
  return input.gate
}

export async function getGovernedHandoff(envelopeId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').from('governed_handoffs').select('*').eq('envelope_id', envelopeId).maybeSingle()
  if (error) throw new Error(`Unable to load governed handoff: ${error.message}`)
  return data
}
