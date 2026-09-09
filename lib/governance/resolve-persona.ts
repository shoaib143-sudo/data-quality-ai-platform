import type { PersonaSlug } from './personas'

const rolePriority: readonly { roleKey: string; persona: PersonaSlug }[] = [
  { roleKey: 'SENIOR_LEADERSHIP', persona: 'senior-leadership' },
  { roleKey: 'DATA_GOVERNANCE_ADMIN', persona: 'data-governance-admin' },
  { roleKey: 'DATA_OWNER', persona: 'data-owner' },
  { roleKey: 'DATA_PRODUCT_OWNER', persona: 'data-product-owner' },
  { roleKey: 'DATA_STEWARD', persona: 'data-steward' },
  { roleKey: 'DATA_GOVERNANCE_SPECIALIST', persona: 'data-governance-specialist' },
  { roleKey: 'COMPLIANCE_RISK_OFFICER', persona: 'compliance-risk-officer' },
  { roleKey: 'PRIVACY_SECURITY_OFFICER', persona: 'privacy-security-officer' },
  { roleKey: 'METADATA_ANALYST', persona: 'metadata-analyst' },
  { roleKey: 'DATA_QUALITY_ANALYST', persona: 'data-quality-analyst' },
  { roleKey: 'DATA_CUSTODIAN', persona: 'data-custodian' },
  { roleKey: 'SOURCE_SYSTEM_OWNER', persona: 'source-system-owner' },
  { roleKey: 'BUSINESS_USER', persona: 'business-user' },
  { roleKey: 'QUALITY_MANAGER', persona: 'data-quality-analyst' },
  { roleKey: 'POLICY_APPROVER', persona: 'data-governance-specialist' },
  { roleKey: 'READ_ONLY', persona: 'business-user' },
]

export function resolvePersonaFromRoleLabels(roleLabels: string[], organizationRole?: string | null): PersonaSlug {
  const roleKeys = new Set(roleLabels.filter(Boolean).map(label => label.trim().toUpperCase()))

  for (const mapping of rolePriority) {
    if (roleKeys.has(mapping.roleKey)) return mapping.persona
  }

  // Compatibility fallback for organizations that predate explicit persona assignment.
  // Organization privilege remains separate from governance authorization.
  if (organizationRole && /^owner$/i.test(organizationRole)) return 'senior-leadership'

  return 'business-user'
}
