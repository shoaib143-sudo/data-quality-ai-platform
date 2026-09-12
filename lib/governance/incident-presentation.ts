import type { PersonaSlug } from './personas'

export const incidentComponentIds = [
  'incident-summary',
  'trust-summary',
  'risk-summary',
  'issue-queue',
  'evidence-panel',
  'root-cause-panel',
  'lineage-impact',
  'decision-card',
  'remediation-plan',
  'verification-panel',
  'control-status',
  'execution-state',
  'quality-trend',
  'governance-history',
] as const

export type IncidentComponentId = (typeof incidentComponentIds)[number]
export type IncidentAbstraction = 'enterprise' | 'business' | 'domain' | 'operational' | 'technical' | 'analytical'
export type IncidentEvidenceDepth = 'summary' | 'governed' | 'diagnostic' | 'technical'

export type IncidentPresentationPlan = {
  persona: PersonaSlug
  primaryQuestion: string
  abstraction: IncidentAbstraction
  sectionOrder: IncidentComponentId[]
  evidenceDepth: IncidentEvidenceDepth
  actionEmphasis: string[]
  suppressedTechnicalDetail: string[]
  truthBoundary: 'GOVERNED_OUTCOME_ONLY'
  authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE'
  actionAuthority: 'PRESENTATION_ONLY'
  fallback: 'CANONICAL_INCIDENT_VIEW'
  policyVersion: 1
}

type PolicyBody = Omit<IncidentPresentationPlan, 'persona' | 'truthBoundary' | 'authorizationBoundary' | 'actionAuthority' | 'fallback' | 'policyVersion'>

const policies: Record<PersonaSlug, PolicyBody> = {
  'senior-leadership': {
    primaryQuestion: 'What is the material exposure, what business outcome is affected, who is accountable, and is recovery verified?',
    abstraction: 'enterprise',
    evidenceDepth: 'summary',
    sectionOrder: ['risk-summary', 'lineage-impact', 'decision-card', 'verification-panel', 'incident-summary', 'governance-history'],
    actionEmphasis: ['escalation', 'accountability', 'decision', 'verified-outcome'],
    suppressedTechnicalDetail: ['raw-metrics', 'schema-internals', 'job-runtime'],
  },
  'business-user': {
    primaryQuestion: 'Can I safely use this data now, what is affected, and has the issue been verified as resolved?',
    abstraction: 'business',
    evidenceDepth: 'summary',
    sectionOrder: ['trust-summary', 'incident-summary', 'lineage-impact', 'verification-panel', 'evidence-panel'],
    actionEmphasis: ['fitness-for-use', 'known-limitations', 'safe-alternative'],
    suppressedTechnicalDetail: ['raw-metrics', 'schema-internals', 'job-runtime', 'control-implementation'],
  },
  'data-owner': {
    primaryQuestion: 'What risk requires my decision, who owns remediation, and what evidence proves recovery?',
    abstraction: 'domain',
    evidenceDepth: 'governed',
    sectionOrder: ['risk-summary', 'decision-card', 'lineage-impact', 'remediation-plan', 'verification-panel', 'evidence-panel', 'governance-history'],
    actionEmphasis: ['owner-decision', 'risk-acceptance', 'remediation-accountability', 'verification'],
    suppressedTechnicalDetail: ['job-runtime', 'low-level-schema-diff'],
  },
  'data-product-owner': {
    primaryQuestion: 'How does this incident affect product trust and consumers, and when is the product verified healthy again?',
    abstraction: 'business',
    evidenceDepth: 'governed',
    sectionOrder: ['trust-summary', 'lineage-impact', 'risk-summary', 'remediation-plan', 'verification-panel', 'quality-trend', 'evidence-panel'],
    actionEmphasis: ['consumer-impact', 'service-recovery', 'certification-readiness', 'verification'],
    suppressedTechnicalDetail: ['job-runtime'],
  },
  'data-steward': {
    primaryQuestion: 'What evidence must I investigate, coordinate, remediate, and verify next?',
    abstraction: 'operational',
    evidenceDepth: 'diagnostic',
    sectionOrder: ['issue-queue', 'evidence-panel', 'root-cause-panel', 'remediation-plan', 'verification-panel', 'lineage-impact', 'governance-history'],
    actionEmphasis: ['triage', 'evidence-review', 'coordination', 'remediation', 'verification'],
    suppressedTechnicalDetail: [],
  },
  'data-governance-specialist': {
    primaryQuestion: 'What governance gap produced or prolonged this incident, and are controls and accountability improving?',
    abstraction: 'domain',
    evidenceDepth: 'governed',
    sectionOrder: ['risk-summary', 'control-status', 'root-cause-panel', 'decision-card', 'remediation-plan', 'verification-panel', 'governance-history'],
    actionEmphasis: ['governance-intervention', 'control-effectiveness', 'recurrence', 'accountability'],
    suppressedTechnicalDetail: ['job-runtime'],
  },
  'compliance-risk-officer': {
    primaryQuestion: 'What control or regulatory exposure exists, what evidence supports it, and is remediation independently verifiable?',
    abstraction: 'domain',
    evidenceDepth: 'governed',
    sectionOrder: ['risk-summary', 'control-status', 'evidence-panel', 'lineage-impact', 'decision-card', 'verification-panel', 'governance-history'],
    actionEmphasis: ['control-exposure', 'exception-review', 'evidence-readiness', 'escalation'],
    suppressedTechnicalDetail: ['job-runtime', 'low-level-schema-diff'],
  },
  'privacy-security-officer': {
    primaryQuestion: 'Is sensitive data exposed, what downstream assets are affected, and what verified containment or remediation exists?',
    abstraction: 'domain',
    evidenceDepth: 'governed',
    sectionOrder: ['risk-summary', 'lineage-impact', 'control-status', 'evidence-panel', 'remediation-plan', 'verification-panel', 'governance-history'],
    actionEmphasis: ['containment', 'classification', 'privacy-impact', 'verified-remediation'],
    suppressedTechnicalDetail: ['job-runtime'],
  },
  'data-governance-admin': {
    primaryQuestion: 'Which governed workflow state is degraded or blocked, and what operational recovery is required?',
    abstraction: 'operational',
    evidenceDepth: 'technical',
    sectionOrder: ['execution-state', 'incident-summary', 'issue-queue', 'remediation-plan', 'verification-panel', 'evidence-panel', 'governance-history'],
    actionEmphasis: ['workflow-recovery', 'configuration', 'runtime-state', 'auditability'],
    suppressedTechnicalDetail: [],
  },
  'data-custodian': {
    primaryQuestion: 'What technical cause must be fixed, what downstream impact exists, and did a fresh execution verify the fix?',
    abstraction: 'technical',
    evidenceDepth: 'technical',
    sectionOrder: ['root-cause-panel', 'execution-state', 'evidence-panel', 'remediation-plan', 'verification-panel', 'quality-trend', 'lineage-impact'],
    actionEmphasis: ['technical-remediation', 'source-recovery', 'reprofile', 'verification'],
    suppressedTechnicalDetail: [],
  },
  'source-system-owner': {
    primaryQuestion: 'What upstream defect is causing downstream impact, what source action is required, and has the fix been verified?',
    abstraction: 'technical',
    evidenceDepth: 'diagnostic',
    sectionOrder: ['root-cause-panel', 'lineage-impact', 'incident-summary', 'remediation-plan', 'verification-panel', 'quality-trend', 'evidence-panel'],
    actionEmphasis: ['upstream-fix', 'schema-change', 'recurrence-prevention', 'downstream-recovery'],
    suppressedTechnicalDetail: [],
  },
  'metadata-analyst': {
    primaryQuestion: 'Which metadata, ownership, classification or lineage gaps contribute to this incident?',
    abstraction: 'analytical',
    evidenceDepth: 'diagnostic',
    sectionOrder: ['incident-summary', 'evidence-panel', 'lineage-impact', 'root-cause-panel', 'governance-history', 'verification-panel'],
    actionEmphasis: ['metadata-completeness', 'ownership', 'glossary', 'classification', 'lineage'],
    suppressedTechnicalDetail: ['job-runtime'],
  },
  'data-quality-analyst': {
    primaryQuestion: 'Which quality signals changed, what evidence explains the root cause, and did re-profiling prove improvement?',
    abstraction: 'analytical',
    evidenceDepth: 'technical',
    sectionOrder: ['quality-trend', 'evidence-panel', 'root-cause-panel', 'risk-summary', 'remediation-plan', 'verification-panel', 'lineage-impact'],
    actionEmphasis: ['quality-analysis', 'root-cause', 'metric-delta', 'reprofile', 'verification'],
    suppressedTechnicalDetail: [],
  },
}

export function buildIncidentPresentationPlan(persona: PersonaSlug): IncidentPresentationPlan {
  return {
    persona,
    ...policies[persona],
    truthBoundary: 'GOVERNED_OUTCOME_ONLY',
    authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE',
    actionAuthority: 'PRESENTATION_ONLY',
    fallback: 'CANONICAL_INCIDENT_VIEW',
    policyVersion: 1,
  }
}
