import type { PersonaSlug } from './personas'

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

  for (const mapping of mappings) {
    if (labels.some(label => mapping.patterns.some(pattern => pattern.test(label)))) return mapping.persona
  }

  if (organizationRole) {
    if (/^owner$/i.test(organizationRole)) return 'senior-leadership'
    if (/^admin$/i.test(organizationRole)) return 'data-governance-admin'
  }

  return 'business-user'
}
