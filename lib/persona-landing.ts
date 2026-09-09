export const personaKeys = [
  'senior-leadership',
  'business-user',
  'data-owner',
  'data-steward',
  'data-governance-admin',
  'data-governance-specialist',
  'compliance-risk-officer',
  'privacy-security-officer',
  'data-custodian',
  'data-product-owner',
  'source-system-owner',
] as const

export type PersonaKey = (typeof personaKeys)[number]

export type PersonaDefinition = {
  key: PersonaKey
  label: string
  strapline: string
  purpose: string
  nav: Array<{ label: string; href: string }>
  metricKeys: string[]
  attentionTitle: string
  outcomeTitle: string
}

export const personas: Record<PersonaKey, PersonaDefinition> = {
  'senior-leadership': {
    key: 'senior-leadership',
    label: 'Senior Leadership',
    strapline: 'Trust. Risk. Impact. Outcomes.',
    purpose: 'Understand enterprise data confidence, material exposure and whether governance outcomes are improving.',
    nav: [
      { label: 'Overview', href: '/home' },
      { label: 'Business Areas', href: '/catalog' },
      { label: 'Risks & Issues', href: '/issues' },
      { label: 'Reports', href: '/reports' },
    ],
    metricKeys: ['enterpriseConfidence', 'materialIssues', 'governanceCoverage', 'controlPassRate'],
    attentionTitle: 'What changed and needs leadership attention',
    outcomeTitle: 'Enterprise governance outcomes',
  },
  'business-user': {
    key: 'business-user',
    label: 'Business User',
    strapline: 'Find. Understand. Use. Trust.',
    purpose: 'Find trusted data, understand its meaning and see known limitations before using it.',
    nav: [
      { label: 'Home', href: '/home' },
      { label: 'Search & Explore', href: '/catalog' },
      { label: 'Business Glossary', href: '/glossary' },
      { label: 'Reports', href: '/reports' },
    ],
    metricKeys: ['trustedDatasets', 'governanceCoverage', 'openIssues', 'activeSources'],
    attentionTitle: 'Known data issues that may affect use',
    outcomeTitle: 'Trusted data available to you',
  },
  'data-owner': {
    key: 'data-owner',
    label: 'Data Owner',
    strapline: 'Accountability. Control. Decisions.',
    purpose: 'See whether accountable data is within tolerance and what needs a decision, approval or escalation.',
    nav: [
      { label: 'My Data', href: '/catalog' },
      { label: 'Quality & Issues', href: '/data-quality' },
      { label: 'Stewardship', href: '/stewardship' },
      { label: 'Lineage & Impact', href: '/lineage' },
    ],
    metricKeys: ['enterpriseConfidence', 'highIssues', 'openIssues', 'governanceCoverage'],
    attentionTitle: 'Items requiring owner attention',
    outcomeTitle: 'Accountability and control',
  },
  'data-steward': {
    key: 'data-steward',
    label: 'Data Steward',
    strapline: 'Investigate. Resolve. Maintain. Improve.',
    purpose: 'Focus on day-to-day stewardship, data quality investigation, metadata and remediation work.',
    nav: [
      { label: 'My Work', href: '/stewardship' },
      { label: 'Data Quality', href: '/data-quality' },
      { label: 'Metadata & Glossary', href: '/glossary' },
      { label: 'Issues', href: '/issues' },
    ],
    metricKeys: ['openIssues', 'highIssues', 'failedControls', 'governanceCoverage'],
    attentionTitle: 'Stewardship work requiring attention',
    outcomeTitle: 'Stewardship progress',
  },
  'data-governance-admin': {
    key: 'data-governance-admin',
    label: 'Data Governance Admin',
    strapline: 'Configure. Monitor. Secure. Operate.',
    purpose: 'Keep DataNexus configured, connected, authorized and operational.',
    nav: [
      { label: 'Platform Health', href: '/platform' },
      { label: 'Connections', href: '/datasets' },
      { label: 'Users & Roles', href: '/admin/project-roles' },
      { label: 'Audit', href: '/audit' },
    ],
    metricKeys: ['activeSources', 'failedJobs', 'openAlerts', 'governanceCoverage'],
    attentionTitle: 'Platform and configuration attention',
    outcomeTitle: 'Platform operating health',
  },
  'data-governance-specialist': {
    key: 'data-governance-specialist',
    label: 'Data Governance Specialist',
    strapline: 'Adopt. Measure. Govern. Improve.',
    purpose: 'Measure governance coverage, policy effectiveness, ownership and areas requiring programme intervention.',
    nav: [
      { label: 'Governance Overview', href: '/home' },
      { label: 'Policies & Standards', href: '/classification' },
      { label: 'Ownership & Stewardship', href: '/stewardship' },
      { label: 'Audit & Evidence', href: '/audit' },
    ],
    metricKeys: ['governanceCoverage', 'controlPassRate', 'openIssues', 'domainCount'],
    attentionTitle: 'Governance gaps requiring intervention',
    outcomeTitle: 'Governance programme effectiveness',
  },
  'compliance-risk-officer': {
    key: 'compliance-risk-officer',
    label: 'Compliance & Risk Officer',
    strapline: 'Exposure. Controls. Evidence. Assurance.',
    purpose: 'Understand regulatory exposure, control failures and whether governance evidence supports assurance.',
    nav: [
      { label: 'Risk Overview', href: '/issues' },
      { label: 'Controls', href: '/data-quality/rules' },
      { label: 'Audit Evidence', href: '/audit' },
      { label: 'Reports', href: '/reports' },
    ],
    metricKeys: ['materialIssues', 'failedControls', 'controlPassRate', 'openAlerts'],
    attentionTitle: 'Material compliance and control exposure',
    outcomeTitle: 'Assurance and control effectiveness',
  },
  'privacy-security-officer': {
    key: 'privacy-security-officer',
    label: 'Privacy & Security Officer',
    strapline: 'Discover. Protect. Control. Assure.',
    purpose: 'See sensitive-data exposure, classification coverage, access concerns and privacy-related findings.',
    nav: [
      { label: 'Sensitive Data', href: '/classification-privacy' },
      { label: 'Classification', href: '/classification' },
      { label: 'Audit', href: '/audit' },
      { label: 'Issues', href: '/issues' },
    ],
    metricKeys: ['sensitiveFindings', 'openIssues', 'governanceCoverage', 'openAlerts'],
    attentionTitle: 'Privacy and sensitive-data attention',
    outcomeTitle: 'Protection and classification coverage',
  },
  'data-custodian': {
    key: 'data-custodian',
    label: 'Data Custodian / Technical Steward',
    strapline: 'Operate. Protect. Remediate. Trace.',
    purpose: 'Monitor source health, technical defects, lineage dependencies and remediation work.',
    nav: [
      { label: 'Sources', href: '/datasets' },
      { label: 'Monitoring', href: '/monitoring' },
      { label: 'Lineage', href: '/lineage' },
      { label: 'Issues', href: '/issues' },
    ],
    metricKeys: ['activeSources', 'failedJobs', 'openAlerts', 'schemaDriftAlerts'],
    attentionTitle: 'Technical governance attention',
    outcomeTitle: 'Technical reliability and remediation',
  },
  'data-product-owner': {
    key: 'data-product-owner',
    label: 'Data Product Owner',
    strapline: 'Trust. Service. Adoption. Value.',
    purpose: 'Understand whether governed data products are trusted, available and fit for their consumers.',
    nav: [
      { label: 'Data Products', href: '/catalog' },
      { label: 'Quality', href: '/data-quality' },
      { label: 'Lineage', href: '/lineage' },
      { label: 'Reports', href: '/reports' },
    ],
    metricKeys: ['trustedDatasets', 'enterpriseConfidence', 'openIssues', 'activeSources'],
    attentionTitle: 'Data product trust and service attention',
    outcomeTitle: 'Product trust and consumption readiness',
  },
  'source-system-owner': {
    key: 'source-system-owner',
    label: 'Source System / Application Owner',
    strapline: 'Source. Reliability. Root Cause. Impact.',
    purpose: 'See source-system defects, recurring quality problems and downstream governance impact.',
    nav: [
      { label: 'Sources', href: '/datasets' },
      { label: 'Observability', href: '/observability' },
      { label: 'Lineage', href: '/lineage' },
      { label: 'Issues', href: '/issues' },
    ],
    metricKeys: ['activeSources', 'schemaDriftAlerts', 'failedJobs', 'openIssues'],
    attentionTitle: 'Source defects and downstream impact',
    outcomeTitle: 'Source reliability',
  },
}

export function isPersonaKey(value: string | undefined | null): value is PersonaKey {
  return !!value && (personaKeys as readonly string[]).includes(value)
}

export function personaFromRoleNames(roleNames: string[], organizationRole?: string | null): PersonaKey {
  const normalized = roleNames.map((value) => value.toLowerCase()).join(' ')
  const checks: Array<[RegExp, PersonaKey]> = [
    [/privacy|security/, 'privacy-security-officer'],
    [/compliance|risk/, 'compliance-risk-officer'],
    [/product owner/, 'data-product-owner'],
    [/source.*owner|application.*owner/, 'source-system-owner'],
    [/custodian|technical steward/, 'data-custodian'],
    [/governance.*specialist|governance lead/, 'data-governance-specialist'],
    [/data steward|steward/, 'data-steward'],
    [/data owner|domain owner/, 'data-owner'],
    [/senior|executive|leadership/, 'senior-leadership'],
    [/business user|consumer/, 'business-user'],
    [/admin/, 'data-governance-admin'],
  ]
  for (const [pattern, persona] of checks) if (pattern.test(normalized)) return persona
  if (organizationRole === 'OWNER') return 'senior-leadership'
  if (organizationRole === 'ADMIN') return 'data-governance-admin'
  return 'business-user'
}
