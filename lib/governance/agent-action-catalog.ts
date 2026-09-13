import type { AuthorizationCapability } from '@/lib/auth/authorize'
import type { AgentPolicyCapability, RiskLevel } from './agent-policy-v2'

export type AgentActionKey =
  | 'CONVERSE_GOVERNANCE_AGENT'
  | 'RUN_PROFILING'
  | 'RUN_DATA_QUALITY'
  | 'RUN_SUPERVISOR'
  | 'RETRY_EXECUTION'
  | 'CANCEL_EXECUTION'
  | 'APPLY_GOVERNED_MUTATION'

export type AgentActionProfile = {
  key: AgentActionKey
  capability: AuthorizationCapability
  requestCapability: AgentPolicyCapability
  target: 'PROJECT' | 'DATASET'
  materialProductionMutation: boolean
  financialImpact: RiskLevel
  productionScope: RiskLevel
  reversibility: 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE'
  computeCost: RiskLevel
}

export const agentActionCatalog: Record<AgentActionKey, AgentActionProfile> = {
  CONVERSE_GOVERNANCE_AGENT: {
    key: 'CONVERSE_GOVERNANCE_AGENT',
    capability: 'agent.converse',
    requestCapability: 'agent.converse',
    target: 'PROJECT',
    materialProductionMutation: false,
    financialImpact: 'LOW',
    productionScope: 'LOW',
    reversibility: 'REVERSIBLE',
    computeCost: 'LOW',
  },
  RUN_PROFILING: {
    key: 'RUN_PROFILING',
    capability: 'profiling.execute',
    requestCapability: 'agent.recommend',
    target: 'DATASET',
    materialProductionMutation: false,
    financialImpact: 'LOW',
    productionScope: 'MEDIUM',
    reversibility: 'REVERSIBLE',
    computeCost: 'MEDIUM',
  },
  RUN_DATA_QUALITY: {
    key: 'RUN_DATA_QUALITY',
    capability: 'quality.execute',
    requestCapability: 'agent.recommend',
    target: 'DATASET',
    materialProductionMutation: false,
    financialImpact: 'MEDIUM',
    productionScope: 'MEDIUM',
    reversibility: 'REVERSIBLE',
    computeCost: 'MEDIUM',
  },
  RUN_SUPERVISOR: {
    key: 'RUN_SUPERVISOR',
    capability: 'agent.execute',
    requestCapability: 'agent.recommend',
    target: 'PROJECT',
    materialProductionMutation: false,
    financialImpact: 'MEDIUM',
    productionScope: 'MEDIUM',
    reversibility: 'PARTIALLY_REVERSIBLE',
    computeCost: 'MEDIUM',
  },
  RETRY_EXECUTION: {
    key: 'RETRY_EXECUTION',
    capability: 'execution.retry',
    requestCapability: 'agent.recommend',
    target: 'PROJECT',
    materialProductionMutation: false,
    financialImpact: 'MEDIUM',
    productionScope: 'MEDIUM',
    reversibility: 'PARTIALLY_REVERSIBLE',
    computeCost: 'MEDIUM',
  },
  CANCEL_EXECUTION: {
    key: 'CANCEL_EXECUTION',
    capability: 'execution.cancel',
    requestCapability: 'agent.recommend',
    target: 'PROJECT',
    materialProductionMutation: false,
    financialImpact: 'MEDIUM',
    productionScope: 'MEDIUM',
    reversibility: 'PARTIALLY_REVERSIBLE',
    computeCost: 'LOW',
  },
  APPLY_GOVERNED_MUTATION: {
    key: 'APPLY_GOVERNED_MUTATION',
    capability: 'agent.execute',
    requestCapability: 'agent.recommend',
    target: 'DATASET',
    materialProductionMutation: true,
    financialImpact: 'HIGH',
    productionScope: 'HIGH',
    reversibility: 'PARTIALLY_REVERSIBLE',
    computeCost: 'MEDIUM',
  },
}

export function getAgentActionProfile(value: string): AgentActionProfile {
  const profile = agentActionCatalog[value as AgentActionKey]
  if (!profile) throw new Error('Unsupported governed agent action.')
  return profile
}
