import type { AuthorizationCapability } from '@/lib/auth/authorize'
import type { GovernanceDiffAction } from '../planning/diff.ts'

const READ_CAPABILITIES: Record<string, AuthorizationCapability> = {
  BUSINESS_TERM: 'glossary.read',
  LINEAGE_EDGE: 'lineage.read',
  QUALITY_RULE: 'quality.read',
  QUALITY_RESULT: 'quality.read',
}

const MANAGE_CAPABILITIES: Record<string, AuthorizationCapability> = {
  BUSINESS_TERM: 'glossary.manage',
  LINEAGE_EDGE: 'lineage.manage',
  QUALITY_RULE: 'quality.manage',
  QUALITY_RESULT: 'quality.manage',
  CLASSIFICATION: 'classification.review',
  STEWARD: 'stewardship.manage',
  POLICY: 'policy.approve',
}

export function resolveGovernanceAuthorizationCapability(
  objectType: string,
  action: GovernanceDiffAction,
): AuthorizationCapability {
  if (action === 'NOOP') return READ_CAPABILITIES[objectType] ?? 'catalog.read'
  return MANAGE_CAPABILITIES[objectType] ?? 'catalog.update'
}
