import type {
  EvaluationEngine,
  EvaluationReceipt,
  EvaluationScorecardMetric,
} from '../ai/evaluation-engine'
import {
  getAgentExcellenceContract,
  type AgentEvaluationDimension,
} from './agent-excellence-contracts'
import {
  evaluateAgentSkillOutcome,
  type AgentSkillOutcomeInput,
  type AgentSkillOutcomeEvaluation,
} from './agent-skill-outcome-evaluator'
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

export type AgentSkillOutcomeEvaluationRecordInput = AgentSkillOutcomeInput & {
  projectId: string
  agentRunId?: string | null
  correlationId?: string | null
  evaluatorType?: string
  observedAt?: string
  metadata?: Record<string, unknown>
}

export type AgentSkillOutcomeEvaluationRecord = {
  evaluation: AgentSkillOutcomeEvaluation
  receipts: EvaluationReceipt[]
}

export type AgentSkillScorecard = {
  projectId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  capability: string
  metrics: EvaluationScorecardMetric[]
}

function assertAgentSkillAuthorized(agentKey: GovernedAgentKey, skillKey: GovernedSkillKey): void {
  const skill = getGovernedSkill(skillKey)
  if (!skill.eligibleAgents.includes(agentKey)) {
    throw new Error(`Skill ${skillKey} is not authorized for agent ${agentKey}`)
  }
}

export function agentSkillCapabilityKey(agentKey: GovernedAgentKey, skillKey: GovernedSkillKey): string {
  assertAgentSkillAuthorized(agentKey, skillKey)
  return `agent_skill:${agentKey}:${skillKey}`
}

export function assertAgentSkillEvaluationAllowed(input: Pick<AgentSkillEvaluationInput, 'agentKey' | 'skillKey' | 'dimension'>): void {
  assertAgentSkillAuthorized(input.agentKey, input.skillKey)

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
    capability: agentSkillCapabilityKey(input.agentKey, input.skillKey),
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

export async function readAgentSkillScorecard(
  engine: EvaluationEngine,
  input: { projectId: string; agentKey: GovernedAgentKey; skillKey: GovernedSkillKey },
): Promise<AgentSkillScorecard> {
  const capability = agentSkillCapabilityKey(input.agentKey, input.skillKey)
  const contract = getAgentExcellenceContract(input.agentKey)
  const requiredDimensions = new Set(contract.requiredEvaluationDimensions)
  const metrics = await engine.scorecard({
    projectId: input.projectId,
    evaluationType: 'AGENT_SKILL',
    capability,
  })

  return {
    projectId: input.projectId,
    agentKey: input.agentKey,
    skillKey: input.skillKey,
    capability,
    metrics: metrics
      .filter((metric) => requiredDimensions.has(metric.metricName as AgentEvaluationDimension))
      .sort((left, right) => left.metricName.localeCompare(right.metricName)),
  }
}

export async function recordAgentSkillOutcomeEvaluation(
  engine: EvaluationEngine,
  input: AgentSkillOutcomeEvaluationRecordInput,
): Promise<AgentSkillOutcomeEvaluationRecord> {
  const evaluation = evaluateAgentSkillOutcome(input)
  const receipts: EvaluationReceipt[] = []

  for (const metric of evaluation.metrics) {
    receipts.push(await recordAgentSkillEvaluation(engine, {
      projectId: input.projectId,
      agentKey: input.agentKey,
      skillKey: input.skillKey,
      dimension: metric.dimension,
      score: metric.score,
      pass: metric.pass,
      agentRunId: input.agentRunId,
      correlationId: input.correlationId,
      evaluatorType: input.evaluatorType ?? 'DETERMINISTIC_SKILL_OUTCOME',
      evaluatorVersion: evaluation.evaluatorVersion,
      evidenceRefs: [...(input.evidenceRefs ?? [])],
      observedAt: input.observedAt,
      metadata: {
        ...input.metadata,
        structural_pass: evaluation.structuralPass,
        overall_pass: evaluation.overallPass,
        missing_output_fields: evaluation.missingOutputFields,
        unauthorized_tools: evaluation.unauthorizedTools,
        metric_evidence: metric.evidence,
        rationale: metric.rationale,
      },
    }))
  }

  return { evaluation, receipts }
}
