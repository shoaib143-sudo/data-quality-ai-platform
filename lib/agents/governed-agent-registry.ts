export const GOVERNED_AGENT_KEYS = [
  'profiling_agent',
  'data_quality_agent',
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
] as const

export type GovernedAgentKey = typeof GOVERNED_AGENT_KEYS[number]

export const GOVERNANCE_SPECIALIST_AGENT_KEYS = [
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
] as const

export type GovernanceSpecialistAgentKey = typeof GOVERNANCE_SPECIALIST_AGENT_KEYS[number]

export type GovernedAgentAuthority = 'EVIDENCE_PRODUCER' | 'CONTROL_EXECUTOR' | 'READ_ONLY_ADVISORY'
export type GovernedMutationBoundary = 'NO_SOURCE_MUTATION' | 'GOVERNED_WORKFLOW_ONLY' | 'READ_ONLY'

export type GovernedAgentPolicy = {
  key: GovernedAgentKey
  role: string
  executionSurface: string
  executionMode: string
  authority: GovernedAgentAuthority
  mutationBoundary: GovernedMutationBoundary
  requiresHumanApprovalForGovernanceMutation: boolean
  toolAllowlist: readonly string[]
  evidenceDomains: readonly string[]
  handoffTargets: readonly GovernedAgentKey[]
}

export const GOVERNED_AGENT_POLICIES: Record<GovernedAgentKey, GovernedAgentPolicy> = {
  profiling_agent: {
    key: 'profiling_agent',
    role: 'PROFILING_SPECIALIST',
    executionSurface: '/api/agents/run',
    executionMode: 'deterministic_tools',
    authority: 'EVIDENCE_PRODUCER',
    mutationBoundary: 'NO_SOURCE_MUTATION',
    requiresHumanApprovalForGovernanceMutation: true,
    toolAllowlist: [
      'profiling.source.read',
      'profiling.schema.discover',
      'profiling.metrics.execute',
      'profiling.findings.persist',
    ],
    evidenceDomains: ['dataset_version', 'profile_run', 'profile_columns', 'metric_results', 'findings', 'quality_score'],
    handoffTargets: ['data_quality_agent', 'investigator_agent', 'steward_agent'],
  },
  data_quality_agent: {
    key: 'data_quality_agent',
    role: 'DATA_QUALITY_SPECIALIST',
    executionSurface: '/api/data-quality/run',
    executionMode: 'durable_control_execution',
    authority: 'CONTROL_EXECUTOR',
    mutationBoundary: 'GOVERNED_WORKFLOW_ONLY',
    requiresHumanApprovalForGovernanceMutation: true,
    toolAllowlist: [
      'quality.rules.read',
      'quality.rules.execute',
      'quality.incident.read',
      'quality.remediation.propose',
    ],
    evidenceDomains: ['quality_rule_definition', 'quality_rule_run', 'waiver', 'finding', 'issue', 'remediation_outcome'],
    handoffTargets: ['investigator_agent', 'steward_agent', 'governance_analyst_agent'],
  },
  steward_agent: {
    key: 'steward_agent',
    role: 'DATA_STEWARD',
    executionSurface: '/api/agents/governance/run',
    executionMode: 'governed_investigation_read_only',
    authority: 'READ_ONLY_ADVISORY',
    mutationBoundary: 'READ_ONLY',
    requiresHumanApprovalForGovernanceMutation: true,
    toolAllowlist: ['governance.dataset.read', 'governance.glossary.read', 'governance.cde.read', 'governance.classification.read', 'governance.stewardship.read'],
    evidenceDomains: ['dataset', 'glossary', 'cde', 'classification', 'stewardship', 'certification', 'issue'],
    handoffTargets: ['governance_analyst_agent', 'data_quality_agent', 'investigator_agent'],
  },
  governance_analyst_agent: {
    key: 'governance_analyst_agent',
    role: 'GOVERNANCE_ANALYST',
    executionSurface: '/api/agents/governance/run',
    executionMode: 'governed_investigation_read_only',
    authority: 'READ_ONLY_ADVISORY',
    mutationBoundary: 'READ_ONLY',
    requiresHumanApprovalForGovernanceMutation: true,
    toolAllowlist: ['governance.dataset.read', 'governance.policy.read', 'governance.control.read', 'governance.contract.read', 'governance.risk.read', 'lineage.read'],
    evidenceDomains: ['policy', 'control', 'regulation', 'cde', 'contract', 'certification', 'quality', 'lineage'],
    handoffTargets: ['steward_agent', 'architect_agent', 'investigator_agent', 'executive_agent'],
  },
  architect_agent: {
    key: 'architect_agent',
    role: 'DATA_ARCHITECT',
    executionSurface: '/api/agents/governance/run',
    executionMode: 'governed_investigation_read_only',
    authority: 'READ_ONLY_ADVISORY',
    mutationBoundary: 'READ_ONLY',
    requiresHumanApprovalForGovernanceMutation: true,
    toolAllowlist: ['catalog.read', 'lineage.read', 'contracts.read', 'profiling.history.read', 'governance.cde.read'],
    evidenceDomains: ['dataset', 'schema', 'lineage', 'transformation', 'contract', 'cde', 'profile_comparison'],
    handoffTargets: ['governance_analyst_agent', 'investigator_agent', 'steward_agent'],
  },
  investigator_agent: {
    key: 'investigator_agent',
    role: 'INCIDENT_INVESTIGATOR',
    executionSurface: '/api/agents/governance/run',
    executionMode: 'governed_investigation_read_only',
    authority: 'READ_ONLY_ADVISORY',
    mutationBoundary: 'READ_ONLY',
    requiresHumanApprovalForGovernanceMutation: true,
    toolAllowlist: ['quality.incident.read', 'quality.history.read', 'profiling.history.read', 'lineage.read', 'governance.issue.read', 'remediation.history.read'],
    evidenceDomains: ['incident', 'issue', 'quality_rule_run', 'anomaly', 'profile_run', 'lineage', 'remediation_history'],
    handoffTargets: ['data_quality_agent', 'architect_agent', 'steward_agent', 'support_agent'],
  },
  executive_agent: {
    key: 'executive_agent',
    role: 'EXECUTIVE_GOVERNANCE',
    executionSurface: '/api/agents/governance/run',
    executionMode: 'governed_investigation_read_only',
    authority: 'READ_ONLY_ADVISORY',
    mutationBoundary: 'READ_ONLY',
    requiresHumanApprovalForGovernanceMutation: true,
    toolAllowlist: ['governance.scorecard.read', 'governance.risk.read', 'governance.certification.read', 'quality.summary.read', 'governance.control.read'],
    evidenceDomains: ['scorecard', 'risk', 'certification', 'critical_cde', 'issue', 'incident', 'control'],
    handoffTargets: ['governance_analyst_agent', 'steward_agent', 'investigator_agent'],
  },
  support_agent: {
    key: 'support_agent',
    role: 'OPERATIONS_SUPPORT',
    executionSurface: '/api/agents/governance/run',
    executionMode: 'governed_investigation_read_only',
    authority: 'READ_ONLY_ADVISORY',
    mutationBoundary: 'READ_ONLY',
    requiresHumanApprovalForGovernanceMutation: true,
    toolAllowlist: ['profiling.history.read', 'quality.incident.read', 'governance.issue.read', 'remediation.history.read', 'lineage.read'],
    evidenceDomains: ['profile_run', 'alert', 'issue', 'incident', 'remediation_history', 'lineage'],
    handoffTargets: ['investigator_agent', 'data_quality_agent', 'steward_agent'],
  },
}

export function isGovernedAgentKey(value: unknown): value is GovernedAgentKey {
  return typeof value === 'string' && (GOVERNED_AGENT_KEYS as readonly string[]).includes(value)
}

export function getGovernedAgentPolicy(agentKey: GovernedAgentKey): GovernedAgentPolicy {
  return GOVERNED_AGENT_POLICIES[agentKey]
}
