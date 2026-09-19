import {
  GOVERNED_AGENT_KEYS,
  getGovernedAgentPolicy,
  type GovernedAgentKey,
} from './governed-agent-registry.ts'

export type AgentRecursionMode =
  | 'ANALYTICAL'
  | 'OUTCOME'
  | 'INVESTIGATIVE'
  | 'EVIDENCE'
  | 'GOVERNANCE'
  | 'IMPACT'
  | 'CASE_LEARNING'
  | 'MATERIALITY'

export type AgentEvaluationDimension =
  | 'correctness'
  | 'grounding'
  | 'completeness'
  | 'tool_selection'
  | 'tool_correctness'
  | 'authority_compliance'
  | 'evidence_sufficiency'
  | 'confidence_calibration'
  | 'handoff_quality'
  | 'outcome_quality'
  | 'latency'
  | 'cost'

export type AgentRecursionBudget = {
  maxIterations: number
  maxToolCalls: number
  maxHandoffs: number
  maxRuntimeMs: number
  stopConfidence: number
}

export type AgentExcellenceContract = {
  agentKey: GovernedAgentKey
  mission: string
  recursionMode: AgentRecursionMode
  recursionBudget: AgentRecursionBudget
  requiredEvaluationDimensions: readonly AgentEvaluationDimension[]
  stopConditions: readonly string[]
  escalationConditions: readonly string[]
  mayProposeSkillImprovements: boolean
  maySelfPromoteChanges: false
}

const BASE_EVALUATION_DIMENSIONS = [
  'correctness',
  'grounding',
  'tool_correctness',
  'authority_compliance',
  'evidence_sufficiency',
  'confidence_calibration',
] as const satisfies readonly AgentEvaluationDimension[]

const READ_ONLY_BUDGET: AgentRecursionBudget = {
  maxIterations: 6,
  maxToolCalls: 20,
  maxHandoffs: 4,
  maxRuntimeMs: 120_000,
  stopConfidence: 0.9,
}

const CONTROL_BUDGET: AgentRecursionBudget = {
  maxIterations: 5,
  maxToolCalls: 16,
  maxHandoffs: 3,
  maxRuntimeMs: 120_000,
  stopConfidence: 0.92,
}

const PROFILING_BUDGET: AgentRecursionBudget = {
  maxIterations: 4,
  maxToolCalls: 18,
  maxHandoffs: 3,
  maxRuntimeMs: 180_000,
  stopConfidence: 0.9,
}

export const AGENT_EXCELLENCE_CONTRACTS: Record<GovernedAgentKey, AgentExcellenceContract> = {
  profiling_agent: {
    agentKey: 'profiling_agent',
    mission: 'Produce deterministic, evidence-backed understanding of dataset structure, metrics, anomalies, comparisons, and profiling gaps without mutating source data.',
    recursionMode: 'ANALYTICAL',
    recursionBudget: PROFILING_BUDGET,
    requiredEvaluationDimensions: [...BASE_EVALUATION_DIMENSIONS, 'completeness', 'outcome_quality'],
    stopConditions: ['profiling coverage is sufficient for the objective', 'additional metrics are unlikely to materially change the conclusion', 'recursion budget exhausted'],
    escalationConditions: ['required source access unavailable', 'deterministic evidence is contradictory or incomplete beyond safe interpretation'],
    mayProposeSkillImprovements: true,
    maySelfPromoteChanges: false,
  },
  data_quality_agent: {
    agentKey: 'data_quality_agent',
    mission: 'Detect, diagnose, explain, and verify data-quality conditions using governed evidence and controlled remediation workflows.',
    recursionMode: 'OUTCOME',
    recursionBudget: CONTROL_BUDGET,
    requiredEvaluationDimensions: [...BASE_EVALUATION_DIMENSIONS, 'outcome_quality', 'handoff_quality'],
    stopConditions: ['quality condition is sufficiently diagnosed', 'post-remediation outcome is verified where execution is authorized', 'recursion budget exhausted'],
    escalationConditions: ['governance mutation requires approval', 'recommended remediation exceeds current authority', 'evidence cannot distinguish materially different causes'],
    mayProposeSkillImprovements: true,
    maySelfPromoteChanges: false,
  },
  steward_agent: {
    agentKey: 'steward_agent',
    mission: 'Identify stewardship, glossary, classification, ownership, certification, CDE, and policy gaps while preserving human governance authority.',
    recursionMode: 'GOVERNANCE',
    recursionBudget: READ_ONLY_BUDGET,
    requiredEvaluationDimensions: [...BASE_EVALUATION_DIMENSIONS, 'completeness', 'handoff_quality'],
    stopConditions: ['governance gap is evidence-backed and recommendation-ready', 'no material governed gap remains in scope', 'recursion budget exhausted'],
    escalationConditions: ['authoritative governance change is required', 'ownership or policy evidence conflicts without a deterministic authority rule'],
    mayProposeSkillImprovements: true,
    maySelfPromoteChanges: false,
  },
  governance_analyst_agent: {
    agentKey: 'governance_analyst_agent',
    mission: 'Answer cross-domain governance questions by synthesizing policy, control, quality, lineage, contract, risk, and semantic evidence.',
    recursionMode: 'EVIDENCE',
    recursionBudget: READ_ONLY_BUDGET,
    requiredEvaluationDimensions: [...BASE_EVALUATION_DIMENSIONS, 'completeness', 'handoff_quality'],
    stopConditions: ['evidence is sufficient to answer the governed question', 'remaining uncertainty is explicitly bounded', 'recursion budget exhausted'],
    escalationConditions: ['critical evidence sources disagree', 'answer would require inventing policy precedence or business semantics'],
    mayProposeSkillImprovements: true,
    maySelfPromoteChanges: false,
  },
  architect_agent: {
    agentKey: 'architect_agent',
    mission: 'Evaluate schema, lineage, contract, dependency, and technical-standard impacts with explicit blast-radius evidence.',
    recursionMode: 'IMPACT',
    recursionBudget: READ_ONLY_BUDGET,
    requiredEvaluationDimensions: [...BASE_EVALUATION_DIMENSIONS, 'completeness', 'handoff_quality'],
    stopConditions: ['material dependency paths are traversed', 'blast radius is bounded with explicit unknowns', 'recursion budget exhausted'],
    escalationConditions: ['lineage evidence is insufficient for a consequential conclusion', 'change requires an irreversible architecture decision'],
    mayProposeSkillImprovements: true,
    maySelfPromoteChanges: false,
  },
  investigator_agent: {
    agentKey: 'investigator_agent',
    mission: 'Perform evidence-driven root-cause investigation by generating, testing, eliminating, and calibrating competing hypotheses.',
    recursionMode: 'INVESTIGATIVE',
    recursionBudget: { ...READ_ONLY_BUDGET, maxIterations: 8, maxToolCalls: 25, maxHandoffs: 5 },
    requiredEvaluationDimensions: [...BASE_EVALUATION_DIMENSIONS, 'completeness', 'handoff_quality', 'outcome_quality'],
    stopConditions: ['one or more probable causes are supported with calibrated confidence and alternatives', 'additional evidence has low expected discriminating value', 'recursion budget exhausted'],
    escalationConditions: ['high-impact incident lacks sufficient evidence', 'candidate causes remain materially indistinguishable'],
    mayProposeSkillImprovements: true,
    maySelfPromoteChanges: false,
  },
  executive_agent: {
    agentKey: 'executive_agent',
    mission: 'Synthesize authoritative enterprise governance, quality, risk, certification, control, and issue evidence into material decision intelligence.',
    recursionMode: 'MATERIALITY',
    recursionBudget: { ...READ_ONLY_BUDGET, maxIterations: 4, maxToolCalls: 14, maxHandoffs: 3 },
    requiredEvaluationDimensions: [...BASE_EVALUATION_DIMENSIONS, 'outcome_quality', 'latency'],
    stopConditions: ['material drivers and uncertainties are supported by authoritative evidence', 'additional evidence would not materially change prioritization', 'recursion budget exhausted'],
    escalationConditions: ['material business impact cannot be supported by evidence', 'conflicting evidence would change executive prioritization'],
    mayProposeSkillImprovements: true,
    maySelfPromoteChanges: false,
  },
  support_agent: {
    agentKey: 'support_agent',
    mission: 'Resolve operational support questions using product evidence, diagnostics, prior cases, remediation history, and governed memory.',
    recursionMode: 'CASE_LEARNING',
    recursionBudget: READ_ONLY_BUDGET,
    requiredEvaluationDimensions: [...BASE_EVALUATION_DIMENSIONS, 'outcome_quality', 'latency', 'handoff_quality'],
    stopConditions: ['resolution is evidence-backed and actionable within authority', 'a specialist handoff is more appropriate', 'recursion budget exhausted'],
    escalationConditions: ['resolution requires privileged mutation', 'no reliable case, documentation, or runtime evidence supports a safe answer'],
    mayProposeSkillImprovements: true,
    maySelfPromoteChanges: false,
  },
}

export function getAgentExcellenceContract(agentKey: GovernedAgentKey): AgentExcellenceContract {
  return AGENT_EXCELLENCE_CONTRACTS[agentKey]
}

export function validateAgentExcellenceContracts(): void {
  const contractKeys = Object.keys(AGENT_EXCELLENCE_CONTRACTS).sort()
  const governedKeys = [...GOVERNED_AGENT_KEYS].sort()
  if (JSON.stringify(contractKeys) !== JSON.stringify(governedKeys)) {
    throw new Error('Agent excellence contracts must cover the canonical governed-agent portfolio exactly')
  }

  for (const key of GOVERNED_AGENT_KEYS) {
    const contract = AGENT_EXCELLENCE_CONTRACTS[key]
    const policy = getGovernedAgentPolicy(key)
    const budget = contract.recursionBudget

    if (contract.agentKey !== key) throw new Error(`Agent contract key mismatch for ${key}`)
    if (!contract.mission.trim()) throw new Error(`Agent contract mission is required for ${key}`)
    if (contract.maySelfPromoteChanges !== false) throw new Error(`Agents may not self-promote changes: ${key}`)
    if (contract.requiredEvaluationDimensions.length === 0) throw new Error(`Evaluation dimensions are required for ${key}`)
    if (contract.stopConditions.length === 0) throw new Error(`Stop conditions are required for ${key}`)
    if (contract.escalationConditions.length === 0) throw new Error(`Escalation conditions are required for ${key}`)
    if (!Number.isInteger(budget.maxIterations) || budget.maxIterations < 1) throw new Error(`Invalid maxIterations for ${key}`)
    if (!Number.isInteger(budget.maxToolCalls) || budget.maxToolCalls < budget.maxIterations) throw new Error(`Invalid maxToolCalls for ${key}`)
    if (!Number.isInteger(budget.maxHandoffs) || budget.maxHandoffs < 0) throw new Error(`Invalid maxHandoffs for ${key}`)
    if (!Number.isInteger(budget.maxRuntimeMs) || budget.maxRuntimeMs < 1) throw new Error(`Invalid maxRuntimeMs for ${key}`)
    if (!(budget.stopConfidence > 0 && budget.stopConfidence <= 1)) throw new Error(`Invalid stopConfidence for ${key}`)

    if (policy.mutationBoundary === 'READ_ONLY' && policy.authority !== 'READ_ONLY_ADVISORY') {
      throw new Error(`Read-only agent has incompatible authority: ${key}`)
    }
  }
}
