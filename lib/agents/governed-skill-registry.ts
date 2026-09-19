import {
  GOVERNED_AGENT_KEYS,
  getGovernedAgentPolicy,
  type GovernedAgentKey,
} from './governed-agent-registry'

export type GovernedSkillKey =
  | 'profile_evidence_analysis'
  | 'profile_gap_detection'
  | 'quality_rule_analysis'
  | 'quality_remediation_proposal'
  | 'stewardship_gap_analysis'
  | 'governance_evidence_synthesis'
  | 'lineage_impact_analysis'
  | 'incident_root_cause_analysis'
  | 'executive_materiality_analysis'
  | 'support_case_investigation'

export type GovernedSkillDefinition = {
  key: GovernedSkillKey
  name: string
  purpose: string
  eligibleAgents: readonly GovernedAgentKey[]
  requiredToolsByAgent: Partial<Record<GovernedAgentKey, readonly string[]>>
  inputContract: readonly string[]
  outputContract: readonly string[]
  evidenceRequired: boolean
  mayMutate: boolean
}

export const GOVERNED_SKILLS: Record<GovernedSkillKey, GovernedSkillDefinition> = {
  profile_evidence_analysis: {
    key: 'profile_evidence_analysis',
    name: 'Profile Evidence Analysis',
    purpose: 'Inspect deterministic profiling evidence and explain observed schema, metric, finding, and distribution characteristics.',
    eligibleAgents: ['profiling_agent'],
    requiredToolsByAgent: {
      profiling_agent: ['profiling.source.read', 'profiling.schema.discover', 'profiling.metrics.execute'],
    },
    inputContract: ['project_id', 'dataset_version_id', 'objective'],
    outputContract: ['observations', 'evidence_refs', 'confidence', 'limitations'],
    evidenceRequired: true,
    mayMutate: false,
  },
  profile_gap_detection: {
    key: 'profile_gap_detection',
    name: 'Profile Gap Detection',
    purpose: 'Determine whether existing profiling evidence is sufficient for the requested analysis and identify justified deeper metrics.',
    eligibleAgents: ['profiling_agent', 'data_quality_agent', 'investigator_agent'],
    requiredToolsByAgent: {
      profiling_agent: ['profiling.metrics.execute'],
      data_quality_agent: ['quality.rules.read'],
      investigator_agent: ['governance_specialist_investigate'],
    },
    inputContract: ['project_id', 'objective', 'available_evidence'],
    outputContract: ['coverage_gaps', 'recommended_evidence', 'expected_information_gain'],
    evidenceRequired: true,
    mayMutate: false,
  },
  quality_rule_analysis: {
    key: 'quality_rule_analysis',
    name: 'Quality Rule Analysis',
    purpose: 'Assess quality rules, executions, findings, incidents, and historical outcomes without changing governed thresholds.',
    eligibleAgents: ['data_quality_agent', 'governance_analyst_agent', 'investigator_agent'],
    requiredToolsByAgent: {
      data_quality_agent: ['quality.rules.read', 'quality.incident.read'],
      governance_analyst_agent: ['governance_specialist_investigate'],
      investigator_agent: ['governance_specialist_investigate'],
    },
    inputContract: ['project_id', 'objective', 'quality_evidence'],
    outputContract: ['violations', 'severity_assessment', 'evidence_refs', 'confidence'],
    evidenceRequired: true,
    mayMutate: false,
  },
  quality_remediation_proposal: {
    key: 'quality_remediation_proposal',
    name: 'Quality Remediation Proposal',
    purpose: 'Propose evidence-backed remediation through the existing governed workflow without bypassing approval or mutation policy.',
    eligibleAgents: ['data_quality_agent'],
    requiredToolsByAgent: {
      data_quality_agent: ['quality.remediation.propose'],
    },
    inputContract: ['project_id', 'quality_condition', 'evidence_refs'],
    outputContract: ['proposal', 'risk', 'reversibility', 'approval_requirement'],
    evidenceRequired: true,
    mayMutate: true,
  },
  stewardship_gap_analysis: {
    key: 'stewardship_gap_analysis',
    name: 'Stewardship Gap Analysis',
    purpose: 'Identify evidence-backed gaps in ownership, glossary, CDE, classification, stewardship, certification, and governance coverage.',
    eligibleAgents: ['steward_agent', 'governance_analyst_agent'],
    requiredToolsByAgent: {
      steward_agent: ['governance_specialist_investigate'],
      governance_analyst_agent: ['governance_specialist_investigate'],
    },
    inputContract: ['project_id', 'objective'],
    outputContract: ['gaps', 'evidence_refs', 'recommendations', 'approval_requirements'],
    evidenceRequired: true,
    mayMutate: false,
  },
  governance_evidence_synthesis: {
    key: 'governance_evidence_synthesis',
    name: 'Governance Evidence Synthesis',
    purpose: 'Synthesize project-scoped policy, control, risk, contract, quality, and relationship evidence into an auditable answer.',
    eligibleAgents: ['governance_analyst_agent', 'executive_agent', 'steward_agent'],
    requiredToolsByAgent: {
      governance_analyst_agent: ['governance_specialist_investigate'],
      executive_agent: ['governance_specialist_investigate'],
      steward_agent: ['governance_specialist_investigate'],
    },
    inputContract: ['project_id', 'question'],
    outputContract: ['answer', 'evidence_refs', 'relationships', 'confidence', 'uncertainties'],
    evidenceRequired: true,
    mayMutate: false,
  },
  lineage_impact_analysis: {
    key: 'lineage_impact_analysis',
    name: 'Lineage Impact Analysis',
    purpose: 'Traverse authorized lineage and dependency evidence to bound downstream impact and expose missing lineage explicitly.',
    eligibleAgents: ['architect_agent', 'governance_analyst_agent', 'investigator_agent', 'support_agent'],
    requiredToolsByAgent: {
      architect_agent: ['governance_specialist_investigate'],
      governance_analyst_agent: ['governance_specialist_investigate'],
      investigator_agent: ['governance_specialist_investigate'],
      support_agent: ['governance_specialist_investigate'],
    },
    inputContract: ['project_id', 'asset_ref', 'change_or_incident'],
    outputContract: ['affected_assets', 'dependency_paths', 'unknowns', 'evidence_refs'],
    evidenceRequired: true,
    mayMutate: false,
  },
  incident_root_cause_analysis: {
    key: 'incident_root_cause_analysis',
    name: 'Incident Root Cause Analysis',
    purpose: 'Generate and test competing incident hypotheses using quality history, profiling history, lineage, issues, and remediation evidence.',
    eligibleAgents: ['investigator_agent'],
    requiredToolsByAgent: {
      investigator_agent: ['governance_specialist_investigate'],
    },
    inputContract: ['project_id', 'incident_ref', 'objective'],
    outputContract: ['hypotheses', 'probable_causes', 'alternative_causes', 'confidence', 'evidence_refs', 'recommended_follow_up'],
    evidenceRequired: true,
    mayMutate: false,
  },
  executive_materiality_analysis: {
    key: 'executive_materiality_analysis',
    name: 'Executive Materiality Analysis',
    purpose: 'Prioritize authoritative governance and quality signals by materiality without inventing unsupported business impact.',
    eligibleAgents: ['executive_agent'],
    requiredToolsByAgent: {
      executive_agent: ['governance_specialist_investigate'],
    },
    inputContract: ['project_id', 'reporting_objective'],
    outputContract: ['priorities', 'material_drivers', 'evidence_refs', 'uncertainties'],
    evidenceRequired: true,
    mayMutate: false,
  },
  support_case_investigation: {
    key: 'support_case_investigation',
    name: 'Support Case Investigation',
    purpose: 'Investigate product and operational support cases using governed history, incidents, issues, lineage, and remediation evidence.',
    eligibleAgents: ['support_agent'],
    requiredToolsByAgent: {
      support_agent: ['governance_specialist_investigate'],
    },
    inputContract: ['project_id', 'case_objective'],
    outputContract: ['diagnosis', 'safe_next_actions', 'evidence_refs', 'handoff_recommendation'],
    evidenceRequired: true,
    mayMutate: false,
  },
}

export function getGovernedSkillsForAgent(agentKey: GovernedAgentKey): GovernedSkillDefinition[] {
  return Object.values(GOVERNED_SKILLS).filter((skill) => skill.eligibleAgents.includes(agentKey))
}

export function getGovernedSkill(skillKey: GovernedSkillKey): GovernedSkillDefinition {
  return GOVERNED_SKILLS[skillKey]
}

export function validateGovernedSkillRegistry(): void {
  for (const skill of Object.values(GOVERNED_SKILLS)) {
    if (!skill.purpose.trim()) throw new Error(`Skill purpose is required: ${skill.key}`)
    if (skill.eligibleAgents.length === 0) throw new Error(`Skill must have at least one eligible agent: ${skill.key}`)
    if (skill.inputContract.length === 0 || skill.outputContract.length === 0) {
      throw new Error(`Skill must define input and output contracts: ${skill.key}`)
    }

    for (const agentKey of skill.eligibleAgents) {
      const policy = getGovernedAgentPolicy(agentKey)
      const requiredTools = skill.requiredToolsByAgent[agentKey]
      if (!requiredTools || requiredTools.length === 0) {
        throw new Error(`Skill ${skill.key} must declare required tools for ${agentKey}`)
      }
      for (const toolKey of requiredTools) {
        if (!policy.toolAllowlist.includes(toolKey)) {
          throw new Error(`Skill ${skill.key} requires unauthorized tool ${toolKey} for ${agentKey}`)
        }
      }
      if (skill.mayMutate && policy.mutationBoundary === 'READ_ONLY') {
        throw new Error(`Mutating skill ${skill.key} cannot be assigned to read-only agent ${agentKey}`)
      }
    }
  }

  for (const agentKey of GOVERNED_AGENT_KEYS) {
    if (getGovernedSkillsForAgent(agentKey).length === 0) {
      throw new Error(`Canonical governed agent has no governed skills: ${agentKey}`)
    }
  }
}
