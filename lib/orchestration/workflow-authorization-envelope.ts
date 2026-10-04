import { createHash } from 'node:crypto'
import { AGENT_POLICY_VERSION, type AgentPolicyCapability } from '@/lib/governance/agent-policy-v2'
import { authorizeAgentAction, type AgentActionResource } from '@/lib/governance/agent-authorization'

export type WorkflowAuthorizationEnvelope = {
  schemaVersion: '1.1'
  workflowKey: string
  workflowVersion: number
  taskKey: string
  actorUserId: string
  agentKey: string | null
  executionCapability: AgentPolicyCapability
  operationalCapabilityKey: string
  resource: AgentActionResource
  policyVersion: string
  approvalPolicyKey: string | null
  issuedAt: string
  expiresAt: string
  envelopeHash: string
}

function hashEnvelope(value: Omit<WorkflowAuthorizationEnvelope, 'envelopeHash'>) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function issueWorkflowAuthorizationEnvelope(input: {
  workflowKey: string
  workflowVersion: number
  taskKey: string
  actorUserId: string
  agentKey?: string | null
  executionCapability: AgentPolicyCapability
  operationalCapabilityKey: string
  resource: AgentActionResource
  approvalPolicyKey?: string | null
  ttlMs?: number
  now?: Date
}): Promise<WorkflowAuthorizationEnvelope> {
  if (!input.operationalCapabilityKey.trim()) throw new Error('Operational capability key is required.')
  await authorizeAgentAction(input.actorUserId, input.executionCapability, input.resource)
  const issuedAt = input.now ?? new Date()
  const ttlMs = input.ttlMs ?? 5 * 60 * 1000
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 60 * 60 * 1000) throw new Error('Authorization envelope TTL must be between 1ms and 1 hour.')
  const value: Omit<WorkflowAuthorizationEnvelope, 'envelopeHash'> = {
    schemaVersion: '1.1',
    workflowKey: input.workflowKey,
    workflowVersion: input.workflowVersion,
    taskKey: input.taskKey,
    actorUserId: input.actorUserId,
    agentKey: input.agentKey ?? null,
    executionCapability: input.executionCapability,
    operationalCapabilityKey: input.operationalCapabilityKey,
    resource: input.resource,
    policyVersion: AGENT_POLICY_VERSION,
    approvalPolicyKey: input.approvalPolicyKey ?? null,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
  }
  return { ...value, envelopeHash: hashEnvelope(value) }
}

export function assertWorkflowAuthorizationEnvelopeCurrent(envelope: WorkflowAuthorizationEnvelope, now = new Date()) {
  if (envelope.policyVersion !== AGENT_POLICY_VERSION) throw new Error('Workflow authorization envelope policy version is stale.')
  if (Date.parse(envelope.expiresAt) <= now.getTime()) throw new Error('Workflow authorization envelope has expired.')
  const { envelopeHash, ...value } = envelope
  if (hashEnvelope(value) !== envelopeHash) throw new Error('Workflow authorization envelope integrity check failed.')
}

export async function reauthorizeWorkflowEnvelope(envelope: WorkflowAuthorizationEnvelope) {
  assertWorkflowAuthorizationEnvelopeCurrent(envelope)
  await authorizeAgentAction(envelope.actorUserId, envelope.executionCapability, envelope.resource)
}
