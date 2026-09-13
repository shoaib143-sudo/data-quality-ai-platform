import type { PersonaSlug } from './personas'

export type PersonaAcceptanceTaskMode = 'READ' | 'MUTATE'

export type PersonaAcceptanceTask = {
  id: string
  label: string
  route: string
  mode: PersonaAcceptanceTaskMode
  requiredCapability?: string
  expectedEvidence: string
}

export const personaAcceptanceTasks: Record<PersonaSlug, readonly PersonaAcceptanceTask[]> = {
  'senior-leadership': [
    { id: 'enterprise-trust', label: 'Review enterprise trust and governed data exposure', route: '/catalog', mode: 'READ', requiredCapability: 'catalog.read', expectedEvidence: 'Governed catalog and trust context are visible without mutation controls.' },
    { id: 'material-risks', label: 'Inspect material governance risks and issues', route: '/issues', mode: 'READ', expectedEvidence: 'Material issue state, severity and accountability are visible.' },
    { id: 'data-confidence', label: 'Review enterprise data confidence', route: '/data-quality', mode: 'READ', requiredCapability: 'quality.read', expectedEvidence: 'Current quality evidence is visible without execution authority.' },
    { id: 'executive-reports', label: 'Review governance reports and outcomes', route: '/reports', mode: 'READ', requiredCapability: 'report.export', expectedEvidence: 'Governance reporting is available in the selected governed project context.' },
    { id: 'accountability-evidence', label: 'Review ownership and stewardship evidence', route: '/stewardship', mode: 'READ', expectedEvidence: 'Coverage and assignment evidence are visible while assignment/revocation controls remain hidden.' },
  ],
  'business-user': [
    { id: 'find-data', label: 'Find governed data for a business need', route: '/catalog', mode: 'READ', requiredCapability: 'catalog.read', expectedEvidence: 'Searchable governed data and trust indicators are visible.' },
    { id: 'understand-meaning', label: 'Understand business meaning through glossary', route: '/glossary', mode: 'READ', requiredCapability: 'glossary.read', expectedEvidence: 'Approved business terms and mappings are visible.' },
    { id: 'trusted-data', label: 'Identify trusted or certified data', route: '/catalog?q=CERTIFIED', mode: 'READ', requiredCapability: 'catalog.read', expectedEvidence: 'Trust/certification context can be inspected without governance mutation authority.' },
    { id: 'known-issues', label: 'Review known issues before using data', route: '/issues', mode: 'READ', expectedEvidence: 'Known issue state and impact context are visible.' },
  ],
  'data-owner': [
    { id: 'owned-domain', label: 'Review governed data under business ownership', route: '/catalog', mode: 'READ', requiredCapability: 'catalog.read', expectedEvidence: 'Owned-domain catalog context and trust state are visible.' },
    { id: 'quality-decisions', label: 'Review and manage quality controls and exceptions', route: '/data-quality', mode: 'MUTATE', requiredCapability: 'quality.manage', expectedEvidence: 'Governed quality actions are available and persist evidence.' },
    { id: 'certification-decision', label: 'Review and decide certification requests', route: '/stewardship', mode: 'MUTATE', requiredCapability: 'certification.review', expectedEvidence: 'Certification decisions preserve review evidence and status history.' },
    { id: 'lineage-impact', label: 'Assess lineage and downstream impact', route: '/lineage', mode: 'READ', requiredCapability: 'lineage.read', expectedEvidence: 'Impact context is visible from governed lineage evidence.' },
    { id: 'owner-reporting', label: 'Review domain reporting and remediation progress', route: '/reports', mode: 'READ', requiredCapability: 'report.export', expectedEvidence: 'Reports reflect the selected governed project, not an arbitrary default.' },
  ],
  'data-product-owner': [
    { id: 'product-trust', label: 'Review data product trust and service condition', route: '/catalog', mode: 'READ', requiredCapability: 'catalog.read', expectedEvidence: 'Product-facing catalog evidence and trust state are visible.' },
    { id: 'product-quality', label: 'Review and manage product quality expectations', route: '/data-quality', mode: 'MUTATE', requiredCapability: 'quality.manage', expectedEvidence: 'Quality management actions are available only where applicable.' },
    { id: 'product-certification', label: 'Request or review data product certification', route: '/stewardship', mode: 'MUTATE', requiredCapability: 'certification.request', expectedEvidence: 'Certification request state is persisted separately from stewardship assignment.' },
    { id: 'consumer-impact', label: 'Assess lineage and consumer impact', route: '/lineage', mode: 'READ', requiredCapability: 'lineage.read', expectedEvidence: 'Downstream product impact is visible from governed lineage.' },
    { id: 'product-issues', label: 'Manage consumer-impacting issues', route: '/issues', mode: 'MUTATE', requiredCapability: 'issues.manage', expectedEvidence: 'Issue state changes preserve governance evidence.' },
  ],
  'data-steward': [
    { id: 'stewardship-triage', label: 'Triage ownership and stewardship work', route: '/stewardship', mode: 'MUTATE', requiredCapability: 'stewardship.manage', expectedEvidence: 'Assignments and revocations are available only with stewardship authority and preserve history.' },
    { id: 'quality-followup', label: 'Investigate and execute applicable quality checks', route: '/data-quality', mode: 'MUTATE', requiredCapability: 'quality.execute', expectedEvidence: 'Execution is available only when applicable enabled controls exist.' },
    { id: 'glossary-curation', label: 'Curate governed business terminology', route: '/glossary', mode: 'MUTATE', requiredCapability: 'glossary.manage', expectedEvidence: 'Draft/version/mapping changes preserve semantic governance evidence.' },
    { id: 'classification-review', label: 'Review data classifications', route: '/classification', mode: 'MUTATE', requiredCapability: 'classification.review', expectedEvidence: 'Classification review is available without granting policy approval authority.' },
    { id: 'steward-issues', label: 'Investigate and coordinate governance issues', route: '/issues', mode: 'MUTATE', requiredCapability: 'issues.manage', expectedEvidence: 'Issue comments/state/evidence reflect the stewardship investigation.' },
  ],
  'data-governance-specialist': [
    { id: 'governed-data', label: 'Review governed-data coverage and maturity', route: '/catalog', mode: 'READ', requiredCapability: 'catalog.read', expectedEvidence: 'Governance coverage can be assessed across governed data.' },
    { id: 'policy-approval', label: 'Review classifications and approve handling policy', route: '/classification', mode: 'MUTATE', requiredCapability: 'policy.approve', expectedEvidence: 'Handling policy creation/approval is distinct from classification review and is audited.' },
    { id: 'ownership-program', label: 'Manage ownership and stewardship coverage', route: '/stewardship', mode: 'MUTATE', requiredCapability: 'stewardship.manage', expectedEvidence: 'Ownership/stewardship changes preserve append-only evidence.' },
    { id: 'audit-evidence', label: 'Review governance audit evidence', route: '/audit', mode: 'READ', requiredCapability: 'audit.read', expectedEvidence: 'Governance actions can be traced to durable audit evidence.' },
    { id: 'governance-reporting', label: 'Review governance programme reporting', route: '/reports', mode: 'READ', requiredCapability: 'report.export', expectedEvidence: 'Governance maturity and progress evidence are available.' },
  ],
  'compliance-risk-officer': [
    { id: 'regulatory-risk', label: 'Review regulatory and governance risks', route: '/issues', mode: 'MUTATE', requiredCapability: 'issues.manage', expectedEvidence: 'Risk/issue review can be progressed with accountable evidence.' },
    { id: 'control-evidence', label: 'Inspect governed quality/control evidence', route: '/data-quality/rules', mode: 'READ', requiredCapability: 'quality.read', expectedEvidence: 'Control/rule evidence is visible without fabricating control effectiveness.' },
    { id: 'policy-approval', label: 'Approve handling policy where authorized', route: '/classification', mode: 'MUTATE', requiredCapability: 'policy.approve', expectedEvidence: 'Policy decision is separated from classification observation and is audited.' },
    { id: 'compliance-audit', label: 'Review audit evidence readiness', route: '/audit', mode: 'READ', requiredCapability: 'audit.read', expectedEvidence: 'Evidence trail supports regulatory review.' },
    { id: 'compliance-report', label: 'Review compliance reporting', route: '/reports', mode: 'READ', requiredCapability: 'report.export', expectedEvidence: 'Reports reflect governed evidence and current project context.' },
  ],
  'privacy-security-officer': [
    { id: 'sensitive-data', label: 'Review sensitive data inventory and privacy context', route: '/classification-privacy', mode: 'READ', requiredCapability: 'classification.review', expectedEvidence: 'Sensitive-data review is scoped to the selected project.' },
    { id: 'classification-review', label: 'Review and decide data classifications', route: '/classification', mode: 'MUTATE', requiredCapability: 'classification.review', expectedEvidence: 'Classification decisions remain separate from policy approval.' },
    { id: 'handling-policy', label: 'Approve privacy/security handling policy', route: '/classification', mode: 'MUTATE', requiredCapability: 'policy.approve', expectedEvidence: 'Policy creation/approval requires policy authority and produces audit evidence.' },
    { id: 'privacy-risk', label: 'Investigate privacy/security issues', route: '/issues', mode: 'MUTATE', requiredCapability: 'issues.manage', expectedEvidence: 'Issue state and remediation evidence are visible and governed.' },
    { id: 'privacy-impact', label: 'Assess lineage impact for sensitive data', route: '/lineage', mode: 'READ', requiredCapability: 'lineage.read', expectedEvidence: 'Downstream impact is visible from governed lineage evidence.' },
  ],
  'data-governance-admin': [
    { id: 'platform-health', label: 'Monitor governance job health', route: '/monitoring', mode: 'READ', requiredCapability: 'observability.read', expectedEvidence: 'Recorded job state and degraded conditions are visible without fabricating execution state.' },
    { id: 'connections', label: 'Manage governed source connections', route: '/datasets', mode: 'MUTATE', requiredCapability: 'source.manage', expectedEvidence: 'Source configuration changes are authorized and auditable.' },
    { id: 'governance-workflows', label: 'Operate governance workflows and stewardship configuration', route: '/stewardship', mode: 'MUTATE', requiredCapability: 'stewardship.manage', expectedEvidence: 'Governance assignments use exact project capability checks.' },
    { id: 'schedules', label: 'Manage project-scoped schedules', route: '/schedules', mode: 'MUTATE', requiredCapability: 'schedule.manage', expectedEvidence: 'Schedule reads and writes remain project-scoped and authorized.' },
    { id: 'admin-audit', label: 'Review governance audit trail', route: '/audit', mode: 'READ', requiredCapability: 'audit.read', expectedEvidence: 'Operational changes are traceable in governance audit evidence.' },
  ],
  'data-custodian': [
    { id: 'source-health', label: 'Manage source connectivity and technical readiness', route: '/datasets', mode: 'MUTATE', requiredCapability: 'source.manage', expectedEvidence: 'Source changes remain project-scoped and operationally evidenced.' },
    { id: 'profiling', label: 'Execute profiling for technical diagnosis', route: '/profiling/explorer', mode: 'MUTATE', requiredCapability: 'profiling.execute', expectedEvidence: 'Profiling produces durable run evidence and governed findings.' },
    { id: 'quality-execution', label: 'Execute applicable quality controls', route: '/data-quality', mode: 'MUTATE', requiredCapability: 'quality.execute', expectedEvidence: 'Only applicable enabled controls can execute.' },
    { id: 'observability', label: 'Manage observability and technical incidents', route: '/observability', mode: 'MUTATE', requiredCapability: 'observability.manage', expectedEvidence: 'Operational incidents and remediation state are persisted.' },
    { id: 'technical-lineage', label: 'Inspect and manage technical lineage', route: '/lineage', mode: 'MUTATE', requiredCapability: 'lineage.manage', expectedEvidence: 'Lineage changes use governed write boundaries and preserve source truth.' },
  ],
  'source-system-owner': [
    { id: 'source-reliability', label: 'Manage upstream source reliability', route: '/datasets', mode: 'MUTATE', requiredCapability: 'source.manage', expectedEvidence: 'Source health/configuration changes are authorized and project-scoped.' },
    { id: 'source-observability', label: 'Investigate upstream operational signals', route: '/observability', mode: 'MUTATE', requiredCapability: 'observability.manage', expectedEvidence: 'Operational evidence is available for source defects.' },
    { id: 'source-issues', label: 'Manage source-related data issues', route: '/issues', mode: 'MUTATE', requiredCapability: 'issues.manage', expectedEvidence: 'Issue remediation retains accountable state and evidence.' },
    { id: 'downstream-impact', label: 'Assess downstream impact of source defects', route: '/lineage', mode: 'READ', requiredCapability: 'lineage.read', expectedEvidence: 'Downstream consumers and impacted assets are visible.' },
    { id: 'source-profiling', label: 'Run profiling evidence for source diagnosis', route: '/profiling/explorer', mode: 'MUTATE', requiredCapability: 'profiling.execute', expectedEvidence: 'Profiling evidence supports upstream remediation decisions.' },
  ],
  'metadata-analyst': [
    { id: 'catalog-curation', label: 'Curate catalog metadata', route: '/catalog', mode: 'MUTATE', requiredCapability: 'catalog.update', expectedEvidence: 'Metadata changes are governed and project-scoped.' },
    { id: 'glossary-curation', label: 'Curate business glossary semantics', route: '/glossary', mode: 'MUTATE', requiredCapability: 'glossary.manage', expectedEvidence: 'Versioned terms and mappings preserve semantic history.' },
    { id: 'metadata-classification', label: 'Review classification metadata', route: '/classification', mode: 'MUTATE', requiredCapability: 'classification.review', expectedEvidence: 'Classification review does not imply handling-policy approval.' },
    { id: 'metadata-lineage', label: 'Inspect lineage completeness and relationships', route: '/lineage', mode: 'READ', requiredCapability: 'lineage.read', expectedEvidence: 'Governed lineage supports metadata completeness analysis.' },
    { id: 'metadata-issues', label: 'Manage metadata quality issues', route: '/issues', mode: 'MUTATE', requiredCapability: 'issues.manage', expectedEvidence: 'Metadata gaps can be tracked through governed issues.' },
  ],
  'data-quality-analyst': [
    { id: 'quality-analysis', label: 'Analyze quality dimensions and findings', route: '/data-quality', mode: 'READ', requiredCapability: 'quality.read', expectedEvidence: 'Persisted profiling/control evidence supports quality analysis.' },
    { id: 'quality-execution', label: 'Execute applicable quality controls', route: '/data-quality', mode: 'MUTATE', requiredCapability: 'quality.execute', expectedEvidence: 'Execution fails closed when no applicable enabled controls exist.' },
    { id: 'profiling-investigation', label: 'Run profiling for root-cause investigation', route: '/profiling/explorer', mode: 'MUTATE', requiredCapability: 'profiling.execute', expectedEvidence: 'Profiling produces durable evidence for root-cause analysis.' },
    { id: 'quality-issues', label: 'Manage quality remediation issues', route: '/issues', mode: 'MUTATE', requiredCapability: 'issues.manage', expectedEvidence: 'Issue lifecycle records remediation and verification evidence.' },
    { id: 'quality-observability', label: 'Inspect quality-related operational signals', route: '/observability', mode: 'READ', requiredCapability: 'observability.read', expectedEvidence: 'Operational signals can be correlated with quality findings.' },
    { id: 'quality-reporting', label: 'Review quality trend reporting', route: '/reports', mode: 'READ', requiredCapability: 'report.export', expectedEvidence: 'Reports show governed quality trends in explicit project context.' },
  ],
}
