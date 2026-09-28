export const GOVERNANCE_MATURITY_FRAMEWORK_VERSION = 'DN-GMA-1.0'

export type MaturityDomainId = 'purpose' | 'principles' | 'people' | 'practices' | 'ai' | 'capacity'
export type MaturityCriticality = 'CRITICAL' | 'HIGH' | 'STANDARD' | 'CONTEXTUAL'
export type AssessmentPriority = 'HIGH' | 'MEDIUM' | 'LOW'

export type OrganizationAssessmentProfile = {
  organizationType?: 'PRIVATE' | 'PUBLIC' | 'NONPROFIT' | 'OTHER'
  industry?: string
  country?: string
  employeeBand?: string
  regulated?: boolean
  processesPersonalData?: boolean
  processesSensitiveData?: boolean
  usesAi?: boolean
  sharesDataExternally?: boolean
  crossBorderTransfers?: boolean
  cloudPlatforms?: string[]
  dataPlatforms?: string[]
}

export type ApplicabilityRule = {
  key: keyof OrganizationAssessmentProfile
  equals: string | boolean
}

export type MaturityQuestion = {
  id: string
  domainId: MaturityDomainId
  capability: string
  shortLabel: string
  prompt: string
  baseline: boolean
  weight: number
  criticality: MaturityCriticality
  defaultTarget: 0 | 1 | 2 | 3 | 4 | 5
  applicability?: ApplicabilityRule[]
  maturityStatements: readonly [string, string, string, string, string, string]
  evidenceExamples: readonly string[]
  recommendedAction: string
  dataNexusAction: string
  provenance: {
    source: string
    sourceLicense?: string
    adaptation: string
  }
}

export const MATURITY_LEVELS = [
  { level: 0, label: 'Absent', description: 'The capability does not materially exist.' },
  { level: 1, label: 'Ad hoc', description: 'The capability is informal and depends on individuals.' },
  { level: 2, label: 'Developing', description: 'The capability is partially implemented in selected areas.' },
  { level: 3, label: 'Defined', description: 'The capability is documented and broadly established.' },
  { level: 4, label: 'Managed', description: 'The capability is consistently operated and measured.' },
  { level: 5, label: 'Adaptive', description: 'The capability is continuously improved and automated where appropriate.' },
] as const

export const MATURITY_DOMAINS = [
  { id: 'purpose', label: 'Vision & Purpose', weight: 1.0 },
  { id: 'principles', label: 'Principles', weight: 1.0 },
  { id: 'people', label: 'People & Accountability', weight: 1.15 },
  { id: 'practices', label: 'Practices & Controls', weight: 1.35 },
  { id: 'ai', label: 'AI & Emerging Technology', weight: 1.0 },
  { id: 'capacity', label: 'Capacity & Literacy', weight: 0.9 },
] as const

function standardScale(subject: string): readonly [string, string, string, string, string, string] {
  return [
    `No formal ${subject} capability exists.`,
    `${subject} occurs informally and depends on individual initiative.`,
    `${subject} is implemented for selected teams, domains, or priority assets.`,
    `${subject} is formally defined and broadly implemented across relevant scope.`,
    `${subject} is consistently operated, measured, and reviewed against defined controls.`,
    `${subject} is continuously improved using evidence, automation, and feedback where appropriate.`,
  ]
}

const broadbandProvenance = {
  source: 'Broadband Commission Data Governance Toolkit: Navigating Data in the Digital Age (2025)',
  sourceLicense: 'CC BY-SA 3.0 IGO',
  adaptation: 'Paraphrased and expanded into DataNexus behavioral maturity statements; not an official Broadband Commission score.',
}

const synthesisProvenance = {
  source: 'DataNexus Governance Maturity & Readiness Assessment synthesis',
  adaptation: 'Adapted from evidence-backed governance maturity practices for DataNexus operation.',
}

export const GOVERNANCE_MATURITY_QUESTIONS: readonly MaturityQuestion[] = [
  {
    id: 'PURPOSE-STRATEGY', domainId: 'purpose', capability: 'Data strategy', shortLabel: 'Data strategy and purpose',
    prompt: 'How consistently does the organization define why data is collected, governed, reused, and connected to strategic outcomes?',
    baseline: true, weight: 1.4, criticality: 'HIGH', defaultTarget: 4,
    maturityStatements: standardScale('data strategy and purpose'),
    evidenceExamples: ['Approved data strategy', 'Business strategy references', 'Data governance charter'],
    recommendedAction: 'Define a measurable data strategy that links governance activity to organizational outcomes.',
    dataNexusAction: 'Create a governance charter and map strategic outcomes to governed data domains.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PURPOSE-VALUE', domainId: 'purpose', capability: 'Value use cases', shortLabel: 'Priority data use cases',
    prompt: 'How clearly are priority data use cases and expected value identified with accountable stakeholders?',
    baseline: true, weight: 1.0, criticality: 'STANDARD', defaultTarget: 3,
    maturityStatements: standardScale('priority data use-case management'),
    evidenceExamples: ['Use-case portfolio', 'Value hypotheses', 'Stakeholder approvals'],
    recommendedAction: 'Create a governed portfolio of high-value data use cases with owners and measurable outcomes.',
    dataNexusAction: 'Register priority use cases and link them to datasets, owners, controls, and outcomes.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PURPOSE-REVIEW', domainId: 'purpose', capability: 'Strategy review', shortLabel: 'Strategy review cycle',
    prompt: 'How reliably is the data strategy reviewed and updated using outcomes, risk changes, and stakeholder feedback?',
    baseline: false, weight: 0.8, criticality: 'CONTEXTUAL', defaultTarget: 3,
    maturityStatements: standardScale('data strategy review'),
    evidenceExamples: ['Review calendar', 'Steering committee minutes', 'Change history'],
    recommendedAction: 'Establish a recurring strategy review cycle tied to governance evidence and changing priorities.',
    dataNexusAction: 'Schedule governance reviews and preserve decision evidence.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRINCIPLES-DOCUMENTED', domainId: 'principles', capability: 'Governance principles', shortLabel: 'Documented principles',
    prompt: 'How well are principles such as accountability, transparency, fairness, stewardship, quality, and access documented?',
    baseline: true, weight: 1.2, criticality: 'HIGH', defaultTarget: 4,
    maturityStatements: standardScale('documented data governance principles'),
    evidenceExamples: ['Principles statement', 'Policy framework', 'Internal standards'],
    recommendedAction: 'Approve a concise set of governance principles and map them to enforceable practices.',
    dataNexusAction: 'Register principles in the governance knowledge base and link them to controls.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRINCIPLES-EMBEDDED', domainId: 'principles', capability: 'Operational alignment', shortLabel: 'Principles in operations',
    prompt: 'How consistently are governance principles embedded in collection, processing, sharing, storage, analysis, and use?',
    baseline: true, weight: 1.3, criticality: 'HIGH', defaultTarget: 4,
    maturityStatements: standardScale('operational application of governance principles'),
    evidenceExamples: ['Lifecycle procedures', 'Control mappings', 'Operational checklists'],
    recommendedAction: 'Translate principles into lifecycle controls with owners and measurable evidence.',
    dataNexusAction: 'Map principles to lifecycle controls and monitor control evidence.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRINCIPLES-EXTERNAL', domainId: 'principles', capability: 'External enforceability', shortLabel: 'External governance obligations',
    prompt: 'How consistently are governance expectations reflected in contracts, data-sharing agreements, and third-party obligations?',
    baseline: false, weight: 0.9, criticality: 'HIGH', defaultTarget: 3,
    applicability: [{ key: 'sharesDataExternally', equals: true }],
    maturityStatements: standardScale('external governance obligation management'),
    evidenceExamples: ['Data-sharing agreements', 'Vendor clauses', 'MOUs', 'Contract controls'],
    recommendedAction: 'Standardize third-party governance clauses and evidence requirements.',
    dataNexusAction: 'Register contracts and link obligations to governed assets and approvals.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PEOPLE-LEADERSHIP', domainId: 'people', capability: 'Governance leadership', shortLabel: 'Accountable data leadership',
    prompt: 'How clearly is senior accountability for data governance assigned, resourced, and empowered?',
    baseline: true, weight: 1.4, criticality: 'CRITICAL', defaultTarget: 4,
    maturityStatements: standardScale('senior data governance accountability'),
    evidenceExamples: ['Role mandate', 'Organization chart', 'Budget authority', 'Governance charter'],
    recommendedAction: 'Assign accountable governance leadership with explicit authority and resources.',
    dataNexusAction: 'Configure accountable governance roles and authority coverage.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PEOPLE-STEWARDSHIP', domainId: 'people', capability: 'Stewardship', shortLabel: 'Data ownership and stewardship',
    prompt: 'How consistently are data owners and stewards assigned with documented decision rights and responsibilities?',
    baseline: true, weight: 1.5, criticality: 'CRITICAL', defaultTarget: 4,
    maturityStatements: standardScale('data ownership and stewardship'),
    evidenceExamples: ['Stewardship model', 'Owner assignments', 'RACI', 'Domain accountability matrix'],
    recommendedAction: 'Establish accountable ownership and stewardship for critical data domains and assets.',
    dataNexusAction: 'Identify unowned assets, recommend owners, assign stewards, and verify coverage.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PEOPLE-COORDINATION', domainId: 'people', capability: 'Cross-functional coordination', shortLabel: 'Governance coordination',
    prompt: 'How effectively do business, governance, privacy, security, technology, and analytics stakeholders coordinate decisions?',
    baseline: false, weight: 1.0, criticality: 'HIGH', defaultTarget: 3,
    maturityStatements: standardScale('cross-functional governance coordination'),
    evidenceExamples: ['Governance council terms', 'Decision logs', 'Meeting records', 'Escalation paths'],
    recommendedAction: 'Create a cross-functional governance forum with explicit decision and escalation rights.',
    dataNexusAction: 'Configure governed approvals, delegations, and decision evidence.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRACTICES-POLICY', domainId: 'practices', capability: 'Lifecycle policy', shortLabel: 'Lifecycle governance policy',
    prompt: 'How comprehensively do formal policies govern collection, processing, storage, sharing, reuse, retention, and disposal?',
    baseline: true, weight: 1.5, criticality: 'CRITICAL', defaultTarget: 4,
    maturityStatements: standardScale('data lifecycle policy management'),
    evidenceExamples: ['Data governance policy', 'Lifecycle standard', 'Retention policy'],
    recommendedAction: 'Establish an integrated lifecycle governance policy with accountable owners.',
    dataNexusAction: 'Map lifecycle policies to datasets, controls, approvals, and retention rules.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRACTICES-RISK', domainId: 'practices', capability: 'Risk and impact assessment', shortLabel: 'Risk assessment before use',
    prompt: 'How consistently are privacy, security, ethical, AI, and other impact assessments performed before sensitive or high-risk data use?',
    baseline: true, weight: 1.5, criticality: 'CRITICAL', defaultTarget: 4,
    maturityStatements: standardScale('data risk and impact assessment'),
    evidenceExamples: ['DPIAs', 'PIAs', 'AI risk assessments', 'Security reviews'],
    recommendedAction: 'Define risk triggers and require evidence-backed assessments before high-risk processing.',
    dataNexusAction: 'Route high-risk use cases through governed review and approval.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRACTICES-QUALITY', domainId: 'practices', capability: 'Data quality', shortLabel: 'Data quality controls',
    prompt: 'How consistently are accuracy, completeness, timeliness, validity, and other relevant quality dimensions controlled and monitored?',
    baseline: true, weight: 1.5, criticality: 'CRITICAL', defaultTarget: 4,
    maturityStatements: standardScale('data quality control and monitoring'),
    evidenceExamples: ['DQ rules', 'Quality scorecards', 'Profiling results', 'Issue history'],
    recommendedAction: 'Baseline critical datasets, define quality rules, and establish monitored thresholds.',
    dataNexusAction: 'Profile governed datasets, recommend DQ rules, monitor findings, and verify remediation.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRACTICES-METADATA', domainId: 'practices', capability: 'Metadata and catalog', shortLabel: 'Metadata and catalog coverage',
    prompt: 'How consistently are important data assets discoverable in a catalog with standardized business and technical metadata?',
    baseline: true, weight: 1.4, criticality: 'HIGH', defaultTarget: 4,
    maturityStatements: standardScale('metadata and catalog management'),
    evidenceExamples: ['Catalog inventory', 'Metadata standards', 'Coverage reports'],
    recommendedAction: 'Establish enterprise metadata standards and prioritize catalog coverage of critical assets.',
    dataNexusAction: 'Discover sources, catalog assets, measure metadata completeness, and assign owners.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRACTICES-LINEAGE', domainId: 'practices', capability: 'Data lineage', shortLabel: 'Data lineage coverage',
    prompt: 'How consistently is lineage captured and maintained so data origins, transformations, dependencies, and downstream use are traceable?',
    baseline: true, weight: 1.5, criticality: 'CRITICAL', defaultTarget: 4,
    maturityStatements: [
      'No repeatable lineage capability exists.',
      'Lineage is reconstructed manually when incidents, audits, or projects require it.',
      'Lineage exists for selected critical systems or datasets but coverage is incomplete.',
      'Standard lineage capture covers major governed domains and is used operationally.',
      'Lineage coverage, freshness, and accuracy are measured and governed across critical assets.',
      'Lineage is substantially automated, continuously verified, and used for impact-aware governance decisions.',
    ],
    evidenceExamples: ['Lineage graph', 'Transformation metadata', 'Coverage metrics', 'Impact analysis records'],
    recommendedAction: 'Prioritize end-to-end lineage for critical data and measure coverage and freshness.',
    dataNexusAction: 'Ingest field and dataset lineage, measure coverage, and expose impact analysis.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRACTICES-PRIVACY', domainId: 'practices', capability: 'Privacy and minimization', shortLabel: 'Privacy, minimization, and retention',
    prompt: 'How consistently are purpose limitation, minimization, consent where required, retention, and secure disposal applied?',
    baseline: true, weight: 1.5, criticality: 'CRITICAL', defaultTarget: 4,
    applicability: [{ key: 'processesPersonalData', equals: true }],
    maturityStatements: standardScale('privacy, minimization, retention, and disposal'),
    evidenceExamples: ['Retention schedules', 'Consent records', 'Data minimization reviews', 'Deletion evidence'],
    recommendedAction: 'Apply purpose, minimization, retention, and deletion controls to personal data at scale.',
    dataNexusAction: 'Classify sensitive data, attach retention rules, and monitor governed lifecycle closure.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRACTICES-SECURITY', domainId: 'practices', capability: 'Security and access', shortLabel: 'Security and access controls',
    prompt: 'How consistently are least privilege, access review, encryption, auditability, and protection against unauthorized access implemented?',
    baseline: true, weight: 1.6, criticality: 'CRITICAL', defaultTarget: 4,
    maturityStatements: standardScale('data security and access governance'),
    evidenceExamples: ['Access-control policies', 'IAM configuration', 'Audit logs', 'Encryption standards'],
    recommendedAction: 'Enforce least privilege, periodic access review, and evidence-backed security controls.',
    dataNexusAction: 'Evaluate resource access, privileged scopes, and auditable authorization evidence.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRACTICES-SHARING', domainId: 'practices', capability: 'Data sharing', shortLabel: 'Secure data sharing',
    prompt: 'How consistently are external and internal data-sharing arrangements governed through approved access patterns and reusable controls?',
    baseline: false, weight: 1.2, criticality: 'HIGH', defaultTarget: 4,
    applicability: [{ key: 'sharesDataExternally', equals: true }],
    maturityStatements: standardScale('secure data-sharing governance'),
    evidenceExamples: ['Sharing agreements', 'API access controls', 'Federated access records', 'Approval history'],
    recommendedAction: 'Standardize secure data-sharing patterns, approvals, contracts, and monitoring.',
    dataNexusAction: 'Link data-sharing obligations to access controls, approvals, and audit evidence.',
    provenance: broadbandProvenance,
  },
  {
    id: 'PRACTICES-CROSSBORDER', domainId: 'practices', capability: 'Cross-border governance', shortLabel: 'Cross-border data controls',
    prompt: 'How consistently are cross-border transfers identified, assessed, approved, documented, and monitored?',
    baseline: false, weight: 1.1, criticality: 'HIGH', defaultTarget: 4,
    applicability: [{ key: 'crossBorderTransfers', equals: true }],
    maturityStatements: standardScale('cross-border data transfer governance'),
    evidenceExamples: ['Transfer inventory', 'Transfer impact assessments', 'Contract clauses', 'Localization controls'],
    recommendedAction: 'Inventory cross-border transfers and link them to legal basis, approvals, and technical controls.',
    dataNexusAction: 'Register transfer obligations and surface datasets crossing governed boundaries.',
    provenance: synthesisProvenance,
  },
  {
    id: 'AI-FRAMEWORK', domainId: 'ai', capability: 'AI governance', shortLabel: 'AI governance framework',
    prompt: 'How mature is the organization-wide framework for governing AI data, models, decisions, accountability, and risk?',
    baseline: true, weight: 1.5, criticality: 'CRITICAL', defaultTarget: 4,
    applicability: [{ key: 'usesAi', equals: true }],
    maturityStatements: standardScale('AI governance'),
    evidenceExamples: ['AI governance policy', 'Model inventory', 'AI risk framework', 'Approval records'],
    recommendedAction: 'Establish an AI governance framework with inventory, risk tiers, accountable owners, and review gates.',
    dataNexusAction: 'Register governed AI capabilities, risk context, evaluation evidence, and approval boundaries.',
    provenance: broadbandProvenance,
  },
  {
    id: 'AI-DATA-READINESS', domainId: 'ai', capability: 'AI data readiness', shortLabel: 'AI-ready governed data',
    prompt: 'How consistently are AI datasets assessed for quality, representativeness, provenance, rights, privacy, and intended use?',
    baseline: false, weight: 1.4, criticality: 'CRITICAL', defaultTarget: 4,
    applicability: [{ key: 'usesAi', equals: true }],
    maturityStatements: standardScale('AI data readiness governance'),
    evidenceExamples: ['Training-data documentation', 'Bias checks', 'Data provenance', 'Rights and consent evidence'],
    recommendedAction: 'Require traceable evidence for the suitability of data used by governed AI systems.',
    dataNexusAction: 'Connect catalog, quality, lineage, privacy, and AI assurance evidence.',
    provenance: broadbandProvenance,
  },
  {
    id: 'CAPACITY-LITERACY', domainId: 'capacity', capability: 'Governance literacy', shortLabel: 'Governance literacy',
    prompt: 'How broadly do relevant staff understand data governance, privacy, security, quality, and responsible AI responsibilities?',
    baseline: true, weight: 1.2, criticality: 'HIGH', defaultTarget: 3,
    maturityStatements: standardScale('data governance literacy'),
    evidenceExamples: ['Training curriculum', 'Completion records', 'Role-specific learning paths'],
    recommendedAction: 'Provide role-specific governance learning and measure completion and effectiveness.',
    dataNexusAction: 'Map governance responsibilities to personas and identify capability gaps.',
    provenance: broadbandProvenance,
  },
  {
    id: 'CAPACITY-COMMUNITY', domainId: 'capacity', capability: 'Community of practice', shortLabel: 'Governance community',
    prompt: 'How effectively does the organization sustain communities of practice and cross-functional knowledge sharing?',
    baseline: false, weight: 0.8, criticality: 'CONTEXTUAL', defaultTarget: 3,
    maturityStatements: standardScale('governance community and knowledge sharing'),
    evidenceExamples: ['Community calendar', 'Knowledge base', 'Learning-circle outputs'],
    recommendedAction: 'Create a durable community of practice with reusable guidance and lessons learned.',
    dataNexusAction: 'Capture approved governance patterns and lessons in the knowledge layer.',
    provenance: broadbandProvenance,
  },
  {
    id: 'CAPACITY-INVESTMENT', domainId: 'capacity', capability: 'Sustainable investment', shortLabel: 'Governance investment',
    prompt: 'How reliably are financial, technical, and human resources committed to governance and stewardship over time?',
    baseline: true, weight: 1.0, criticality: 'HIGH', defaultTarget: 3,
    maturityStatements: standardScale('sustainable governance investment'),
    evidenceExamples: ['Budget', 'Headcount plan', 'Roadmap', 'Capacity plan'],
    recommendedAction: 'Tie governance investment to target maturity and prioritized risk reduction.',
    dataNexusAction: 'Translate maturity gaps into a prioritized, owner-assigned improvement roadmap.',
    provenance: broadbandProvenance,
  },
]

export function questionApplies(question: MaturityQuestion, profile: OrganizationAssessmentProfile) {
  return (question.applicability ?? []).every(rule => profile[rule.key] === rule.equals)
}

export function questionsForProfile(profile: OrganizationAssessmentProfile, baselineOnly = false) {
  return GOVERNANCE_MATURITY_QUESTIONS.filter(question => (!baselineOnly || question.baseline) && questionApplies(question, profile))
}
