import type { EvaluationEngine, EvaluationReceipt } from '../ai/evaluation-engine'
import {
  getAgentExcellenceContract,
  type AgentEvaluationDimension,
} from './agent-excellence-contracts'
import {
  getGovernedSkill,
  type GovernedSkillKey,
} from './governed-skill-registry'
import type { GovernedAgentKey } from './governed-agent-registry'

export type AgentSkillEvaluationInput = {
  projectId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  dimension: AgentEvaluationDimension
  score?: number | null
  pass?: boolean | null
  agentRunId?: string | null
  correlationId?: string | null
  evaluatorType: string
  evaluatorVersion?: string | null
  evidenceRefs?: string[]
  observedAt?: string
  metadata?: Record<string, unknown>
}

export function assertAgentSkillEvaluationAllowed(input: Pick<AgentSkillEvaluationInput, 'agentKey' | 'skillKey' | 'dimension'>): void {
  const skill = getGovernedSkill(input.skillKey)
  if (!skill.eligibleAgents.includes(input.agentKey)) {
    throw new Error(`Skill ${input.skillKey} is not authorized for agent ${input.agentKey}`)
  }

  const contract = getAgentExcellenceContract(input.agentKey)
  if (!contract.requiredEvaluationDimensions.includes(input.dimension)) {
    throw new Error(`Evaluation dimension ${input.dimension} is not required for agent ${input.agentKey}`)
  }
}

export async function recordAgentSkillEvaluation(
  engine: EvaluationEngine,
  input: AgentSkillEvaluationInput,
): Promise<EvaluationReceipt> {
  assertAgentSkillEvaluationAllowed(input)

  return engine.record({
    projectId: input.projectId,
    evaluationType: 'AGENT_SKILL',
    capability: `agent_skill:${input.skillKey}`,
    metricName: input.dimension,
    score: input.score,
    pass: input.pass,
    evaluatorType: input.evaluatorType,
    evaluatorVersion: input.evaluatorVersion,
    agentRunId: input.agentRunId,
    correlationId: input.correlationId,
    evidenceRefs: input.evidenceRefs,
    observedAt: input.observedAt,
    dimensions: {
      agent_key: input.agentKey,
      skill_key: input.skillKey,
      evaluation_dimension: input.dimension,
    },
    metadata: input.metadata,
  })
}
