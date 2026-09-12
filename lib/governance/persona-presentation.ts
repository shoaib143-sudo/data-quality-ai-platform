import type { PersonaSlug } from '@/lib/governance/personas'

export type PresentationPrimitive =
  | 'executive-health'
  | 'trusted-data-discovery'
  | 'decision-queue'
  | 'product-trust'
  | 'steward-work-queue'
  | 'governance-programme'
  | 'control-assurance'
  | 'privacy-exposure'
  | 'platform-operations'
  | 'technical-remediation'
  | 'source-impact'
  | 'metadata-intelligence'
  | 'quality-diagnostics'
  | 'trend'
  | 'evidence'
  | 'lineage-impact'

export type PersonaPresentationPolicy = {
  persona: PersonaSlug
  objective: string
  abstraction: 'enterprise' | 'business' | 'domain' | 'operational' | 'technical' | 'analytical'
  primary: PresentationPrimitive
  secondary: PresentationPrimitive[]
  priorities: string[]
  suppress: string[]
}

export type PresentationPlan = {
  persona: PersonaSlug
  objective: string
  abstraction: PersonaPresentationPolicy['abstraction']
  primary: PresentationPrimitive
  secondary: PresentationPrimitive[]
  priorities: string[]
  truthBoundary: 'GOVERNED_OUTCOME_ONLY'
  authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE'
  fallback: 'CANONICAL_PERSONA_VIEW'
}

export const personaPresentationPolicies: Record<PersonaSlug, PersonaPresentationPolicy> = {
  'senior-leadership': {
    persona: 'senior-leadership',
    objective: 'Surface enterprise trust, material risk, business impact, accountability and trend.',
    abstraction: 'enterprise',
    primary: 'executive-health',
    secondary: ['trend', 'lineage-impact', 'evidence'],
    priorities: ['material-risk', 'business-impact', 'accountability', 'change', 'trend'],
    suppress: ['profile-run-identifiers', 'metric-implementation-detail', 'execution-engine-detail'],
  },
  'business-user': {
    persona: 'business-user',
    objective: 'Help the user find, understand and safely use trusted governed data.',
    abstraction: 'business',
    primary: 'trusted-data-discovery',
    secondary: ['evidence', 'lineage-impact'],
    priorities: ['trust', 'fitness-for-use', 'known-issues', 'business-definition', 'usage-guidance'],
    suppress: ['technical-runtime-detail', 'control-engine-detail'],
  },
  'data-owner': {
    persona: 'data-owner',
    objective: 'Present domain health, accountability, tolerance breaches and decisions requiring owner action.',
    abstraction: 'domain',
    primary: 'decision-queue',
    secondary: ['executive-health', 'lineage-impact', 'evidence'],
    priorities: ['owner-decision', 'risk', 'critical-data', 'business-impact', 'remediation-progress'],
    suppress: ['low-level-execution-detail'],
  },
  'data-product-owner': {
    persona: 'data-product-owner',
    objective: 'Present product trust, certification, SLA health and consumer impact.',
    abstraction: 'domain',
    primary: 'product-trust',
    secondary: ['trend', 'lineage-impact', 'evidence'],
    priorities: ['product-trust', 'certification', 'sla', 'consumer-impact', 'product-issues'],
    suppress: ['unrelated-enterprise-governance-detail'],
  },
  'data-steward': {
    persona: 'data-steward',
    objective: 'Prioritize governed work requiring investigation, curation or remediation.',
    abstraction: 'operational',
    primary: 'steward-work-queue',
    secondary: ['evidence', 'trend', 'lineage-impact'],
    priorities: ['assigned-work', 'severity', 'evidence', 'root-cause', 'next-action'],
    suppress: ['enterprise-summary-without-action'],
  },
  'data-governance-specialist': {
    persona: 'data-governance-specialist',
    objective: 'Show governance effectiveness, control coverage, adoption, maturity and intervention gaps.',
    abstraction: 'enterprise',
    primary: 'governance-programme',
    secondary: ['trend', 'control-assurance', 'evidence'],
    priorities: ['control-effectiveness', 'ownership', 'cde-coverage', 'policy-compliance', 'maturity'],
    suppress: ['source-runtime-noise'],
  },
  'compliance-risk-officer': {
    persona: 'compliance-risk-officer',
    objective: 'Expose control failures, regulatory risk, exceptions and assurance evidence.',
    abstraction: 'domain',
    primary: 'control-assurance',
    secondary: ['evidence', 'lineage-impact', 'trend'],
    priorities: ['control-failure', 'exception', 'regulatory-exposure', 'evidence-completeness', 'escalation'],
    suppress: ['unverified-regulatory-inference'],
  },
  'privacy-security-officer': {
    persona: 'privacy-security-officer',
    objective: 'Expose sensitive-data coverage, privacy risk, classification gaps and downstream exposure.',
    abstraction: 'domain',
    primary: 'privacy-exposure',
    secondary: ['lineage-impact', 'evidence', 'trend'],
    priorities: ['sensitive-data', 'classification', 'exposure', 'lineage', 'privacy-issue'],
    suppress: ['unverified-privacy-impact'],
  },
  'data-governance-admin': {
    persona: 'data-governance-admin',
    objective: 'Present governance platform health, workflow state, source readiness and configuration signals.',
    abstraction: 'technical',
    primary: 'platform-operations',
    secondary: ['trend', 'evidence'],
    priorities: ['platform-health', 'source-health', 'job-health', 'workflow-health', 'configuration'],
    suppress: ['organization-admin-authority-assumption'],
  },
  'data-custodian': {
    persona: 'data-custodian',
    objective: 'Present source, pipeline, profiling and technical-remediation health.',
    abstraction: 'technical',
    primary: 'technical-remediation',
    secondary: ['source-impact', 'trend', 'evidence'],
    priorities: ['technical-failure', 'source-health', 'profiling-health', 'lineage', 'remediation'],
    suppress: ['business-risk-inference-without-governed-evidence'],
  },
  'source-system-owner': {
    persona: 'source-system-owner',
    objective: 'Show upstream source reliability, recurring defects, schema change and downstream impact.',
    abstraction: 'technical',
    primary: 'source-impact',
    secondary: ['trend', 'lineage-impact', 'evidence'],
    priorities: ['source-defect', 'schema-change', 'recurrence', 'downstream-impact', 'upstream-remediation'],
    suppress: ['unrelated-governance-programme-detail'],
  },
  'metadata-analyst': {
    persona: 'metadata-analyst',
    objective: 'Present metadata completeness, ownership, glossary, classification and lineage gaps.',
    abstraction: 'analytical',
    primary: 'metadata-intelligence',
    secondary: ['trend', 'evidence', 'lineage-impact'],
    priorities: ['metadata-completeness', 'ownership', 'glossary', 'classification', 'lineage'],
    suppress: ['quality-root-cause-detail-unless-linked'],
  },
  'data-quality-analyst': {
    persona: 'data-quality-analyst',
    objective: 'Present quality trends, dimensions, anomalies, failed controls and root-cause evidence.',
    abstraction: 'analytical',
    primary: 'quality-diagnostics',
    secondary: ['trend', 'evidence', 'lineage-impact'],
    priorities: ['quality-score', 'dimension-breakdown', 'anomaly', 'failed-control', 'root-cause'],
    suppress: ['executive-summary-without-diagnostic-detail'],
  },
}

export function buildPersonaPresentationPlan(persona: PersonaSlug): PresentationPlan {
  const policy = personaPresentationPolicies[persona]
  return {
    persona,
    objective: policy.objective,
    abstraction: policy.abstraction,
    primary: policy.primary,
    secondary: [...policy.secondary],
    priorities: [...policy.priorities],
    truthBoundary: 'GOVERNED_OUTCOME_ONLY',
    authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE',
    fallback: 'CANONICAL_PERSONA_VIEW',
  }
}
