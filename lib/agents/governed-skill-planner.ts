import {
  getGovernedAgentPolicy,
  type GovernedAgentKey,
} from './governed-agent-registry'
import {
  getGovernedSkillsForAgent,
  type GovernedSkillDefinition,
  type GovernedSkillKey,
} from './governed-skill-registry'

export type GovernedSkillPlanInput = {
  agentKey: GovernedAgentKey
  objective: string
  availableEvidenceDomains?: readonly string[]
  allowMutatingSkills?: boolean
  maxSkills?: number
}

export type GovernedSkillPlanItem = {
  skillKey: GovernedSkillKey
  score: number
  matchedSignals: string[]
  requiredTools: readonly string[]
  evidenceRequired: boolean
  evidenceCoverage: 'NOT_DECLARED' | 'PARTIAL' | 'PRESENT'
  mayMutate: boolean
  humanApprovalRequired: boolean
}

export type GovernedSkillPlan = {
  plannerVersion: '1.0'
  agentKey: GovernedAgentKey
  objective: string
  selected: GovernedSkillPlanItem[]
  rejected: Array<{
    skillKey: GovernedSkillKey
    reason: 'MUTATION_NOT_REQUESTED' | 'MUTATION_NOT_AUTHORIZED'
  }>
  unresolvedReason: null | 'EMPTY_OBJECTIVE' | 'NO_ELIGIBLE_SKILL_MATCH'
}

const SKILL_SIGNALS: Record<GovernedSkillKey, readonly string[]> = {
  profile_evidence_analysis: ['profile', 'profiling', 'schema', 'metric', 'distribution', 'column'],
  profile_gap_detection: ['gap', 'coverage', 'missing metric', 'deeper profile', 'insufficient evidence', 'profile'],
  quality_rule_analysis: ['quality', 'rule', 'control', 'violation', 'failure', 'threshold'],
  quality_remediation_proposal: ['remediate', 'remediation', 'fix', 'corrective action', 'resolve quality'],
  stewardship_gap_analysis: ['steward', 'owner', 'ownership', 'glossary', 'classification', 'certification', 'cde'],
  governance_evidence_synthesis: ['governance', 'policy', 'control', 'regulation', 'risk', 'contract'],
  lineage_impact_analysis: ['lineage', 'impact', 'dependency', 'downstream', 'upstream', 'blast radius', 'transformation'],
  incident_root_cause_analysis: ['incident', 'root cause', 'rca', 'anomaly', 'failure', 'diagnose', 'hypothesis'],
  executive_materiality_analysis: ['executive', 'materiality', 'priority', 'portfolio', 'scorecard', 'business impact'],
  support_case_investigation: ['support', 'case', 'troubleshoot', 'operational', 'diagnostic', 'run failure'],
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function matchedSignals(objective: string, signals: readonly string[]) {
  return signals.filter((signal) => objective.includes(signal))
}

function evidenceCoverage(skill: GovernedSkillDefinition, availableEvidenceDomains: ReadonlySet<string>) {
  if (!skill.evidenceRequired) return 'NOT_DECLARED' as const
  if (availableEvidenceDomains.size === 0) return 'NOT_DECLARED' as const

  const tokens = new Set(
    [skill.purpose, ...skill.inputContract, ...skill.outputContract]
      .flatMap((value) => normalize(value).split(/[^a-z0-9_]+/g))
      .filter(Boolean),
  )
  const overlap = [...availableEvidenceDomains].filter((domain) => {
    const normalized = normalize(domain)
    return tokens.has(normalized) || [...tokens].some((token) => token.includes(normalized) || normalized.includes(token))
  })
  return overlap.length > 0 ? 'PRESENT' as const : 'PARTIAL' as const
}

function assertPlannedSkillAuthority(agentKey: GovernedAgentKey, skill: GovernedSkillDefinition) {
  const policy = getGovernedAgentPolicy(agentKey)
  const requiredTools = skill.requiredToolsByAgent[agentKey] ?? []
  for (const toolKey of requiredTools) {
    if (!policy.toolAllowlist.includes(toolKey)) {
      throw new Error(`Governed skill planner detected unauthorized tool ${toolKey} for ${agentKey}/${skill.key}`)
    }
  }
  if (skill.mayMutate && policy.mutationBoundary === 'READ_ONLY') {
    throw new Error(`Governed skill planner cannot assign mutating skill ${skill.key} to read-only agent ${agentKey}`)
  }
  return requiredTools
}

function positiveInteger(value: number, label: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

export function planGovernedSkills(input: GovernedSkillPlanInput): GovernedSkillPlan {
  const objective = normalize(input.objective)
  if (!objective) {
    return {
      plannerVersion: '1.0',
      agentKey: input.agentKey,
      objective,
      selected: [],
      rejected: [],
      unresolvedReason: 'EMPTY_OBJECTIVE',
    }
  }

  const policy = getGovernedAgentPolicy(input.agentKey)
  const availableEvidenceDomains = new Set((input.availableEvidenceDomains ?? []).map(normalize).filter(Boolean))
  const rejected: GovernedSkillPlan['rejected'] = []
  const candidates: GovernedSkillPlanItem[] = []

  for (const skill of getGovernedSkillsForAgent(input.agentKey)) {
    const matched = matchedSignals(objective, SKILL_SIGNALS[skill.key])
    if (matched.length === 0) continue

    if (skill.mayMutate && !input.allowMutatingSkills) {
      rejected.push({ skillKey: skill.key, reason: 'MUTATION_NOT_REQUESTED' })
      continue
    }
    if (skill.mayMutate && policy.mutationBoundary === 'READ_ONLY') {
      rejected.push({ skillKey: skill.key, reason: 'MUTATION_NOT_AUTHORIZED' })
      continue
    }

    const requiredTools = assertPlannedSkillAuthority(input.agentKey, skill)
    const coverage = evidenceCoverage(skill, availableEvidenceDomains)
    const score = matched.length * 10
      + (coverage === 'PRESENT' ? 3 : coverage === 'PARTIAL' ? 1 : 0)
      + (skill.mayMutate ? 0 : 1)

    candidates.push({
      skillKey: skill.key,
      score,
      matchedSignals: matched,
      requiredTools,
      evidenceRequired: skill.evidenceRequired,
      evidenceCoverage: coverage,
      mayMutate: skill.mayMutate,
      humanApprovalRequired: skill.mayMutate && policy.requiresHumanApprovalForGovernanceMutation,
    })
  }

  candidates.sort((a, b) => b.score - a.score || a.skillKey.localeCompare(b.skillKey))
  const requestedMax = input.maxSkills == null ? 3 : positiveInteger(input.maxSkills, 'maxSkills')
  const maxSkills = Math.min(5, requestedMax)
  const selected = candidates.slice(0, maxSkills)

  return {
    plannerVersion: '1.0',
    agentKey: input.agentKey,
    objective,
    selected,
    rejected,
    unresolvedReason: selected.length ? null : 'NO_ELIGIBLE_SKILL_MATCH',
  }
}
