import type { GovernanceReadAgentKey } from '@/lib/agents/governance-read-agent'
import { recordAgentSkillOutcomeEvaluation } from '@/lib/agents/agent-skill-evaluation'
import type { GovernedSkillKey } from '@/lib/agents/governed-skill-registry'
import { createGovernanceEvaluationEngine } from '@/lib/ai/governance-evaluation-engine'

const PRIMARY_SPECIALIST_SKILL: Record<GovernanceReadAgentKey, GovernedSkillKey> = {
  steward_agent: 'stewardship_gap_analysis',
  governance_analyst_agent: 'governance_evidence_synthesis',
  architect_agent: 'lineage_impact_analysis',
  investigator_agent: 'incident_root_cause_analysis',
  executive_agent: 'executive_materiality_analysis',
  support_agent: 'support_case_investigation',
}

function list(value: unknown) {
  return Array.isArray(value) ? value : []
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function evidenceRefs(nativeToolInvocationId: string) {
  const id = nativeToolInvocationId.trim()
  if (!id) throw new Error('nativeToolInvocationId is required for specialist skill evaluation')
  return [`native_tool_invocation:${id}`]
}

function skillOutput(agentKey: GovernanceReadAgentKey, output: Record<string, unknown>, refs: string[]) {
  const observations = list(output.observations)
  const recommendations = list(output.recommendations)
  const hypotheses = list(output.hypotheses)
  const priorities = list(output.priorities)
  const limitations = list(output.limitations)
  const knowledge = object(output.knowledge)
  const graph = object(knowledge.graph)
  const investigation = object(output.investigation)
  const confidence = output.confidence

  switch (agentKey) {
    case 'steward_agent':
      return {
        gaps: observations,
        evidence_refs: refs,
        recommendations,
        approval_requirements: [output.approval_status ?? 'UNKNOWN'],
        confidence,
      }
    case 'governance_analyst_agent':
      return {
        answer: { observations, recommendations },
        evidence_refs: refs,
        relationships: list(graph.edges),
        confidence,
        uncertainties: limitations,
      }
    case 'architect_agent':
      return {
        affected_assets: observations,
        dependency_paths: list(graph.edges),
        unknowns: limitations,
        evidence_refs: refs,
        confidence,
      }
    case 'investigator_agent':
      return {
        hypotheses,
        probable_causes: list(investigation.probableCauses ?? investigation.probable_causes),
        alternative_causes: list(investigation.alternativeCauses ?? investigation.alternative_causes),
        confidence,
        evidence_refs: refs,
        recommended_follow_up: recommendations,
      }
    case 'executive_agent':
      return {
        priorities,
        material_drivers: observations,
        evidence_refs: refs,
        uncertainties: limitations,
        confidence,
      }
    case 'support_agent':
      return {
        diagnosis: observations,
        safe_next_actions: recommendations,
        evidence_refs: refs,
        handoff_recommendation: null,
        confidence,
      }
  }
}

export async function evaluateGovernanceSpecialistSkill(input: {
  projectId: string
  agentKey: GovernanceReadAgentKey
  agentRunId: string
  nativeToolInvocationId: string
  output: Record<string, unknown>
  observedAt?: string
}) {
  const refs = evidenceRefs(input.nativeToolInvocationId)
  const skillKey = PRIMARY_SPECIALIST_SKILL[input.agentKey]
  const engine = createGovernanceEvaluationEngine()

  const record = await recordAgentSkillOutcomeEvaluation(engine, {
    projectId: input.projectId,
    agentKey: input.agentKey,
    skillKey,
    agentRunId: input.agentRunId,
    output: skillOutput(input.agentKey, input.output, refs),
    evidenceRefs: refs,
    invokedTools: ['governance_specialist_investigate'],
    authorityViolations: [],
    evaluatorType: 'DETERMINISTIC_SPECIALIST_RUNTIME',
    observedAt: input.observedAt,
    metadata: {
      runtime: 'governance-specialist-agent',
      runtime_tool: 'governance_specialist_investigate',
      learning_candidate_authority: false,
      production_mutation_authority: false,
    },
  })

  return {
    agentKey: input.agentKey,
    skillKey,
    evaluation: record.evaluation,
    resultIds: record.receipts.map((receipt) => receipt.resultId),
  }
}

export function governedSpecialistPrimarySkill(agentKey: GovernanceReadAgentKey): GovernedSkillKey {
  return PRIMARY_SPECIALIST_SKILL[agentKey]
}
