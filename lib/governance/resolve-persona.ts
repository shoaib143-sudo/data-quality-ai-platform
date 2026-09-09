import type { PersonaSlug } from './personas'

const explicitRolePersonas: Record<string, PersonaSlug> = {
  SENIOR_LEADERSHIP: 'senior-leadership',
  BUSINESS_USER: 'business-user',
  DATA_OWNER: 'data-owner',
  DATA_PRODUCT_OWNER: 'data-product-owner',
  DATA_STEWARD: 'data-steward',
  DATA_GOVERNANCE_SPECIALIST: 'data-governance-specialist',
  COMPLIANCE_RISK_OFFICER: 'compliance-risk-officer',
  PRIVACY_SECURITY_OFFICER: 'privacy-security-officer',
  DATA_GOVERNANCE_ADMIN: 'data-governance-admin',
  DATA_CUSTODIAN: 'data-custodian',
  SOURCE_SYSTEM_OWNER: 'source-system-owner',
}

const mappings: { persona: PersonaSlug; patterns: RegExp[] }[] = [
  { persona: 'senior-leadership', patterns: [/executive/i, /senior leadership/i, /leadership/i, /chief data officer/i, /cdo/i] },
  { persona: 'data-governance-admin', patterns: [/governance admin/i, /platform admin/i, /administrator/i, /^admin$/i] },
  { persona: 'data-governance-specialist', patterns: [/governance specialist/i, /governance lead/i, /governance manager/i] },
  { persona: 'compliance-risk-officer', patterns: [/compliance/i, /risk officer/i, /risk manager/i] },
  { persona: 'privacy-security-officer', patterns: [/privacy/i, /security officer/i, /data protection/i] },
  { persona: 'data-product-owner', patterns: [/data product owner/i, /product owner/i] },
  { persona: 'source-system-owner', patterns: [/source system owner/i, /application owner/i, /system owner/i] },
  { persona: 'data-custodian', patterns: [/custodian/i, /technical steward/i, /technical owner/i] },
  { persona: 'data-owner', patterns: [/data owner/i, /domain owner/i, /information owner/i] },
  { persona: 'data-steward', patterns: [/data steward/i, /business steward/i, /steward/i] },
  { persona: 'business-user', patterns: [/business user/i, /consumer/i, /analyst/i, /viewer/i, /member/i] },
]

export function resolvePersonaFromRoleLabels(roleLabels: string[], organizationRole?: string | null): PersonaSlug {
  const labels = roleLabels.filter(Boolean)

  for (const label of labels) {
    const explicit = explicitRolePersonas[label.trim().toUpperCase()]
    if (explicit) return explicit
  }

  for (const mapping of mappings) {
    if (labels.some(label => mapping.patterns.some(pattern => pattern.test(label)))) return mapping.persona
  }

  // Compatibility fallback for organizations that have not assigned an explicit
  // governance persona yet. Organization privilege is not used when an explicit
  // governance role is present and must never be treated as authorization authority.
  if (organizationRole && /^owner$/i.test(organizationRole)) return 'senior-leadership'

  return 'business-user'
}
