export const DASHBOARD_PERSONAS = [
  'senior_leadership',
  'business_user',
  'data_owner',
  'data_steward',
  'data_governance_admin',
  'data_governance_specialist',
  'compliance_risk_officer',
  'privacy_security_officer',
  'data_custodian',
  'data_product_owner',
  'source_system_owner',
] as const

export type DashboardPersona = (typeof DASHBOARD_PERSONAS)[number]

export type PersonaDefinition = {
  key: DashboardPersona
  label: string
  eyebrow: string
  purpose: string
  question: string
  primaryAction: { label: string; href: string }
  navigation: Array<{ label: string; href: string }>
}

export const PERSONA_DEFINITIONS: Record<DashboardPersona, PersonaDefinition> = {
  senior_leadership: {
    key: 'senior_leadership',
    label: 'Senior Leadership',
    eyebrow: 'Enterprise view',
    purpose: 'Trust, risk, impact and outcomes.',
    question: 'Can we trust our critical data, where are we exposed, and are we improving?',
    primaryAction: { label: 'Review material risks', href: '/issues' },
    navigation: [
      { label: 'Overview', href: '/dashboard' },
      { label: 'Business Areas', href: '/catalog' },
      { label: 'Risks & Issues', href: '/issues' },
      { label: 'Reports', href: '/reports' },
    ],
  },
  business_user: {
    key: 'business_user',
    label: 'Business User',
    eyebrow: 'Trusted data',
    purpose: 'Find, understand, use and trust.',
    question: 'Can I find, understand and confidently use the data I need?',
    primaryAction: { label: 'Find trusted data', href: '/catalog' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Search & Explore', href: '/catalog' },
      { label: 'Business Glossary', href: '/glossary' },
      { label: 'Reports', href: '/reports' },
      { label: 'Known Issues', href: '/issues' },
    ],
  },
  data_owner: {
    key: 'data_owner',
    label: 'Data Owner',
    eyebrow: 'Accountability',
    purpose: 'Control, decisions and business accountability.',
    question: 'Is the data I am accountable for under control, and what requires my decision?',
    primaryAction: { label: 'Review my issues', href: '/issues' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'My Data', href: '/stewardship' },
      { label: 'Quality & Issues', href: '/data-quality' },
      { label: 'Approvals', href: '/stewardship' },
      { label: 'Lineage & Impact', href: '/lineage' },
    ],
  },
  data_steward: {
    key: 'data_steward',
    label: 'Data Steward',
    eyebrow: 'Operational stewardship',
    purpose: 'Investigate, resolve, maintain and improve.',
    question: 'What requires my attention, investigation or remediation today?',
    primaryAction: { label: 'Open stewardship queue', href: '/stewardship' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Stewardship', href: '/stewardship' },
      { label: 'Data Quality', href: '/data-quality' },
      { label: 'Metadata & Glossary', href: '/glossary' },
      { label: 'Issues', href: '/issues' },
      { label: 'Classification', href: '/classification' },
    ],
  },
  data_governance_admin: {
    key: 'data_governance_admin',
    label: 'Data Governance Admin',
    eyebrow: 'Platform operations',
    purpose: 'Configure, monitor, secure and keep DataNexus running.',
    question: 'Is DataNexus correctly configured, secure and operating normally?',
    primaryAction: { label: 'Open administration', href: '/admin' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Administration', href: '/admin' },
      { label: 'Connections', href: '/datasets' },
      { label: 'Monitoring', href: '/monitoring' },
      { label: 'Audit', href: '/audit' },
      { label: 'Role Management', href: '/admin/project-roles' },
    ],
  },
  data_governance_specialist: {
    key: 'data_governance_specialist',
    label: 'Data Governance Specialist',
    eyebrow: 'Governance programme',
    purpose: 'Drive adoption, measure effectiveness and improve.',
    question: 'Is governance effective across the organisation, and where are the gaps?',
    primaryAction: { label: 'Review governance gaps', href: '/stewardship' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Governance Overview', href: '/catalog' },
      { label: 'Policies & Standards', href: '/classification' },
      { label: 'Ownership & Stewardship', href: '/stewardship' },
      { label: 'Risk & Compliance', href: '/issues' },
      { label: 'Reports', href: '/reports' },
    ],
  },
  compliance_risk_officer: {
    key: 'compliance_risk_officer',
    label: 'Compliance & Risk Officer',
    eyebrow: 'Risk oversight',
    purpose: 'Regulatory exposure, controls and audit readiness.',
    question: 'Which data risks, control failures or policy breaches require intervention?',
    primaryAction: { label: 'Review risk issues', href: '/issues' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Risks & Issues', href: '/issues' },
      { label: 'Policies & Controls', href: '/classification' },
      { label: 'Audit Evidence', href: '/audit' },
      { label: 'Reports', href: '/reports' },
    ],
  },
  privacy_security_officer: {
    key: 'privacy_security_officer',
    label: 'Privacy & Security Officer',
    eyebrow: 'Sensitive data',
    purpose: 'Protect sensitive data and ensure correct handling.',
    question: 'Where is sensitive data exposed, unclassified or outside required controls?',
    primaryAction: { label: 'Review classifications', href: '/classification' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Classification', href: '/classification' },
      { label: 'Policies', href: '/classification' },
      { label: 'Risks & Issues', href: '/issues' },
      { label: 'Audit', href: '/audit' },
    ],
  },
  data_custodian: {
    key: 'data_custodian',
    label: 'Data Custodian / Technical Steward',
    eyebrow: 'Technical governance',
    purpose: 'Implement controls and resolve source or platform issues.',
    question: 'Which technical data controls, sources or jobs require remediation?',
    primaryAction: { label: 'Open job monitor', href: '/monitoring' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Sources', href: '/datasets' },
      { label: 'Monitoring', href: '/monitoring' },
      { label: 'Observability', href: '/observability' },
      { label: 'Lineage', href: '/lineage' },
      { label: 'Issues', href: '/issues' },
    ],
  },
  data_product_owner: {
    key: 'data_product_owner',
    label: 'Data Product Owner',
    eyebrow: 'Data products',
    purpose: 'Trust, fitness for use, certification and consumer outcomes.',
    question: 'Are my data products trusted, certified and fit for their intended consumers?',
    primaryAction: { label: 'Review data products', href: '/catalog' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Data Products', href: '/catalog' },
      { label: 'Certification', href: '/stewardship' },
      { label: 'Quality & Issues', href: '/data-quality' },
      { label: 'Lineage & Impact', href: '/lineage' },
    ],
  },
  source_system_owner: {
    key: 'source_system_owner',
    label: 'Source System / Application Owner',
    eyebrow: 'Source accountability',
    purpose: 'Prevent upstream defects and restore reliable source data.',
    question: 'Which source defects are affecting downstream data and what needs technical remediation?',
    primaryAction: { label: 'Review source health', href: '/datasets' },
    navigation: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Source Health', href: '/datasets' },
      { label: 'Observability', href: '/observability' },
      { label: 'Issues', href: '/issues' },
      { label: 'Lineage & Impact', href: '/lineage' },
    ],
  },
}

const ROLE_PERSONA_MAP: Record<string, DashboardPersona> = {
  SENIOR_LEADERSHIP: 'senior_leadership',
  BUSINESS_USER: 'business_user',
  READ_ONLY: 'business_user',
  DATA_OWNER: 'data_owner',
  DATA_STEWARD: 'data_steward',
  DATA_GOVERNANCE_ADMIN: 'data_governance_admin',
  DATA_GOVERNANCE_SPECIALIST: 'data_governance_specialist',
  QUALITY_MANAGER: 'data_governance_specialist',
  COMPLIANCE_RISK_OFFICER: 'compliance_risk_officer',
  PRIVACY_SECURITY_OFFICER: 'privacy_security_officer',
  POLICY_APPROVER: 'privacy_security_officer',
  DATA_CUSTODIAN: 'data_custodian',
  TECHNICAL_STEWARD: 'data_custodian',
  DATA_PRODUCT_OWNER: 'data_product_owner',
  SOURCE_SYSTEM_OWNER: 'source_system_owner',
  APPLICATION_OWNER: 'source_system_owner',
}

const PERSONA_PRIORITY: DashboardPersona[] = [
  'senior_leadership',
  'compliance_risk_officer',
  'privacy_security_officer',
  'data_owner',
  'data_product_owner',
  'data_steward',
  'data_governance_specialist',
  'data_custodian',
  'source_system_owner',
  'business_user',
]

export function isDashboardPersona(value: string | null | undefined): value is DashboardPersona {
  return Boolean(value && (DASHBOARD_PERSONAS as readonly string[]).includes(value))
}

export function resolveDashboardPersona(input: {
  organizationRoles: string[]
  projectRoleKeys: string[]
}): DashboardPersona {
  const projectPersonas = new Set(
    input.projectRoleKeys
      .map((role) => ROLE_PERSONA_MAP[String(role).toUpperCase()])
      .filter((persona): persona is DashboardPersona => Boolean(persona)),
  )

  if (projectPersonas.has('senior_leadership')) return 'senior_leadership'

  const isAdministrator = input.organizationRoles.some((role) =>
    ['OWNER', 'ADMIN'].includes(String(role).toUpperCase()),
  )
  if (isAdministrator) return 'data_governance_admin'

  return PERSONA_PRIORITY.find((persona) => projectPersonas.has(persona)) ?? 'business_user'
}
