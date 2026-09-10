export const personaSlugs = [
  'senior-leadership',
  'business-user',
  'data-owner',
  'data-product-owner',
  'data-steward',
  'data-governance-specialist',
  'compliance-risk-officer',
  'privacy-security-officer',
  'data-governance-admin',
  'data-custodian',
  'source-system-owner',
  'metadata-analyst',
  'data-quality-analyst',
] as const

export type PersonaSlug = (typeof personaSlugs)[number]

export type PersonaDefinition = {
  slug: PersonaSlug
  title: string
  strapline: string
  focus: string
  primaryQuestion: string
  nav: { label: string; href: string }[]
  labels: {
    confidence: string
    exposure: string
    attention: string
    progress: string
    changes: string
    action: string
  }
}

const common = {
  confidence: 'Data confidence',
  exposure: 'Data exposure',
  attention: 'Needs attention',
  progress: 'Progress',
  changes: 'What changed',
  action: 'Recommended next action',
}

export const personas: Record<PersonaSlug, PersonaDefinition> = {
  'senior-leadership': {
    slug: 'senior-leadership',
    title: 'Senior Leadership',
    strapline: 'Enterprise view of trust, material risk, impact, accountability and outcomes.',
    focus: 'Enterprise trust and material business exposure',
    primaryQuestion: 'Can we trust our critical data, where are we exposed, and are we improving?',
    nav: [
      { label: 'Overview', href: '/home/senior-leadership' },
      { label: 'Business Areas', href: '/catalog' },
      { label: 'Risks & Issues', href: '/issues' },
      { label: 'Data Confidence', href: '/data-quality' },
      { label: 'Reports', href: '/reports' },
      { label: 'Actions', href: '/stewardship' },
    ],
    labels: { ...common, confidence: 'Enterprise data confidence', exposure: 'Material risks', progress: 'Governance outcomes' },
  },
  'business-user': {
    slug: 'business-user',
    title: 'Business User',
    strapline: 'Find, understand and safely use trusted governed data.',
    focus: 'Trusted and understandable data for daily decisions',
    primaryQuestion: 'Can I find, understand and confidently use the data I need?',
    nav: [
      { label: 'Home', href: '/home/business-user' },
      { label: 'Search & Explore', href: '/catalog' },
      { label: 'Business Glossary', href: '/glossary' },
      { label: 'Trusted Data', href: '/catalog?q=CERTIFIED' },
      { label: 'Known Issues', href: '/issues' },
    ],
    labels: { ...common, confidence: 'Trusted data available', exposure: 'Known data concerns', attention: 'Use with caution', progress: 'Recently trusted' },
  },
  'data-owner': {
    slug: 'data-owner',
    title: 'Data Owner',
    strapline: 'Business accountability for data domains, critical data and risk decisions.',
    focus: 'Data domain accountability and risk decisions',
    primaryQuestion: 'Is the data I own under control, and what requires my decision?',
    nav: [
      { label: 'Home', href: '/home/data-owner' },
      { label: 'My Data Domains', href: '/catalog' },
      { label: 'Quality & Issues', href: '/data-quality' },
      { label: 'Approvals', href: '/stewardship' },
      { label: 'Lineage & Impact', href: '/lineage' },
      { label: 'Reports', href: '/reports' },
    ],
    labels: { ...common, confidence: 'Domain confidence', exposure: 'Critical data exposure', attention: 'Owner decisions required', progress: 'Remediation progress' },
  },
  'data-product-owner': {
    slug: 'data-product-owner',
    title: 'Data Product Owner',
    strapline: 'Deliver trusted data products with reliable service and clear consumer impact.',
    focus: 'Product trust, certification, SLA and consumer outcomes',
    primaryQuestion: 'Are my data products trusted, reliable and delivering value to consumers?',
    nav: [
      { label: 'Home', href: '/home/data-product-owner' },
      { label: 'Data Products', href: '/catalog' },
      { label: 'Quality', href: '/data-quality' },
      { label: 'Lineage', href: '/lineage' },
      { label: 'Issues', href: '/issues' },
      { label: 'Reports', href: '/reports' },
    ],
    labels: { ...common, confidence: 'Product trust', exposure: 'Products at risk', attention: 'Consumer-impacting issues', progress: 'Certification progress' },
  },
  'data-steward': {
    slug: 'data-steward',
    title: 'Data Steward',
    strapline: 'Investigate, curate, coordinate and improve governed data every day.',
    focus: 'Operational stewardship and day-to-day governance',
    primaryQuestion: 'What requires my attention, investigation or remediation today?',
    nav: [
      { label: 'Home', href: '/home/data-steward' },
      { label: 'My Tasks', href: '/stewardship' },
      { label: 'Data Quality', href: '/data-quality' },
      { label: 'Metadata & Glossary', href: '/glossary' },
      { label: 'Classification', href: '/classification' },
      { label: 'Issues', href: '/issues' },
    ],
    labels: { ...common, confidence: 'Stewardship coverage', exposure: 'Open data issues', attention: 'My open tasks', progress: 'Tasks resolved' },
  },
  'data-governance-specialist': {
    slug: 'data-governance-specialist',
    title: 'Data Governance Specialist',
    strapline: 'Measure governance effectiveness, adoption, control coverage and maturity.',
    focus: 'Governance programme effectiveness and maturity',
    primaryQuestion: 'Is governance effective across the organisation and where are the gaps?',
    nav: [
      { label: 'Home', href: '/home/data-governance-specialist' },
      { label: 'Governed Data', href: '/catalog' },
      { label: 'Policies & Standards', href: '/classification' },
      { label: 'Ownership & Stewardship', href: '/stewardship' },
      { label: 'Audit Evidence', href: '/audit' },
      { label: 'Reports & Insights', href: '/reports' },
    ],
    labels: { ...common, confidence: 'Governance maturity', exposure: 'Governance gaps', attention: 'Areas requiring intervention', progress: 'Adoption progress' },
  },
  'compliance-risk-officer': {
    slug: 'compliance-risk-officer',
    title: 'Compliance & Risk Officer',
    strapline: 'Understand regulatory exposure, control effectiveness, exceptions and evidence readiness.',
    focus: 'Regulatory risk and control effectiveness',
    primaryQuestion: 'Where does data create regulatory or control exposure?',
    nav: [
      { label: 'Home', href: '/home/compliance-risk-officer' },
      { label: 'Risks', href: '/issues' },
      { label: 'Controls', href: '/data-quality/rules' },
      { label: 'Policies', href: '/classification' },
      { label: 'Audit Evidence', href: '/audit' },
      { label: 'Reports', href: '/reports' },
    ],
    labels: { ...common, confidence: 'Control confidence', exposure: 'Regulatory exposure', attention: 'Control breaches', progress: 'Control remediation' },
  },
  'privacy-security-officer': {
    slug: 'privacy-security-officer',
    title: 'Privacy & Security Officer',
    strapline: 'Protect sensitive data through classification, handling controls and impact visibility.',
    focus: 'Sensitive data, classification and privacy controls',
    primaryQuestion: 'Where is sensitive data exposed or insufficiently governed?',
    nav: [
      { label: 'Home', href: '/home/privacy-security-officer' },
      { label: 'Sensitive Data', href: '/classification-privacy' },
      { label: 'Classifications', href: '/classification' },
      { label: 'Privacy Risks', href: '/issues' },
      { label: 'Lineage & Impact', href: '/lineage' },
      { label: 'Audit', href: '/audit' },
    ],
    labels: { ...common, confidence: 'Protection coverage', exposure: 'Sensitive data exposure', attention: 'Privacy risks', progress: 'Classification coverage' },
  },
  'data-governance-admin': {
    slug: 'data-governance-admin',
    title: 'Data Governance Admin',
    strapline: 'Operate governance workflows, integrations and technical governance configuration.',
    focus: 'Governance platform health, workflow and configuration',
    primaryQuestion: 'Is DataNexus correctly configured and are governance operations running normally?',
    nav: [
      { label: 'Home', href: '/home/data-governance-admin' },
      { label: 'Platform Health', href: '/monitoring' },
      { label: 'Connections', href: '/datasets' },
      { label: 'Governance Workflows', href: '/stewardship' },
      { label: 'Schedules', href: '/schedules' },
      { label: 'Audit', href: '/audit' },
    ],
    labels: { ...common, confidence: 'Platform readiness', exposure: 'Operational alerts', attention: 'Failed or degraded jobs', progress: 'Workflow success' },
  },
  'data-custodian': {
    slug: 'data-custodian',
    title: 'Data Custodian / Technical Steward',
    strapline: 'Implement controls, monitor source health and resolve technical data issues.',
    focus: 'Technical control execution and source reliability',
    primaryQuestion: 'What technical issue is affecting governed data and what must be fixed?',
    nav: [
      { label: 'Home', href: '/home/data-custodian' },
      { label: 'Job Monitor', href: '/monitoring' },
      { label: 'Observability', href: '/observability' },
      { label: 'Lineage', href: '/lineage' },
      { label: 'Profiling', href: '/profiling/explorer' },
      { label: 'Sources', href: '/datasets' },
    ],
    labels: { ...common, confidence: 'Technical readiness', exposure: 'Source & pipeline issues', attention: 'Technical remediation', progress: 'Jobs recovered' },
  },
  'source-system-owner': {
    slug: 'source-system-owner',
    title: 'Source System / Application Owner',
    strapline: 'Improve upstream reliability and prevent recurring downstream defects.',
    focus: 'Source system quality and upstream remediation',
    primaryQuestion: 'What source defects are affecting downstream data consumers?',
    nav: [
      { label: 'Home', href: '/home/source-system-owner' },
      { label: 'Source Health', href: '/datasets' },
      { label: 'Observability', href: '/observability' },
      { label: 'Issues', href: '/issues' },
      { label: 'Downstream Impact', href: '/lineage' },
      { label: 'Profiling Evidence', href: '/profiling/explorer' },
    ],
    labels: { ...common, confidence: 'Source reliability', exposure: 'Downstream impact', attention: 'Source defects', progress: 'Defects resolved' },
  },
  'metadata-analyst': {
    slug: 'metadata-analyst',
    title: 'Metadata Analyst',
    strapline: 'Understand, catalogue and connect metadata across the governed data estate.',
    focus: 'Metadata completeness, meaning, ownership, classification and lineage',
    primaryQuestion: 'How complete, connected and understandable is our metadata, and where are the gaps?',
    nav: [
      { label: 'Home', href: '/home/metadata-analyst' },
      { label: 'Catalog', href: '/catalog' },
      { label: 'Business Glossary', href: '/glossary' },
      { label: 'Classification', href: '/classification' },
      { label: 'Lineage', href: '/lineage' },
      { label: 'Issues', href: '/issues' },
    ],
    labels: { ...common, confidence: 'Metadata coverage', exposure: 'Metadata gaps', attention: 'Metadata requiring attention', progress: 'Metadata completeness' },
  },
  'data-quality-analyst': {
    slug: 'data-quality-analyst',
    title: 'Data Quality Analyst',
    strapline: 'Analyze quality, investigate root causes and improve trusted data outcomes.',
    focus: 'Data quality dimensions, findings, trends and root-cause analysis',
    primaryQuestion: 'Where is data quality deteriorating, why, and what should improve first?',
    nav: [
      { label: 'Home', href: '/home/data-quality-analyst' },
      { label: 'Data Quality', href: '/data-quality' },
      { label: 'Profiling Explorer', href: '/profiling/explorer' },
      { label: 'Issues', href: '/issues' },
      { label: 'Observability', href: '/observability' },
      { label: 'Reports', href: '/reports' },
    ],
    labels: { ...common, confidence: 'Quality score', exposure: 'Quality risk', attention: 'Findings requiring investigation', progress: 'Quality improvement' },
  },
}

export function isPersonaSlug(value: string): value is PersonaSlug {
  return personaSlugs.includes(value as PersonaSlug)
}
