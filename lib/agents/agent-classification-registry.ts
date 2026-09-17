import {
  GOVERNED_AGENT_KEYS,
  getGovernedAgentPolicy,
  type GovernedAgentKey,
} from './governed-agent-registry'

export type DecisionArchitecture = 'SIMPLE_REFLEX' | 'MODEL_BASED_REFLEX' | 'GOAL_BASED' | 'UTILITY_BASED' | 'LEARNING' | 'HYBRID'
export type ReasoningArchitecture = 'REACTIVE' | 'DELIBERATIVE' | 'HYBRID_REACTIVE_DELIBERATIVE'
export type ControlPattern = 'OPEN_LOOP' | 'CLOSED_LOOP' | 'CLOSED_LOOP_SELF_HEALING' | 'ADVISORY_ONLY'
export type AutonomyLevel = 'READ_ONLY' | 'ADVISORY' | 'BOUNDED_AUTONOMY' | 'GOVERNED_AUTONOMY' | 'FULL_AUTONOMY'
export type HumanGovernanceModel = 'HUMAN_IN_THE_LOOP' | 'HUMAN_ON_THE_LOOP' | 'HUMAN_OUT_OF_THE_LOOP' | 'MIXED_BY_RISK_TIER'
export type StateModel = 'STATELESS' | 'STATEFUL' | 'STATEFUL_WITH_EPISODIC_MEMORY' | 'STATEFUL_WITH_VALIDATED_OPERATIONAL_MEMORY'
export type TriggerModel = 'EVENT_DRIVEN' | 'SCHEDULED' | 'USER_INITIATED' | 'CONDITION_DRIVEN' | 'PREDICTIVE' | 'HYBRID_TRIGGERED'
export type AgentTopology = 'SINGLE_AGENT' | 'CENTRALIZED_ORCHESTRATOR' | 'HIERARCHICAL_MULTI_AGENT' | 'PEER_TO_PEER_MULTI_AGENT' | 'SUPERVISOR_SPECIALIST'
export type CoordinationPattern = 'NONE' | 'CENTRAL_COORDINATOR' | 'SUPERVISOR_WORKER' | 'DELEGATION' | 'CONSENSUS' | 'SEQUENTIAL_SPECIALISTS' | 'PARALLEL_SPECIALISTS'
export type KnowledgeArchitecture = 'RULE_BASED' | 'EVIDENCE_GROUNDED' | 'RETRIEVAL_AUGMENTED' | 'KNOWLEDGE_AUGMENTED' | 'RESEARCH_ENABLED' | 'WEB_RESEARCH_ENABLED'
export type ToolingModel = 'NO_TOOLS' | 'READ_ONLY_TOOLS' | 'GOVERNED_TOOL_USING' | 'MUTATION_TOOLS_WITH_APPROVAL' | 'DYNAMIC_TOOL_SELECTION'
export type LearningAdaptation = 'NONE' | 'STATIC_POLICY_WITH_HISTORY' | 'OUTCOME_INFORMED' | 'GOVERNED_ADAPTIVE_LEARNING' | 'ONLINE_LEARNING'
export type DeterminismModel = 'DETERMINISTIC' | 'PROBABILISTIC' | 'HYBRID_DETERMINISTIC_PROBABILISTIC'
export type ExplainabilityModel = 'OPAQUE' | 'RULE_EXPLAINABLE' | 'EVIDENCE_EXPLAINABLE' | 'RCA_EXPLAINABLE' | 'USER_FACING_EXPLAINABLE'
export type RiskGovernanceTrait = 'POLICY_CONSTRAINED' | 'RISK_TIERED' | 'REVERSIBILITY_AWARE' | 'AUDITABLE' | 'LEAST_PRIVILEGE' | 'FAIL_CLOSED' | 'APPROVAL_GATED'
export type EnvironmentObservability = 'FULLY_OBSERVABLE' | 'PARTIALLY_OBSERVABLE' | 'PARTIALLY_OBSERVABLE_WITH_ACTIVE_INVESTIGATION'
export type RecoveryValidationBehaviour = 'NO_RECOVERY' | 'RETRY_ONLY' | 'DIAGNOSE_AND_RECOMMEND' | 'DIAGNOSE_REMEDIATE_VALIDATE' | 'DIAGNOSE_REMEDIATE_VALIDATE_ROLLBACK' | 'ESCALATION_AWARE'

export type CurrentTarget<T> = {
  current: T
  target: T | null
}

export type AgentClassificationRecord = {
  agentKey: GovernedAgentKey
  decisionArchitecture: CurrentTarget<DecisionArchitecture>
  reasoningArchitecture: CurrentTarget<ReasoningArchitecture>
  operationalRole: string
  controlPattern: CurrentTarget<ControlPattern>
  autonomyLevel: CurrentTarget<AutonomyLevel>
  humanGovernanceModel: CurrentTarget<HumanGovernanceModel>
  humanGovernanceBoundary: string | null
  stateModel: CurrentTarget<StateModel>
  triggerModel: CurrentTarget<TriggerModel>
  topology: CurrentTarget<AgentTopology>
  coordinationPattern: CurrentTarget<CoordinationPattern>
  knowledgeArchitecture: CurrentTarget<KnowledgeArchitecture>
  toolingModel: CurrentTarget<ToolingModel>
  learningAdaptation: CurrentTarget<LearningAdaptation>
  determinismModel: CurrentTarget<DeterminismModel>
  explainabilityModel: CurrentTarget<ExplainabilityModel>
  riskGovernancePosture: readonly RiskGovernanceTrait[]
  environmentObservability: CurrentTarget<EnvironmentObservability>
  recoveryValidationBehaviour: CurrentTarget<RecoveryValidationBehaviour>
  evidenceBasis: readonly string[]
  classificationVersion: 'ADR-007-v1'
}

const GUARDED_POSTURE = [
  'POLICY_CONSTRAINED',
  'AUDITABLE',
  'LEAST_PRIVILEGE',
  'FAIL_CLOSED',
  'APPROVAL_GATED',
] as const satisfies readonly RiskGovernanceTrait[]

const READ_ONLY_SPECIALIST_BASE = {
  decisionArchitecture: { current: 'MODEL_BASED_REFLEX', target: null },
  reasoningArchitecture: { current: 'REACTIVE', target: null },
  controlPattern: { current: 'ADVISORY_ONLY', target: null },
  autonomyLevel: { current: 'READ_ONLY', target: null },
  humanGovernanceModel: { current: 'HUMAN_ON_THE_LOOP', target: null },
  humanGovernanceBoundary: null,
  stateModel: { current: 'STATEFUL_WITH_EPISODIC_MEMORY', target: null },
  triggerModel: { current: 'HYBRID_TRIGGERED', target: null },
  topology: { current: 'SUPERVISOR_SPECIALIST', target: null },
  coordinationPattern: { current: 'DELEGATION', target: null },
  knowledgeArchitecture: { current: 'KNOWLEDGE_AUGMENTED', target: null },
  toolingModel: { current: 'READ_ONLY_TOOLS', target: null },
  learningAdaptation: { current: 'STATIC_POLICY_WITH_HISTORY', target: null },
  determinismModel: { current: 'HYBRID_DETERMINISTIC_PROBABILISTIC', target: null },
  riskGovernancePosture: GUARDED_POSTURE,
  environmentObservability: { current: 'PARTIALLY_OBSERVABLE_WITH_ACTIVE_INVESTIGATION', target: null },
  recoveryValidationBehaviour: { current: 'ESCALATION_AWARE', target: null },
  classificationVersion: 'ADR-007-v1',
} as const

export const AGENT_CLASSIFICATIONS: Record<GovernedAgentKey, AgentClassificationRecord> = {
  profiling_agent: {
    agentKey: 'profiling_agent',
    decisionArchitecture: { current: 'MODEL_BASED_REFLEX', target: null },
    reasoningArchitecture: { current: 'REACTIVE', target: null },
    operationalRole: 'PROFILING_SPECIALIST',
    controlPattern: { current: 'OPEN_LOOP', target: null },
    autonomyLevel: { current: 'BOUNDED_AUTONOMY', target: null },
    humanGovernanceModel: { current: 'HUMAN_ON_THE_LOOP', target: null },
    humanGovernanceBoundary: null,
    stateModel: { current: 'STATEFUL', target: null },
    triggerModel: { current: 'USER_INITIATED', target: null },
    topology: { current: 'SINGLE_AGENT', target: null },
    coordinationPattern: { current: 'NONE', target: null },
    knowledgeArchitecture: { current: 'EVIDENCE_GROUNDED', target: null },
    toolingModel: { current: 'GOVERNED_TOOL_USING', target: null },
    learningAdaptation: { current: 'STATIC_POLICY_WITH_HISTORY', target: null },
    determinismModel: { current: 'DETERMINISTIC', target: null },
    explainabilityModel: { current: 'EVIDENCE_EXPLAINABLE', target: null },
    riskGovernancePosture: GUARDED_POSTURE,
    environmentObservability: { current: 'PARTIALLY_OBSERVABLE', target: null },
    recoveryValidationBehaviour: { current: 'RETRY_ONLY', target: null },
    evidenceBasis: ['governed-agent-registry', '/api/agents/run', 'deterministic profiling tools', 'persisted profile runs'],
    classificationVersion: 'ADR-007-v1',
  },
  data_quality_agent: {
    agentKey: 'data_quality_agent',
    decisionArchitecture: { current: 'MODEL_BASED_REFLEX', target: null },
    reasoningArchitecture: { current: 'REACTIVE', target: null },
    operationalRole: 'DATA_QUALITY_SPECIALIST',
    controlPattern: { current: 'OPEN_LOOP', target: null },
    autonomyLevel: { current: 'GOVERNED_AUTONOMY', target: null },
    humanGovernanceModel: { current: 'MIXED_BY_RISK_TIER', target: null },
    humanGovernanceBoundary: 'Deterministic quality execution and evidence publication may proceed under governed runtime controls; governance or remediation mutation requires explicit approval according to policy.',
    stateModel: { current: 'STATEFUL', target: null },
    triggerModel: { current: 'HYBRID_TRIGGERED', target: null },
    topology: { current: 'SINGLE_AGENT', target: null },
    coordinationPattern: { current: 'DELEGATION', target: null },
    knowledgeArchitecture: { current: 'EVIDENCE_GROUNDED', target: null },
    toolingModel: { current: 'GOVERNED_TOOL_USING', target: null },
    learningAdaptation: { current: 'STATIC_POLICY_WITH_HISTORY', target: null },
    determinismModel: { current: 'DETERMINISTIC', target: null },
    explainabilityModel: { current: 'EVIDENCE_EXPLAINABLE', target: null },
    riskGovernancePosture: [...GUARDED_POSTURE, 'RISK_TIERED', 'REVERSIBILITY_AWARE'],
    environmentObservability: { current: 'PARTIALLY_OBSERVABLE', target: null },
    recoveryValidationBehaviour: { current: 'DIAGNOSE_AND_RECOMMEND', target: null },
    evidenceBasis: ['governed-agent-registry', '/api/data-quality/run', 'durable control execution', 'governed remediation proposal tool'],
    classificationVersion: 'ADR-007-v1',
  },
  steward_agent: {
    ...READ_ONLY_SPECIALIST_BASE,
    agentKey: 'steward_agent',
    operationalRole: 'DATA_STEWARD',
    explainabilityModel: { current: 'USER_FACING_EXPLAINABLE', target: null },
    evidenceBasis: ['governed-agent-registry', 'governance-specialist-agent', 'agent episodic memory', 'durable governed handoff'],
  },
  governance_analyst_agent: {
    ...READ_ONLY_SPECIALIST_BASE,
    agentKey: 'governance_analyst_agent',
    operationalRole: 'GOVERNANCE_ANALYST',
    explainabilityModel: { current: 'USER_FACING_EXPLAINABLE', target: null },
    evidenceBasis: ['governed-agent-registry', 'governance-specialist-agent', 'governance knowledge retrieval', 'knowledge graph traversal'],
  },
  architect_agent: {
    ...READ_ONLY_SPECIALIST_BASE,
    agentKey: 'architect_agent',
    operationalRole: 'DATA_ARCHITECT',
    explainabilityModel: { current: 'EVIDENCE_EXPLAINABLE', target: null },
    evidenceBasis: ['governed-agent-registry', 'governance-specialist-agent', 'lineage read tools', 'contract evidence'],
  },
  investigator_agent: {
    ...READ_ONLY_SPECIALIST_BASE,
    agentKey: 'investigator_agent',
    operationalRole: 'INCIDENT_INVESTIGATOR',
    explainabilityModel: { current: 'RCA_EXPLAINABLE', target: null },
    recoveryValidationBehaviour: { current: 'DIAGNOSE_AND_RECOMMEND', target: null },
    evidenceBasis: ['governed-agent-registry', 'governance-specialist-agent', 'governed investigation contract', 'predictive risk persistence'],
  },
  executive_agent: {
    ...READ_ONLY_SPECIALIST_BASE,
    agentKey: 'executive_agent',
    operationalRole: 'EXECUTIVE_GOVERNANCE',
    explainabilityModel: { current: 'USER_FACING_EXPLAINABLE', target: null },
    evidenceBasis: ['governed-agent-registry', 'governance-specialist-agent', 'scorecard and risk evidence', 'agent episodic memory'],
  },
  support_agent: {
    ...READ_ONLY_SPECIALIST_BASE,
    agentKey: 'support_agent',
    operationalRole: 'OPERATIONS_SUPPORT',
    explainabilityModel: { current: 'USER_FACING_EXPLAINABLE', target: null },
    recoveryValidationBehaviour: { current: 'DIAGNOSE_AND_RECOMMEND', target: null },
    evidenceBasis: ['governed-agent-registry', 'governance-specialist-agent', 'incident and remediation history', 'agent episodic memory'],
  },
}

export function getAgentClassification(agentKey: GovernedAgentKey): AgentClassificationRecord {
  return AGENT_CLASSIFICATIONS[agentKey]
}

export function validateAgentClassifications(): void {
  const classifiedKeys = Object.keys(AGENT_CLASSIFICATIONS).sort()
  const governedKeys = [...GOVERNED_AGENT_KEYS].sort()
  if (JSON.stringify(classifiedKeys) !== JSON.stringify(governedKeys)) {
    throw new Error('ADR-007 classifications must cover the canonical governed-agent portfolio exactly')
  }

  for (const agentKey of GOVERNED_AGENT_KEYS) {
    const classification = AGENT_CLASSIFICATIONS[agentKey]
    const policy = getGovernedAgentPolicy(agentKey)
    if (classification.agentKey !== agentKey) throw new Error(`Classification key mismatch for ${agentKey}`)
    if (classification.operationalRole !== policy.role) throw new Error(`Classification role drift for ${agentKey}`)
    if (classification.evidenceBasis.length === 0) throw new Error(`Classification requires runtime evidence basis for ${agentKey}`)
    if (classification.classificationVersion !== 'ADR-007-v1') throw new Error(`Unexpected classification version for ${agentKey}`)

    if (classification.humanGovernanceModel.current === 'MIXED_BY_RISK_TIER' && !classification.humanGovernanceBoundary?.trim()) {
      throw new Error(`MIXED_BY_RISK_TIER classification requires an explicit human-governance boundary: ${agentKey}`)
    }

    if (policy.mutationBoundary === 'READ_ONLY') {
      if (classification.autonomyLevel.current !== 'READ_ONLY') throw new Error(`Read-only policy must classify as READ_ONLY: ${agentKey}`)
      if (classification.controlPattern.current !== 'ADVISORY_ONLY') throw new Error(`Read-only policy must classify as ADVISORY_ONLY: ${agentKey}`)
      if (classification.toolingModel.current !== 'READ_ONLY_TOOLS') throw new Error(`Read-only policy must classify as READ_ONLY_TOOLS: ${agentKey}`)
    }

    if (classification.decisionArchitecture.current === 'LEARNING' || classification.learningAdaptation.current === 'ONLINE_LEARNING') {
      throw new Error(`Current classification may not claim autonomous learning without stronger validated runtime evidence: ${agentKey}`)
    }
    if (classification.autonomyLevel.current === 'FULL_AUTONOMY') {
      throw new Error(`FULL_AUTONOMY is not approved for canonical DataNexus agents: ${agentKey}`)
    }
  }
}
