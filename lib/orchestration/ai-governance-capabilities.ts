export type AiGovernanceCapability = {
  capabilityKey: string
  category:
    | 'AGENT_EXECUTION'
    | 'DELEGATION'
    | 'CONVERSATION'
    | 'RECOMMENDATION'
    | 'TOOL_USE'
    | 'RETRIEVAL'
    | 'RAG'
    | 'GROUNDING'
    | 'MODEL_ROUTING'
    | 'PROVIDER_FALLBACK'
    | 'BUDGET_CONTROL'
    | 'PROMPT_GOVERNANCE'
    | 'STRUCTURED_OUTPUT'
    | 'AI_EVALUATION'
    | 'RED_TEAM'
    | 'HUMAN_APPROVAL'
    | 'RECOVERY'
    | 'OBSERVABILITY'
    | 'AUDIT'
  mandatoryForE2E: boolean
  evidenceRequirements: string[]
}

export const mandatoryAiGovernanceCapabilities: AiGovernanceCapability[] = [
  { capabilityKey: 'ai.agent.execution', category: 'AGENT_EXECUTION', mandatoryForE2E: true, evidenceRequirements: ['agent_run', 'agent_run_steps'] },
  { capabilityKey: 'ai.agent.delegation', category: 'DELEGATION', mandatoryForE2E: true, evidenceRequirements: ['parent_run_id', 'correlation_id'] },
  { capabilityKey: 'ai.conversation.governed', category: 'CONVERSATION', mandatoryForE2E: true, evidenceRequirements: ['authorization_decision', 'response_evidence'] },
  { capabilityKey: 'ai.recommendation.governed', category: 'RECOMMENDATION', mandatoryForE2E: true, evidenceRequirements: ['recommendation', 'evidence_refs'] },
  { capabilityKey: 'ai.tool.execution', category: 'TOOL_USE', mandatoryForE2E: true, evidenceRequirements: ['tool_key', 'tool_result'] },
  { capabilityKey: 'ai.retrieval.authorized', category: 'RETRIEVAL', mandatoryForE2E: true, evidenceRequirements: ['retrieval_scope', 'source_refs'] },
  { capabilityKey: 'ai.rag.grounded', category: 'RAG', mandatoryForE2E: true, evidenceRequirements: ['context_refs', 'grounded_answer'] },
  { capabilityKey: 'ai.grounding.citations', category: 'GROUNDING', mandatoryForE2E: true, evidenceRequirements: ['citation_refs'] },
  { capabilityKey: 'ai.model.routing', category: 'MODEL_ROUTING', mandatoryForE2E: true, evidenceRequirements: ['model_policy', 'selected_model'] },
  { capabilityKey: 'ai.provider.fallback', category: 'PROVIDER_FALLBACK', mandatoryForE2E: true, evidenceRequirements: ['fallback_reason', 'provider_attempts'] },
  { capabilityKey: 'ai.budget.enforcement', category: 'BUDGET_CONTROL', mandatoryForE2E: true, evidenceRequirements: ['budget_snapshot', 'usage'] },
  { capabilityKey: 'ai.prompt.governance', category: 'PROMPT_GOVERNANCE', mandatoryForE2E: true, evidenceRequirements: ['prompt_version'] },
  { capabilityKey: 'ai.output.structured', category: 'STRUCTURED_OUTPUT', mandatoryForE2E: true, evidenceRequirements: ['schema_validation'] },
  { capabilityKey: 'ai.evaluation.independent', category: 'AI_EVALUATION', mandatoryForE2E: true, evidenceRequirements: ['evaluation_result'] },
  { capabilityKey: 'ai.redteam.controls', category: 'RED_TEAM', mandatoryForE2E: true, evidenceRequirements: ['adversarial_case', 'control_result'] },
  { capabilityKey: 'ai.approval.boundary', category: 'HUMAN_APPROVAL', mandatoryForE2E: true, evidenceRequirements: ['approval_decision'] },
  { capabilityKey: 'ai.recovery.controlled', category: 'RECOVERY', mandatoryForE2E: true, evidenceRequirements: ['failure_class', 'recovery_action'] },
  { capabilityKey: 'ai.observability.decision_trace', category: 'OBSERVABILITY', mandatoryForE2E: true, evidenceRequirements: ['decision_trace'] },
  { capabilityKey: 'ai.audit.complete', category: 'AUDIT', mandatoryForE2E: true, evidenceRequirements: ['audit_event_refs'] },
]

export function validateAiCapabilityRegistry(capabilities: AiGovernanceCapability[]): string[] {
  const errors: string[] = []
  const keys = capabilities.map(item => item.capabilityKey)
  if (new Set(keys).size !== keys.length) errors.push('AI governance capability keys must be unique.')
  for (const capability of capabilities) {
    if (!capability.capabilityKey.trim()) errors.push('AI governance capability key must not be blank.')
    if (!capability.mandatoryForE2E) errors.push(`${capability.capabilityKey}: capability is not mandatory for E2E certification.`)
    if (capability.evidenceRequirements.length === 0) errors.push(`${capability.capabilityKey}: evidence requirements must not be empty.`)
    if (capability.evidenceRequirements.some(key => !key.trim())) errors.push(`${capability.capabilityKey}: evidence requirement keys must not be blank.`)
    if (new Set(capability.evidenceRequirements).size !== capability.evidenceRequirements.length) {
      errors.push(`${capability.capabilityKey}: evidence requirement keys must be unique.`)
    }
  }
  return errors
}

export function missingAiCapabilityEvidence(
  capability: AiGovernanceCapability,
  availableEvidenceKeys: Iterable<string>,
): string[] {
  const available = new Set(availableEvidenceKeys)
  return capability.evidenceRequirements.filter(key => !available.has(key))
}
