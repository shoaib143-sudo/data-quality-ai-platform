import type { PersonaSlug } from '@/lib/governance/personas'

export type FindingsIssuesFocus = 'risk' | 'decision' | 'remediation' | 'assurance' | 'privacy' | 'technical' | 'diagnostic' | 'discovery'

export type FindingsIssuesPresentation = {
  persona: PersonaSlug
  title: string
  description: string
  primaryFocus: FindingsIssuesFocus
  priorities: string[]
  showProfilingEvidence: boolean
  showOwnership: boolean
  showTechnicalContext: boolean
  truthBoundary: 'GOVERNED_OUTCOME_ONLY'
  authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE'
}

const policies: Record<PersonaSlug, Omit<FindingsIssuesPresentation, 'persona' | 'truthBoundary' | 'authorizationBoundary'>> = {
  'senior-leadership': { title: 'Material risk & accountability', description: 'Prioritize material issues, affected business outcomes and accountable ownership.', primaryFocus: 'risk', priorities: ['material-risk','business-impact','accountability','trend'], showProfilingEvidence: false, showOwnership: true, showTechnicalContext: false },
  'business-user': { title: 'Trust issues affecting use', description: 'Show issues that change whether governed data is safe and fit for intended use.', primaryFocus: 'discovery', priorities: ['fitness-for-use','trust-impact','known-issues'], showProfilingEvidence: false, showOwnership: false, showTechnicalContext: false },
  'data-owner': { title: 'Owner decisions & remediation', description: 'Prioritize tolerance breaches, material issues and decisions requiring owner action.', primaryFocus: 'decision', priorities: ['owner-decision','risk','remediation','accountability'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: false },
  'data-product-owner': { title: 'Product trust & consumer impact', description: 'Prioritize issues affecting product trust, certification, SLA and consumers.', primaryFocus: 'risk', priorities: ['product-trust','consumer-impact','certification','sla'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: false },
  'data-steward': { title: 'Steward investigation queue', description: 'Prioritize governed issues requiring evidence review, curation and remediation.', primaryFocus: 'remediation', priorities: ['assigned-work','severity','evidence','next-action'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: true },
  'data-governance-specialist': { title: 'Governance intervention gaps', description: 'Prioritize recurring issues, governance effectiveness gaps and unresolved actions.', primaryFocus: 'assurance', priorities: ['governance-effectiveness','recurrence','control-gap','ownership'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: false },
  'compliance-risk-officer': { title: 'Control & regulatory assurance', description: 'Prioritize control failures, exceptions, exposure and evidence completeness.', primaryFocus: 'assurance', priorities: ['control-failure','exception','exposure','evidence'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: false },
  'privacy-security-officer': { title: 'Privacy & sensitive-data exposure', description: 'Prioritize issues involving sensitive data, classification and downstream exposure.', primaryFocus: 'privacy', priorities: ['sensitive-data','classification','exposure','lineage'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: false },
  'data-governance-admin': { title: 'Operational issue state', description: 'Prioritize workflow health, failed governance operations and configuration blockers.', primaryFocus: 'technical', priorities: ['workflow-health','runtime-state','configuration','recovery'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: true },
  'data-custodian': { title: 'Technical remediation', description: 'Prioritize source, pipeline and profiling defects requiring technical remediation.', primaryFocus: 'technical', priorities: ['source-defect','pipeline','profiling','remediation'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: true },
  'source-system-owner': { title: 'Upstream defects & downstream impact', description: 'Prioritize source defects, schema change, recurrence and affected consumers.', primaryFocus: 'technical', priorities: ['source-defect','schema-change','recurrence','downstream-impact'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: true },
  'metadata-analyst': { title: 'Metadata governance issues', description: 'Prioritize ownership, glossary, classification and lineage gaps.', primaryFocus: 'diagnostic', priorities: ['metadata-completeness','ownership','glossary','classification','lineage'], showProfilingEvidence: false, showOwnership: true, showTechnicalContext: false },
  'data-quality-analyst': { title: 'Quality findings & root cause', description: 'Prioritize quality anomalies, failed controls and evidence-backed root cause.', primaryFocus: 'diagnostic', priorities: ['quality-score','anomaly','failed-control','root-cause','evidence'], showProfilingEvidence: true, showOwnership: true, showTechnicalContext: true },
}

export function buildFindingsIssuesPresentation(persona: PersonaSlug): FindingsIssuesPresentation {
  return {
    persona,
    ...policies[persona],
    truthBoundary: 'GOVERNED_OUTCOME_ONLY',
    authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE',
  }
}
