import { createHash, randomUUID } from 'node:crypto'

export type HandoffState = 'SENT' | 'DELIVERED' | 'VALIDATED' | 'ACCEPTED' | 'REJECTED'
export type GateStatus = 'PASS' | 'FAIL' | 'NOT_MEASURED'

export type GovernedHandoffEnvelope = {
  envelopeId: string
  schemaVersion: '1.0'
  correlationId: string
  parentRunId: string
  sourceRunId: string
  sourceAgent: string
  targetAgent: string
  projectId: string
  capabilityKey: string
  payloadType: string
  payload: unknown
  evidenceRefs: Array<{ type: string; id: string; hash?: string | null }>
  policySnapshotId: string
  payloadHash: string
  createdAt: string
  expiresAt: string
  integrityHash: string
}

export type EntryGateCheck = {
  key: string
  status: GateStatus
  detail?: string | null
}

export type ExitGateCheck = EntryGateCheck

export type PersistedGateResult = {
  gateType: 'ENTRY_GATE' | 'EXIT_GATE'
  status: GateStatus
  checks: EntryGateCheck[]
  evaluatedAt: string
  reason: string | null
}

export type HandoffValidationContext = {
  projectId: string
  targetAgent: string
  allowedSourceAgents: readonly string[]
  allowedHandoffTargets: Readonly<Record<string, readonly string[]>>
  policySnapshotId: string
  dependencySatisfied: boolean
  evidenceExists: (type: string, id: string, hash?: string | null) => boolean
  now?: Date
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(object[key])}`).join(',')}}`
}

export function hashHandoffPayload(payload: unknown) {
  return createHash('sha256').update(stableSerialize(payload)).digest('hex')
}

function integrityMaterial(envelope: Omit<GovernedHandoffEnvelope, 'integrityHash'>) {
  return stableSerialize({
    envelopeId: envelope.envelopeId,
    schemaVersion: envelope.schemaVersion,
    correlationId: envelope.correlationId,
    parentRunId: envelope.parentRunId,
    sourceRunId: envelope.sourceRunId,
    sourceAgent: envelope.sourceAgent,
    targetAgent: envelope.targetAgent,
    projectId: envelope.projectId,
    capabilityKey: envelope.capabilityKey,
    payloadType: envelope.payloadType,
    payloadHash: envelope.payloadHash,
    evidenceRefs: envelope.evidenceRefs,
    policySnapshotId: envelope.policySnapshotId,
    createdAt: envelope.createdAt,
    expiresAt: envelope.expiresAt,
  })
}

export function createGovernedHandoffEnvelope(input: {
  correlationId: string
  parentRunId: string
  sourceRunId: string
  sourceAgent: string
  targetAgent: string
  projectId: string
  capabilityKey: string
  payloadType: string
  payload: unknown
  evidenceRefs: GovernedHandoffEnvelope['evidenceRefs']
  policySnapshotId: string
  createdAt?: Date
  ttlMs?: number
}): GovernedHandoffEnvelope {
  const createdAt = input.createdAt ?? new Date()
  const ttlMs = Number.isFinite(input.ttlMs) && (input.ttlMs ?? 0) > 0 ? Number(input.ttlMs) : 15 * 60 * 1000
  const envelopeWithoutIntegrity: Omit<GovernedHandoffEnvelope, 'integrityHash'> = {
    envelopeId: randomUUID(),
    schemaVersion: '1.0',
    correlationId: input.correlationId,
    parentRunId: input.parentRunId,
    sourceRunId: input.sourceRunId,
    sourceAgent: input.sourceAgent,
    targetAgent: input.targetAgent,
    projectId: input.projectId,
    capabilityKey: input.capabilityKey,
    payloadType: input.payloadType,
    payload: input.payload,
    evidenceRefs: input.evidenceRefs,
    policySnapshotId: input.policySnapshotId,
    payloadHash: hashHandoffPayload(input.payload),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
  }
  return {
    ...envelopeWithoutIntegrity,
    integrityHash: createHash('sha256').update(integrityMaterial(envelopeWithoutIntegrity)).digest('hex'),
  }
}

function gateResult(gateType: PersistedGateResult['gateType'], checks: EntryGateCheck[]): PersistedGateResult {
  const failed = checks.find(check => check.status === 'FAIL')
  const unknown = checks.find(check => check.status === 'NOT_MEASURED')
  const status: GateStatus = failed ? 'FAIL' : unknown ? 'NOT_MEASURED' : 'PASS'
  return {
    gateType,
    status,
    checks,
    evaluatedAt: new Date().toISOString(),
    reason: failed?.detail ?? unknown?.detail ?? null,
  }
}

export function validateGovernedHandoff(envelope: GovernedHandoffEnvelope, context: HandoffValidationContext): PersistedGateResult {
  const now = context.now ?? new Date()
  const payloadHash = hashHandoffPayload(envelope.payload)
  const expectedIntegrity = createHash('sha256').update(integrityMaterial({
    envelopeId: envelope.envelopeId,
    schemaVersion: envelope.schemaVersion,
    correlationId: envelope.correlationId,
    parentRunId: envelope.parentRunId,
    sourceRunId: envelope.sourceRunId,
    sourceAgent: envelope.sourceAgent,
    targetAgent: envelope.targetAgent,
    projectId: envelope.projectId,
    capabilityKey: envelope.capabilityKey,
    payloadType: envelope.payloadType,
    payload: envelope.payload,
    evidenceRefs: envelope.evidenceRefs,
    policySnapshotId: envelope.policySnapshotId,
    payloadHash: envelope.payloadHash,
    createdAt: envelope.createdAt,
    expiresAt: envelope.expiresAt,
  })).digest('hex')
  const allowedTargets = context.allowedHandoffTargets[envelope.sourceAgent] ?? []
  const evidenceValid = envelope.evidenceRefs.every(ref => context.evidenceExists(ref.type, ref.id, ref.hash))
  const checks: EntryGateCheck[] = [
    { key: 'schema_version', status: envelope.schemaVersion === '1.0' ? 'PASS' : 'FAIL', detail: 'Unsupported handoff schema version.' },
    { key: 'project_identity', status: envelope.projectId === context.projectId ? 'PASS' : 'FAIL', detail: 'Handoff project identity mismatch.' },
    { key: 'target_identity', status: envelope.targetAgent === context.targetAgent ? 'PASS' : 'FAIL', detail: 'Handoff target agent mismatch.' },
    { key: 'source_identity', status: context.allowedSourceAgents.includes(envelope.sourceAgent) ? 'PASS' : 'FAIL', detail: 'Handoff source agent is not trusted for this receiver.' },
    { key: 'handoff_policy', status: allowedTargets.includes(envelope.targetAgent) ? 'PASS' : 'FAIL', detail: 'Agent-to-agent handoff is not permitted by policy.' },
    { key: 'payload_hash', status: envelope.payloadHash === payloadHash ? 'PASS' : 'FAIL', detail: 'Handoff payload hash mismatch.' },
    { key: 'integrity_hash', status: envelope.integrityHash === expectedIntegrity ? 'PASS' : 'FAIL', detail: 'Handoff integrity hash mismatch.' },
    { key: 'policy_snapshot', status: envelope.policySnapshotId === context.policySnapshotId ? 'PASS' : 'FAIL', detail: 'Handoff policy snapshot mismatch.' },
    { key: 'dependencies', status: context.dependencySatisfied ? 'PASS' : 'FAIL', detail: 'Upstream dependency is not satisfied.' },
    { key: 'freshness', status: Date.parse(envelope.expiresAt) > now.getTime() ? 'PASS' : 'FAIL', detail: 'Handoff envelope has expired.' },
    { key: 'evidence_refs', status: evidenceValid ? 'PASS' : 'FAIL', detail: 'One or more handoff evidence references are unavailable or invalid.' },
  ]
  return gateResult('ENTRY_GATE', checks)
}

export function evaluateExitGate(checks: ExitGateCheck[]) {
  return gateResult('EXIT_GATE', checks)
}

export function nextHandoffState(current: HandoffState, next: HandoffState): HandoffState {
  const allowed: Record<HandoffState, HandoffState[]> = {
    SENT: ['DELIVERED', 'REJECTED'],
    DELIVERED: ['VALIDATED', 'REJECTED'],
    VALIDATED: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: [],
    REJECTED: [],
  }
  if (!allowed[current].includes(next)) throw new Error(`Illegal handoff transition ${current} -> ${next}`)
  return next
}
