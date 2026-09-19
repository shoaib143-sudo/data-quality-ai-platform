import type { EvaluationScorecardMetric } from '../ai/evaluation-engine'
import {
  getAgentExcellenceContract,
  type AgentEvaluationDimension,
} from './agent-excellence-contracts'
import {
  getGovernedSkill,
  type GovernedSkillKey,
} from './governed-skill-registry'
import type { GovernedAgentKey } from './governed-agent-registry'

export type SkillEvaluationObservation = {
  dimension: AgentEvaluationDimension
  pass: boolean
  score?: number | null
  rationale?: string | null
  evidenceRefs?: readonly string[]
}

export type SkillImprovementCategory =
  | 'OUTPUT_CONTRACT'
  | 'EVIDENCE_GROUNDING'
  | 'TOOL_CONTRACT'
  | 'AUTHORITY_GUARDRAIL'
  | 'CONFIDENCE_CALIBRATION'
  | 'HANDOFF_CONTRACT'
  | 'QUALITY_EVALUATION'
  | 'RESOURCE_EFFICIENCY'

export type GovernedSkillImprovementProposal = {
  proposalVersion: '1.0'
  status: 'PROPOSED'
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  category: SkillImprovementCategory
  title: string
  proposedChange: string
  evidenceDimensions: AgentEvaluationDimension[]
  evidenceRefs: string[]
  rationale: string[]
  mayAutoApply: false
  requiresHumanReview: true
  requiredApproval: 'HUMAN_GOVERNANCE_REVIEW'
  prohibitedActions: readonly [
    'SELF_MODIFY_SKILL_REGISTRY',
    'EXPAND_TOOL_AUTHORITY',
    'CHANGE_MUTATION_BOUNDARY',
    'SELF_PROMOTE_TO_PRODUCTION',
  ]
}

const PROHIBITED_ACTIONS = [
  'SELF_MODIFY_SKILL_REGISTRY',
  'EXPAND_TOOL_AUTHORITY',
  'CHANGE_MUTATION_BOUNDARY',
  'SELF_PROMOTE_TO_PRODUCTION',
] as const

const CATEGORY_BY_DIMENSION: Record<AgentEvaluationDimension, SkillImprovementCategory> = {
  correctness: 'QUALITY_EVALUATION',
  grounding: 'EVIDENCE_GROUNDING',
  completeness: 'OUTPUT_CONTRACT',
  tool_selection: 'TOOL_CONTRACT',
  tool_correctness: 'TOOL_CONTRACT',
  authority_compliance: 'AUTHORITY_GUARDRAIL',
  evidence_sufficiency: 'EVIDENCE_GROUNDING',
  confidence_calibration: 'CONFIDENCE_CALIBRATION',
  handoff_quality: 'HANDOFF_CONTRACT',
  outcome_quality: 'QUALITY_EVALUATION',
  latency: 'RESOURCE_EFFICIENCY',
  cost: 'RESOURCE_EFFICIENCY',
}

const CHANGE_BY_CATEGORY: Record<SkillImprovementCategory, { title: string; proposedChange: string }> = {
  OUTPUT_CONTRACT: {
    title: 'Clarify governed skill output contract',
    proposedChange: 'Review required output fields, nullability, empty-result semantics, and examples. Any contract change must be reviewed and versioned before use.',
  },
  EVIDENCE_GROUNDING: {
    title: 'Strengthen governed evidence requirements',
    proposedChange: 'Review which evidence references are mandatory, how provenance is represented, and which missing-evidence states must fail closed.',
  },
  TOOL_CONTRACT: {
    title: 'Review governed skill tool contract',
    proposedChange: 'Review tool-selection guidance and required-tool declarations without adding any tool that is not already authorized by the agent policy.',
  },
  AUTHORITY_GUARDRAIL: {
    title: 'Tighten authority guardrails',
    proposedChange: 'Review the observed authority failure and strengthen denial, approval, or validation rules. Do not broaden the agent mutation boundary.',
  },
  CONFIDENCE_CALIBRATION: {
    title: 'Improve confidence calibration contract',
    proposedChange: 'Define measurable calibration evidence or use explicit non-probabilistic evidence strength until calibrated probabilities are validated.',
  },
  HANDOFF_CONTRACT: {
    title: 'Improve governed handoff contract',
    proposedChange: 'Review handoff preconditions, evidence payload, destination eligibility, and success criteria while preserving the canonical handoff allowlist.',
  },
  QUALITY_EVALUATION: {
    title: 'Expand measured skill quality evaluation',
    proposedChange: 'Add or improve labeled evaluation cases, adversarial cases, expected outcomes, and regression evidence before changing production behavior.',
  },
  RESOURCE_EFFICIENCY: {
    title: 'Improve bounded skill efficiency',
    proposedChange: 'Review measured latency, cost, tool-call count, and evidence value per step while preserving the agent recursion and resource budgets.',
  },
}

function unique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function expectedCapability(agentKey: GovernedAgentKey, skillKey: GovernedSkillKey) {
  return `agent_skill:${agentKey}:${skillKey}`
}

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}

function boundedAverageScore(value: number | null, metricName: string) {
  if (value == null) return null
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Scorecard average score must be between 0 and 1 for ${metricName}`)
  }
  return value
}

export function proposeGovernedSkillImprovements(input: {
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  observations: readonly SkillEvaluationObservation[]
}): GovernedSkillImprovementProposal[] {
  const skill = getGovernedSkill(input.skillKey)
  if (!skill.eligibleAgents.includes(input.agentKey)) {
    throw new Error(`Skill ${input.skillKey} is not authorized for agent ${input.agentKey}`)
  }

  const excellence = getAgentExcellenceContract(input.agentKey)
  if (!excellence.mayProposeSkillImprovements) return []
  if (excellence.maySelfPromoteChanges !== false) {
    throw new Error(`Agent ${input.agentKey} must not self-promote skill changes`)
  }

  const allowedDimensions = new Set(excellence.requiredEvaluationDimensions)
  const failed = input.observations.filter((observation) => {
    if (!allowedDimensions.has(observation.dimension)) {
      throw new Error(`Evaluation dimension ${observation.dimension} is outside the excellence contract for ${input.agentKey}`)
    }
    return observation.pass === false
  })

  const byCategory = new Map<SkillImprovementCategory, SkillEvaluationObservation[]>()
  for (const observation of failed) {
    const category = CATEGORY_BY_DIMENSION[observation.dimension]
    const rows = byCategory.get(category) ?? []
    rows.push(observation)
    byCategory.set(category, rows)
  }

  return [...byCategory.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, observations]) => {
      const change = CHANGE_BY_CATEGORY[category]
      return {
        proposalVersion: '1.0' as const,
        status: 'PROPOSED' as const,
        agentKey: input.agentKey,
        skillKey: input.skillKey,
        category,
        title: change.title,
        proposedChange: change.proposedChange,
        evidenceDimensions: [...new Set(observations.map((observation) => observation.dimension))],
        evidenceRefs: unique(observations.flatMap((observation) => observation.evidenceRefs ?? [])),
        rationale: unique(observations.map((observation) => observation.rationale ?? '').filter(Boolean)),
        mayAutoApply: false as const,
        requiresHumanReview: true as const,
        requiredApproval: 'HUMAN_GOVERNANCE_REVIEW' as const,
        prohibitedActions: PROHIBITED_ACTIONS,
      }
    })
}

export function proposeGovernedSkillImprovementsFromScorecard(input: {
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  metrics: readonly EvaluationScorecardMetric[]
}): GovernedSkillImprovementProposal[] {
  const capability = expectedCapability(input.agentKey, input.skillKey)
  const excellence = getAgentExcellenceContract(input.agentKey)
  const allowedDimensions = new Set<AgentEvaluationDimension>(excellence.requiredEvaluationDimensions)
  const observations: SkillEvaluationObservation[] = []

  const skill = getGovernedSkill(input.skillKey)
  if (!skill.eligibleAgents.includes(input.agentKey)) {
    throw new Error(`Skill ${input.skillKey} is not authorized for agent ${input.agentKey}`)
  }

  for (const metric of input.metrics) {
    if (metric.evaluationType !== 'AGENT_SKILL') {
      throw new Error(`Scorecard evaluation type ${metric.evaluationType} is not AGENT_SKILL`)
    }
    if (metric.capability !== capability) {
      throw new Error(`Scorecard capability ${metric.capability ?? 'null'} does not match governed capability ${capability}`)
    }
    if (!allowedDimensions.has(metric.metricName as AgentEvaluationDimension)) {
      throw new Error(`Scorecard metric ${metric.metricName} is outside the excellence contract for ${input.agentKey}`)
    }

    nonNegativeInteger(metric.sampleCount, 'sampleCount')
    nonNegativeInteger(metric.scoredCount, 'scoredCount')
    nonNegativeInteger(metric.passCount, 'passCount')
    nonNegativeInteger(metric.failCount, 'failCount')
    if (metric.scoredCount > metric.sampleCount) {
      throw new Error(`Scorecard scored count exceeds sample count for ${metric.metricName}`)
    }
    if (metric.passCount + metric.failCount > metric.scoredCount) {
      throw new Error(`Scorecard pass/fail counts exceed scored count for ${metric.metricName}`)
    }
    const averageScore = boundedAverageScore(metric.averageScore, metric.metricName)
    if (metric.scoredCount === 0 && averageScore != null) {
      throw new Error(`Scorecard average score requires scored samples for ${metric.metricName}`)
    }
    if (metric.failCount === 0) continue

    observations.push({
      dimension: metric.metricName as AgentEvaluationDimension,
      pass: false,
      score: averageScore,
      evidenceRefs: metric.evidenceResultIds,
      rationale: `${metric.failCount} of ${metric.scoredCount} scored ${metric.metricName} evaluations failed${averageScore == null ? '' : `; average score ${averageScore.toFixed(3)}`}.`,
    })
  }

  return proposeGovernedSkillImprovements({
    agentKey: input.agentKey,
    skillKey: input.skillKey,
    observations,
  })
}
