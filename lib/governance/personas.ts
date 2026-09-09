export const personaSlugs = [
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
    strapline: 'Enterprise view. Risks, impact, accountability and outcomes.',
    focus: 'Enterprise trust and material business exposure',
    primaryQuestion: 'Can we trust our critical data, where are we exposed, and are we improving?',
    nav: [
      { label: 'Overview', href: '/home/senior-leadership' },
      { label: 'Business Areas', href: '/catalog' },
      { label: 'Risks & Issues', href: '/issues' },
      { label: 'Reports', href: '/reports' },
      { label: 'Governance', href: '/dashboard' },
    ],
    labels: { ...common, confidence: 'Enterprise data confidence', exposure: 'Material risks', progress: 'Governance outcomes' },
  },
  'business-user': {
    slug: 'business-user',
    title: 'Business User',
    strapline: 'Find, understand, use and trust.',
    focus: 'Trusted and understandable data for daily decisions',
    primaryQuestion: 'Can I find, understand and confidently use the data I need?',
    nav: [
      { label: 'Home', href: '/home/business-user' },
      { label: 'Search & Explore', href: '/catalog' },
      { label: 'Business Glossary', href: '/glossary' },
      { label: 'Trusted Data', href: '/datasets' },
      { label: 'My Requests', href: '/issues' },
    ],
    labels: { ...common, confidence: 'Trusted data available', exposure: 'Known data concerns', attention: 'Use with caution', progress: 'Recently trusted' },
  },
  'data-owner': {
    slug: 'data-owner',
    title: 'Data Owner',
    strapline: 'Accountability, control and decisions.',
    focus: 'Data domain accountability and risk decisions',
    primaryQuestion: 'Is the data I own under control, and what requires my decision?',
    nav: [
      { label: 'Home', href: '/home/data-owner' },
      { label: 'My Data Domains', href: '/catalog' },
      { label: 'Quality & Issues', href: '/data-quality' },
      { label: 'Approvals', href: '/stewardship' },
      { label: 'Lineage & Impact', href: '/lineage' },
    ],
    labels: { ...common, confidence: 'Domain confidence', exposure: 'Critical data exposure', attention: 'Owner decisions required', progress: 'Remediation progress' },
  },
  'data-steward': {
    slug: 'data-steward',
    title: 'Data Steward',
    strapline: 'Investigate, resolve, maintain and improve.',
    focus: 'Operational stewardship and day-to-day governance',
    primaryQuestion: 'What requires my attention, investigation or remediation today?',
    nav: [
      { label: 'Home', href: '/home/data-steward' },
      { label: 'My Tasks', href: '/stewardship' },
      { label: 'Data Quality', href: '/data-quality' },
      { label: 'Metadata & Glossary', href: '/glossary' },
      { label: 'Issues', href: '/issues' },
    ],
    labels: { ...common, confidence: 'Stewardship coverage', exposure: 'Open data issues', attention: 'My open tasks', progress: 'Tasks resolved' },
  },
  'data-governance-admin': {
    slug: 'data-governance-admin',
    title: 'Data Governance Admin',
    strapline: 'Configure, monitor and keep DataNexus operating.',
    focus: 'Platform health, access, workflow and configuration',
    primaryQuestion: 'Is DataNexus correctly configured, secure and operating normally?',
    nav: [
      { label: 'Home', href: '/home/data-governance-admin' },
      { label: 'Platform Health', href: '/monitoring' },
      { label: 'Connections', href: '/datasets' },
      { label: 'Roles & Permissions', href: '/admin/project-roles' },
      { label: 'Audit', href: '/audit' },
    ],
    labels: { ...common, confidence: 'Platform readiness', exposure: 'Operational alerts', attention: 'Failed or degraded jobs', progress: 'Workflow success' },
  },
  'data-governance-specialist': {
    slug: 'data-governance-specialist',
    title: 'Data Governance Specialist',
    strapline: 'Drive adoption, measure effectiveness and improve.',
    focus: 'Governance programme effectiveness and maturity',
    primaryQuestion: 'Is governance effective across the organisation and where are the gaps?',
    nav: [
      { label: 'Home', href: '/home/data-governance-specialist' },
      { label: 'Governance Overview', href: '/dashboard' },
      { label: 'Policies & Standards', href: '/classification' },
      { label: 'Ownership & Stewardship', href: '/stewardship' },
      { label: 'Reports & Insights', href: '/reports' },
    ],
    labels: { ...common, confidence: 'Governance maturity', exposure: 'Governance gaps', attention: 'Areas requiring intervention', progress: 'Adoption progress' },
  },
  'compliance-risk-officer': {
    slug: 'compliance-risk-officer',
    title: 'Compliance & Risk Officer',
    strapline: 'Control exposure and maintain audit readiness.',
    focus: 'Regulatory risk and control effectiveness',
    primaryQuestion: 'Where does data create regulatory or control exposure?',
    nav: [
      { label: 'Home', href: '/home/compliance-risk-officer' },
      { label: 'Risks', href: '/issues' },
      { label: 'Controls', href: '/data-quality/rules' },
      { label: 'Policies', href: '/classification' },
      { label: 'Audit Evidence', href: '/audit' },
    ],
    labels: { ...common, confidence: 'Control confidence', exposure: 'Regulatory exposure', attention: 'Control breaches', progress: 'Control remediation' },
  },
  'privacy-security-officer': {
    slug: 'privacy-security-officer',
    title: 'Privacy & Security Officer',
    strapline: 'Protect sensitive data and enforce appropriate handling.',
    focus: 'Sensitive data, classification and privacy controls',
    primaryQuestion: 'Where is sensitive data exposed or insufficiently governed?',
    nav: [
      { label: 'Home', href: '/home/privacy-security-officer' },
      { label: 'Sensitive Data', href: '/classification-privacy' },
      { label: 'Classifications', href: '/classification' },
      { label: 'Access & Roles', href: '/admin/project-roles' },
      { label: 'Audit', href: '/audit' },
    ],
    labels: { ...common, confidence: 'Protection coverage', exposure: 'Sensitive data exposure', attention: 'Privacy risks', progress: 'Classification coverage' },
  },
  'data-custodian': {
    slug: 'data-custodian',
    title: 'Data Custodian / Technical Steward',
    strapline: 'Implement controls and resolve technical data issues.',
    focus: 'Technical control execution and source reliability',
    primaryQuestion: 'What technical issue is affecting governed data and what must be fixed?',
    nav: [
      { label: 'Home', href: '/home/data-custodian' },
      { label: 'Job Monitor', href: '/monitoring' },
      { label: 'Observability', href: '/observability' },
      { label: 'Lineage', href: '/lineage' },
      { label: 'Profiling', href: '/profiling/explorer' },
    ],
    labels: { ...common, confidence: 'Technical readiness', exposure: 'Source & pipeline issues', attention: 'Technical remediation', progress: 'Jobs recovered' },
  },
  'data-product-owner': {
    slug: 'data-product-owner',
    title: 'Data Product Owner',
    strapline: 'Deliver trusted data products fit for business use.',
    focus: 'Product trust, certification, SLA and consumer outcomes',
    primaryQuestion: 'Are my data products trusted, reliable and delivering value to consumers?',
    nav: [
      { label: 'Home', href: '/home/data-product-owner' },
      { label: 'Data Products', href: '/catalog' },
      { label: 'Quality', href: '/data-quality' },
      { label: 'Lineage', href: '/lineage' },
      { label: 'Issues', href: '/issues' },
    ],
    labels: { ...common, confidence: 'Product trust', exposure: 'Products at risk', attention: 'Consumer-impacting issues', progress: 'Certification progress' },
  },
  'source-system-owner': {
    slug: 'source-system-owner',
    title: 'Source System / Application Owner',
    strapline: 'Improve upstream reliability and prevent recurring defects.',
    focus: 'Source system quality and upstream remediation',
    primaryQuestion: 'What source defects are affecting downstream data consumers?',
    nav: [
      { label: 'Home', href: '/home/source-system-owner' },
      { label: 'Source Health', href: '/datasets' },
      { label: 'Observability', href: '/observability' },
      { label: 'Issues', href: '/issues' },
      { label: 'Downstream Impact', href: '/lineage' },
    ],
    labels: { ...common, confidence: 'Source reliability', exposure: 'Downstream impact', attention: 'Source defects', progress: 'Defects resolved' },
  },
}

export function isPersonaSlug(value: string): value is PersonaSlug {
  return personaSlugs.includes(value as PersonaSlug)
}
