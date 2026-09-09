export const governancePersonaRoleKeys = [
  'SENIOR_LEADERSHIP',
  'BUSINESS_USER',
  'DATA_OWNER',
  'DATA_PRODUCT_OWNER',
  'DATA_STEWARD',
  'DATA_GOVERNANCE_SPECIALIST',
  'COMPLIANCE_RISK_OFFICER',
  'PRIVACY_SECURITY_OFFICER',
  'DATA_GOVERNANCE_ADMIN',
  'DATA_CUSTODIAN',
  'SOURCE_SYSTEM_OWNER',
  'METADATA_ANALYST',
  'DATA_QUALITY_ANALYST',
] as const

export type GovernancePersonaRoleKey = (typeof governancePersonaRoleKeys)[number]

const governancePersonaRoleKeySet = new Set<string>(governancePersonaRoleKeys)

export function isGovernancePersonaRoleKey(value: string): value is GovernancePersonaRoleKey {
  return governancePersonaRoleKeySet.has(value)
}
