export const AGENT_POLICY_VERSION = 'agent-policy-v2.1'

export const agentPolicyCapabilities = [
  'agent.view',
  'agent.converse',
  'agent.investigate',
  'agent.recommend',
  'execution.view',
  'execution.view_results',
  'execution.view_evidence',
  'agent.execute',
  'execution.retry',
  'execution.cancel',
  'execution.approve',
  'agent.admin',
] as const

export type AgentPolicyCapability = (typeof agentPolicyCapabilities)[number]

export const readOnlyAgentCapabilities: readonly AgentPolicyCapability[] = [
  'agent.view',
  'agent.converse',
  'agent.investigate',
  'agent.recommend',
  'execution.view',
  'execution.view_results',
  'execution.view_evidence',
]

export const mutatingAgentCapabilities: readonly AgentPolicyCapability[] = [
  'agent.execute',
  'execution.retry',
  'execution.cancel',
  'execution.approve',
  'agent.admin',
]

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type BusinessCriticality = 'STANDARD' | 'IMPORTANT' | 'KDE' | 'CDE'
export type EnvironmentClass = 'NON_PRODUCTION' | 'PRODUCTION'

export const approvalSlaDays: Record<RiskLevel, number> = {
  LOW: 7,
  MEDIUM: 5,
  HIGH: 3,
  CRITICAL: 1,
}

export type ApprovalAxis = 'BUSINESS' | 'GOVERNANCE'

export type DelegationScope = {
  domainId: string
  projectIds?: readonly string[]
  actionKeys?: readonly string[]
  maxRisk?: RiskLevel
  startsAt: string
  endsAt?: string | null
}

export type ExecutionFingerprintInput = {
  actionKey: string
  environment: EnvironmentClass
  projectId: string
  resourceIds: readonly string[]
  parameters: Record<string, unknown>
  policyVersion: string
  businessCriticality: BusinessCriticality
  dataSensitivity: 'LOW' | 'MEDIUM' | 'HIGH' | 'RESTRICTED'
  materialProductionMutation: boolean
  financialImpact: RiskLevel
  productionScope: RiskLevel
  reversibility: 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE'
  computeCost: RiskLevel
}

export type ApprovalPolicyInput = {
  environment: EnvironmentClass
  materialProductionMutation: boolean
  businessCriticality: BusinessCriticality
  dataSensitivity: 'LOW' | 'MEDIUM' | 'HIGH' | 'RESTRICTED'
  financialImpact: RiskLevel
  productionScope: RiskLevel
  reversibility: 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE'
  computeCost: RiskLevel
}

const riskRank: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }
const rankRisk: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export function evaluateRisk(input: ApprovalPolicyInput): RiskLevel {
  const candidates: RiskLevel[] = [
    input.financialImpact,
    input.productionScope,
    input.computeCost,
    input.dataSensitivity === 'RESTRICTED' ? 'CRITICAL' : input.dataSensitivity === 'HIGH' ? 'HIGH' : input.dataSensitivity === 'MEDIUM' ? 'MEDIUM' : 'LOW',
    input.reversibility === 'IRREVERSIBLE' ? 'CRITICAL' : input.reversibility === 'PARTIALLY_REVERSIBLE' ? 'HIGH' : 'LOW',
  ]
  let rank = Math.max(...candidates.map(value => riskRank[value]))
  if (input.businessCriticality === 'CDE' || input.businessCriticality === 'KDE') rank = Math.max(rank, riskRank.HIGH)
  if (input.materialProductionMutation && (input.businessCriticality === 'CDE' || input.businessCriticality === 'KDE')) {
    rank = riskRank.CRITICAL
  }
  return rankRisk[rank]
}

export function approvalRequirement(input: ApprovalPolicyInput) {
  const risk = evaluateRisk(input)
  const requiresDualApproval = input.environment === 'PRODUCTION' && input.materialProductionMutation
  return {
    risk,
    slaDays: approvalSlaDays[risk],
    requiresBusinessApproval: requiresDualApproval,
    requiresGovernanceApproval: requiresDualApproval,
    breakGlassAllowed: false,
    commentRequired: true,
    approvalValidUntilExecution: true,
  } as const
}
