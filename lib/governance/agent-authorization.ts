import {
  authorizeDataset,
  authorizeProject,
  type AuthorizationCapability,
  type ProjectAuthorization,
} from '@/lib/auth/authorize'
import type { AgentPolicyCapability } from './agent-policy-v2'
import { canViewDatasetResource } from './resource-authorization'

export type AgentActionResource =
  | { type: 'PROJECT'; projectId: string }
  | { type: 'DATASET'; projectId: string; datasetId: string }

export type AgentActionAuthorization = {
  authorization: ProjectAuthorization
  capability: AgentPolicyCapability
  resource: AgentActionResource
}

const capabilityMap: Record<AgentPolicyCapability, AuthorizationCapability> = {
  'agent.view': 'agent.view',
  'agent.converse': 'agent.converse',
  'agent.investigate': 'agent.investigate',
  'agent.recommend': 'agent.recommend',
  'execution.view': 'execution.view',
  'execution.view_results': 'execution.view_results',
  'execution.view_evidence': 'execution.view_evidence',
  'agent.execute': 'agent.execute',
  'execution.retry': 'execution.retry',
  'execution.cancel': 'execution.cancel',
  'execution.approve': 'execution.approve',
  'agent.admin': 'agent.admin',
}

export async function authorizeAgentAction(
  userId: string,
  capability: AgentPolicyCapability,
  resource: AgentActionResource,
): Promise<AgentActionAuthorization> {
  const mappedCapability = capabilityMap[capability]

  if (resource.type === 'DATASET') {
    if (!await canViewDatasetResource(userId, resource.datasetId)) {
      throw new Error('You are not authorized to access this dataset resource.')
    }
    const { authorization, dataset } = await authorizeDataset(userId, resource.datasetId, mappedCapability)
    if (dataset.project_id !== resource.projectId) {
      throw new Error('Dataset authorization context does not match the requested project.')
    }
    return { authorization, capability, resource }
  }

  const authorization = await authorizeProject(userId, resource.projectId, mappedCapability)
  return { authorization, capability, resource }
}
