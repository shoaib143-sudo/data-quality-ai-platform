import type { PersonaSlug } from './personas'

export type ResponseDepth = 'CONCISE' | 'BALANCED' | 'DETAILED'
export type EvidenceDepth = 'SUMMARY' | 'EVIDENCE_FIRST' | 'FULL_TRACE'
export type RecommendationStyle = 'ADVISORY' | 'DECISION' | 'OPERATIONAL'

export type PersonaConversationDefault = {
  responseDepth: ResponseDepth
  evidenceDepth: EvidenceDepth
  recommendationStyle: RecommendationStyle
  defaultScope: 'ENTERPRISE' | 'DOMAIN' | 'PROJECT' | 'RESOURCE'
  suggestedPrompts: readonly string[]
  preferredAgentKeys: readonly string[]
}

export const personaConversationDefaults: Record<PersonaSlug, PersonaConversationDefault> = {
  'senior-leadership': {
    responseDepth: 'CONCISE', evidenceDepth: 'SUMMARY', recommendationStyle: 'DECISION', defaultScope: 'ENTERPRISE',
    suggestedPrompts: ['Summarize the most material data risks.', 'What changed in governed data confidence?', 'Which issues need executive attention?'],
    preferredAgentKeys: ['executive_agent', 'governance_analyst_agent'],
  },
  'business-user': {
    responseDepth: 'BALANCED', evidenceDepth: 'SUMMARY', recommendationStyle: 'ADVISORY', defaultScope: 'RESOURCE',
    suggestedPrompts: ['Can I trust this dataset?', 'Explain this business term.', 'What known issues affect this data?'],
    preferredAgentKeys: ['support_agent', 'investigator_agent'],
  },
  'data-owner': {
    responseDepth: 'BALANCED', evidenceDepth: 'EVIDENCE_FIRST', recommendationStyle: 'DECISION', defaultScope: 'DOMAIN',
    suggestedPrompts: ['What requires a Data Owner decision?', 'Explain material risks in my domain.', 'Recommend the next remediation action.'],
    preferredAgentKeys: ['executive_agent', 'investigator_agent', 'steward_agent'],
  },
  'data-product-owner': {
    responseDepth: 'BALANCED', evidenceDepth: 'EVIDENCE_FIRST', recommendationStyle: 'DECISION', defaultScope: 'PROJECT',
    suggestedPrompts: ['Which data product risks affect consumers?', 'Explain current quality and SLA evidence.', 'Recommend product trust improvements.'],
    preferredAgentKeys: ['investigator_agent', 'support_agent'],
  },
  'data-steward': {
    responseDepth: 'DETAILED', evidenceDepth: 'FULL_TRACE', recommendationStyle: 'OPERATIONAL', defaultScope: 'DOMAIN',
    suggestedPrompts: ['Investigate unresolved governance findings.', 'Explain the evidence behind this issue.', 'Recommend stewardship remediation steps.'],
    preferredAgentKeys: ['steward_agent', 'investigator_agent'],
  },
  'data-governance-specialist': {
    responseDepth: 'DETAILED', evidenceDepth: 'FULL_TRACE', recommendationStyle: 'ADVISORY', defaultScope: 'ENTERPRISE',
    suggestedPrompts: ['Where are governance control gaps?', 'Explain maturity evidence.', 'Recommend governance programme improvements.'],
    preferredAgentKeys: ['governance_analyst_agent', 'investigator_agent'],
  },
  'compliance-risk-officer': {
    responseDepth: 'DETAILED', evidenceDepth: 'FULL_TRACE', recommendationStyle: 'DECISION', defaultScope: 'DOMAIN',
    suggestedPrompts: ['Investigate regulatory exposure.', 'Explain evidence behind this control failure.', 'Recommend risk remediation.'],
    preferredAgentKeys: ['investigator_agent', 'governance_analyst_agent'],
  },
  'privacy-security-officer': {
    responseDepth: 'DETAILED', evidenceDepth: 'FULL_TRACE', recommendationStyle: 'DECISION', defaultScope: 'DOMAIN',
    suggestedPrompts: ['Where is sensitive data exposed?', 'Explain classification evidence.', 'Recommend privacy remediation.'],
    preferredAgentKeys: ['investigator_agent', 'governance_analyst_agent'],
  },
  'data-governance-admin': {
    responseDepth: 'DETAILED', evidenceDepth: 'FULL_TRACE', recommendationStyle: 'OPERATIONAL', defaultScope: 'PROJECT',
    suggestedPrompts: ['Summarize failed governance operations.', 'Investigate this agent execution.', 'Recommend safe operational recovery.'],
    preferredAgentKeys: ['support_agent', 'investigator_agent', 'native_supervisor_agent'],
  },
  'data-custodian': {
    responseDepth: 'DETAILED', evidenceDepth: 'FULL_TRACE', recommendationStyle: 'OPERATIONAL', defaultScope: 'PROJECT',
    suggestedPrompts: ['Investigate this technical failure.', 'Explain source and pipeline evidence.', 'Recommend a safe recovery action.'],
    preferredAgentKeys: ['support_agent', 'investigator_agent', 'profiling_agent'],
  },
  'source-system-owner': {
    responseDepth: 'DETAILED', evidenceDepth: 'EVIDENCE_FIRST', recommendationStyle: 'OPERATIONAL', defaultScope: 'RESOURCE',
    suggestedPrompts: ['Which source defects affect downstream consumers?', 'Explain the impact of this source issue.', 'Recommend upstream remediation.'],
    preferredAgentKeys: ['investigator_agent', 'support_agent'],
  },
  'metadata-analyst': {
    responseDepth: 'DETAILED', evidenceDepth: 'FULL_TRACE', recommendationStyle: 'ADVISORY', defaultScope: 'RESOURCE',
    suggestedPrompts: ['Investigate metadata completeness gaps.', 'Explain lineage and classification inconsistencies.', 'Recommend metadata improvements.'],
    preferredAgentKeys: ['architect_agent', 'investigator_agent'],
  },
  'data-quality-analyst': {
    responseDepth: 'DETAILED', evidenceDepth: 'FULL_TRACE', recommendationStyle: 'OPERATIONAL', defaultScope: 'RESOURCE',
    suggestedPrompts: ['Investigate quality deterioration.', 'Explain the root cause evidence.', 'Recommend the next quality action.'],
    preferredAgentKeys: ['investigator_agent', 'profiling_agent'],
  },
}

export type ConversationOverride = Partial<Omit<PersonaConversationDefault, 'suggestedPrompts' | 'preferredAgentKeys'>> & {
  suggestedPrompts?: readonly string[]
  preferredAgentKeys?: readonly string[]
}

export function resolveConversationDefaults(
  persona: PersonaSlug,
  domainOverride?: ConversationOverride | null,
  projectOverride?: ConversationOverride | null,
  userPreference?: ConversationOverride | null,
): PersonaConversationDefault {
  const base = personaConversationDefaults[persona]
  return {
    ...base,
    ...(domainOverride ?? {}),
    ...(projectOverride ?? {}),
    ...(userPreference ?? {}),
    suggestedPrompts: userPreference?.suggestedPrompts ?? projectOverride?.suggestedPrompts ?? domainOverride?.suggestedPrompts ?? base.suggestedPrompts,
    preferredAgentKeys: userPreference?.preferredAgentKeys ?? projectOverride?.preferredAgentKeys ?? domainOverride?.preferredAgentKeys ?? base.preferredAgentKeys,
  }
}
