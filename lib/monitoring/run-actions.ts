import { authorizeAgentAction } from '@/lib/governance/agent-authorization'
import type { AgentPolicyCapability } from '@/lib/governance/agent-policy-v2'

export const jobMonitorRunActionKeys = ['EXECUTE', 'RETRY', 'CANCEL', 'APPROVE', 'ADMIN'] as const
export type JobMonitorRunActionKey = (typeof jobMonitorRunActionKeys)[number]

export type JobMonitorRunAction = {
  key: JobMonitorRunActionKey
  capability: AgentPolicyCapability
  authorized: boolean
  stateEligible: boolean
  available: boolean
  mode: 'MUTATION' | 'NAVIGATION'
  href: string | null
  endpoint: string | null
  reason: string | null
}

type RunContext = {
  id: string
  project_id: string
  dataset_id: string | null
  status: string
}

const capabilityByAction: Record<JobMonitorRunActionKey, AgentPolicyCapability> = {
  EXECUTE: 'agent.execute',
  RETRY: 'execution.retry',
  CANCEL: 'execution.cancel',
  APPROVE: 'execution.approve',
  ADMIN: 'agent.admin',
}

function stateEligible(action: JobMonitorRunActionKey, status: string) {
  const normalized = status.toUpperCase()
  if (action === 'CANCEL') return ['CREATED', 'PENDING', 'QUEUED', 'RUNNING', 'WAITING'].includes(normalized)
  if (action === 'RETRY') return ['FAILED', 'DEAD'].includes(normalized)
  if (action === 'APPROVE') return normalized === 'WAITING'
  if (action === 'EXECUTE') return ['CREATED', 'PENDING', 'WAITING'].includes(normalized)
  return true
}

function actionDestination(action: JobMonitorRunActionKey, runId: string) {
  if (action === 'CANCEL') return { mode: 'MUTATION' as const, endpoint: `/api/agents/runs/${runId}/terminate`, href: null }
  if (action === 'RETRY') return { mode: 'NAVIGATION' as const, endpoint: null, href: '/recovery' }
  if (action === 'APPROVE') return { mode: 'NAVIGATION' as const, endpoint: null, href: '/approvals' }
  if (action === 'EXECUTE') return { mode: 'NAVIGATION' as const, endpoint: null, href: '/agents' }
  return { mode: 'NAVIGATION' as const, endpoint: null, href: `/agents/runs/${runId}` }
}

export async function resolveJobMonitorRunActions(userId: string, run: RunContext): Promise<JobMonitorRunAction[]> {
  const resource = run.dataset_id
    ? { type: 'DATASET' as const, projectId: run.project_id, datasetId: run.dataset_id }
    : { type: 'PROJECT' as const, projectId: run.project_id }

  return Promise.all(jobMonitorRunActionKeys.map(async (key) => {
    const capability = capabilityByAction[key]
    let authorized = false
    try {
      await authorizeAgentAction(userId, capability, resource)
      authorized = true
    } catch {
      authorized = false
    }
    const eligible = stateEligible(key, run.status)
    const destination = actionDestination(key, run.id)
    return {
      key,
      capability,
      authorized,
      stateEligible: eligible,
      available: authorized && eligible,
      ...destination,
      reason: !authorized
        ? `Missing ${capability} capability for this governed resource.`
        : !eligible
          ? `Action is not legal while the run is ${run.status}.`
          : null,
    }
  }))
}
