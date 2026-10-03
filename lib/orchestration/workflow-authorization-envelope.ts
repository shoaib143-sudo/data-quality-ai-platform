import { AGENT_POLICY_VERSION, type AgentPolicyCapability } from '@/lib/governance/agent-policy-v2'
import { authorizeAgentAction, type AgentActionResource } from '@/lib/governance/agent-authorization'

export type WorkflowAuthorizationEnvelope = {
  schemaVersion: '1.0'
  workflowKey: string
  workflowVersion: number
  taskKey: string
  actorUserId: string
  agentKey: string | null
  capability: AgentPolicyCapability
  resource: AgentActionResource
  policyVersion: string
  approvalPolicyKey: string | null
  issuedAt: string
  expiresAt: string
}

export async function issueWorkflowAuthorizationEnvelope(input: {
  workflowKey: string
  workflowVersion: number
  taskKey: string
  actorUserId: string
  agentKey?: string | null
  capability: AgentPolicyCapability
  resource: AgentActionResource
  approvalPolicyKey?: string | null
  ttlMs?: number
  now?: Date
}): Promise<WorkflowAuthorizationEnvelope> {
  await authorizeAgentAction(input.actorUserId, input.capability, input.resource)
  const issuedAt = input.now ?? new Date()
  const ttlMs = input.ttlMs ?? 5 * 60 * 1000
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 60 * 60 * 1000) throw new Error('Authorization envelope TTL must be between 1ms and 1 hour.')
  return {
    schemaVersion: '1.0',
    workflowKey: input.workflowKey,
    workflowVersion: input.workflowVersion,
    taskKey: input.taskKey,
    actorUserId: input.actorUserId,
    agentKey: input.agentKey ?? null,
    capability: input.capability,
    resource: input.resource,
    policyVersion: AGENT_POLICY_VERSION,
    approvalPolicyKey: input.approvalPolicyKey ?? null,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
  }
}

export function assertWorkflowAuthorizationEnvelopeCurrent(envelope: WorkflowAuthorizationEnvelope, now = new Date()) {
  if (envelope.policyVersion !== AGENT_POLICY_VERSION) throw new Error('Workflow authorization envelope policy version is stale.')
  if (Date.parse(envelope.expiresAt) <= now.getTime()) throw new Error('Workflow authorization envelope has expired.')
}
