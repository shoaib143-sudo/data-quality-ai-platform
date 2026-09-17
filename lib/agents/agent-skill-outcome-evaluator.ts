import {
  getAgentExcellenceContract,
  type AgentEvaluationDimension,
} from './agent-excellence-contracts'
import {
  getGovernedSkill,
  type GovernedSkillKey,
} from './governed-skill-registry'
import {
  getGovernedAgentPolicy,
  type GovernedAgentKey,
} from './governed-agent-registry'

export type AgentSkillOutcomeInput = {
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  output: Record<string, unknown>
  evidenceRefs?: readonly string[]
  invokedTools?: readonly string[]
  authorityViolations?: readonly string[]
}

export type AgentSkillOutcomeMetric = {
  dimension: AgentEvaluationDimension
  score: number | null
  pass: boolean
  evidence: string[]
  rationale: string
}

export type AgentSkillOutcomeEvaluation = {
  evaluatorVersion: '1.0'
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  metrics: AgentSkillOutcomeMetric[]
  missingOutputFields: string[]
  unauthorizedTools: string[]
  overallPass: boolean
}

function present(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return true
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))]
}

export function evaluateAgentSkillOutcome(input: AgentSkillOutcomeInput): AgentSkillOutcomeEvaluation {
  const skill = getGovernedSkill(input.skillKey)
  if (!skill.eligibleAgents.includes(input.agentKey)) {
    throw new Error(`Skill ${input.skillKey} is not authorized for agent ${input.agentKey}`)
  }

  const contract = getAgentExcellenceContract(input.agentKey)
  const policy = getGovernedAgentPolicy(input.agentKey)
  const requiredTools = skill.requiredToolsByAgent[input.agentKey] ?? []
  const invokedTools = unique(input.invokedTools ?? [])
  const evidenceRefs = unique(input.evidenceRefs ?? [])
  const authorityViolations = unique(input.authorityViolations ?? [])
  const unauthorizedTools = invokedTools.filter((tool) => !policy.toolAllowlist.includes(tool))
  const missingOutputFields = skill.outputContract.filter((field) => !Object.prototype.hasOwnProperty.call(input.output, field))
  const missingRequiredTools = requiredTools.filter((tool) => !invokedTools.includes(tool))

  const metrics: AgentSkillOutcomeMetric[] = []
  const required = new Set<AgentEvaluationDimension>(contract.requiredEvaluationDimensions)

  if (required.has('completeness')) {
    const denominator = Math.max(1, skill.outputContract.length)
    const score = Math.max(0, (denominator - missingOutputFields.length) / denominator)
    metrics.push({
      dimension: 'completeness',
      score,
      pass: missingOutputFields.length === 0,
      evidence: missingOutputFields,
      rationale: missingOutputFields.length
        ? `Missing required skill output fields: ${missingOutputFields.join(', ')}`
        : 'All required skill output fields are declared, including intentionally empty or null fields.',
    })
  }

  if (required.has('evidence_sufficiency')) {
    const pass = !skill.evidenceRequired || evidenceRefs.length > 0
    metrics.push({
      dimension: 'evidence_sufficiency',
      score: pass ? 1 : 0,
      pass,
      evidence: evidenceRefs,
      rationale: pass
        ? 'The skill output has evidence references when required.'
        : 'The governed skill requires evidence, but no evidence references were supplied.',
    })
  }

  if (required.has('tool_correctness')) {
    const pass = unauthorizedTools.length === 0 && missingRequiredTools.length === 0
    metrics.push({
      dimension: 'tool_correctness',
      score: pass ? 1 : 0,
      pass,
      evidence: unique([...unauthorizedTools, ...missingRequiredTools]),
      rationale: pass
        ? 'Invoked tools remain inside the agent allowlist and include the skill required tools.'
        : `Tool contract mismatch. Unauthorized: ${unauthorizedTools.join(', ') || 'none'}. Missing required: ${missingRequiredTools.join(', ') || 'none'}.`,
    })
  }

  if (required.has('authority_compliance')) {
    const mutationViolation = skill.mayMutate && policy.mutationBoundary === 'READ_ONLY'
    const pass = authorityViolations.length === 0 && unauthorizedTools.length === 0 && !mutationViolation
    metrics.push({
      dimension: 'authority_compliance',
      score: pass ? 1 : 0,
      pass,
      evidence: unique([...authorityViolations, ...unauthorizedTools]),
      rationale: pass
        ? 'No authority violation or unauthorized tool use was observed.'
        : 'The skill outcome contains an authority-policy violation.',
    })
  }

  if (required.has('grounding')) {
    const pass = !skill.evidenceRequired || evidenceRefs.length > 0
    metrics.push({
      dimension: 'grounding',
      score: pass ? 1 : 0,
      pass,
      evidence: evidenceRefs,
      rationale: pass
        ? 'Grounding evidence is present for the governed skill outcome.'
        : 'Grounding cannot be demonstrated without evidence references.',
    })
  }

  if (required.has('confidence_calibration')) {
    const value = input.output.confidence
    const calibrationMode = input.output.confidenceBasis ?? input.output.confidence_basis ?? input.output.evidenceStrength ?? input.output.evidence_strength
    const numericConfidence = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    const explicitNonProbabilistic = (value === null || value === undefined) && present(calibrationMode)
    const pass = numericConfidence || explicitNonProbabilistic
    metrics.push({
      dimension: 'confidence_calibration',
      score: pass ? 1 : 0,
      pass,
      evidence: [],
      rationale: numericConfidence
        ? 'Confidence is represented as a bounded numeric value. Calibration quality still requires measured external evaluation.'
        : explicitNonProbabilistic
          ? 'The output explicitly avoids an uncalibrated probability and provides a non-probabilistic confidence basis.'
          : 'Confidence is neither a bounded numeric value nor an explicit non-probabilistic evidence-strength statement.',
    })
  }

  if (required.has('correctness')) {
    metrics.push({
      dimension: 'correctness',
      score: null,
      pass: true,
      evidence: evidenceRefs,
      rationale: 'Correctness requires task-specific or labeled evaluation and is intentionally not fabricated by the structural evaluator.',
    })
  }

  if (required.has('outcome_quality')) {
    metrics.push({
      dimension: 'outcome_quality',
      score: null,
      pass: missingOutputFields.length === 0,
      evidence: evidenceRefs,
      rationale: missingOutputFields.length === 0
        ? 'The structural output contract is complete; semantic outcome quality remains subject to downstream evaluation.'
        : 'Outcome quality cannot pass structurally while required output fields are missing.',
    })
  }

  if (required.has('handoff_quality')) {
    metrics.push({
      dimension: 'handoff_quality',
      score: null,
      pass: true,
      evidence: [],
      rationale: 'Handoff quality is not inferable from a single skill outcome and remains unscored unless handoff evidence is evaluated separately.',
    })
  }

  if (required.has('tool_selection')) {
    const pass = unauthorizedTools.length === 0
    metrics.push({
      dimension: 'tool_selection',
      score: pass ? 1 : 0,
      pass,
      evidence: unauthorizedTools,
      rationale: pass ? 'Selected tools are authorized.' : 'At least one selected tool is not authorized for the agent.',
    })
  }

  if (required.has('latency')) {
    metrics.push({ dimension: 'latency', score: null, pass: true, evidence: [], rationale: 'Latency requires runtime telemetry and is not fabricated from output structure.' })
  }
  if (required.has('cost')) {
    metrics.push({ dimension: 'cost', score: null, pass: true, evidence: [], rationale: 'Cost requires runtime telemetry and is not fabricated from output structure.' })
  }

  return {
    evaluatorVersion: '1.0',
    agentKey: input.agentKey,
    skillKey: input.skillKey,
    metrics,
    missingOutputFields,
    unauthorizedTools,
    overallPass: metrics.every((metric) => metric.pass),
  }
}
