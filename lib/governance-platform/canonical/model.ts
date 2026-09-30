export const CANONICAL_GOVERNANCE_SCHEMA_VERSION = '1.0' as const

export type CanonicalGovernanceObjectType =
  | 'GOVERNANCE_DOMAIN'
  | 'BUSINESS_TERM'
  | 'TECHNICAL_ASSET'
  | 'DATA_PRODUCT'
  | 'CLASSIFICATION'
  | 'POLICY'
  | 'CONTROL'
  | 'OWNER'
  | 'STEWARD'
  | 'RELATIONSHIP'
  | 'LINEAGE_EDGE'
  | 'QUALITY_RULE'
  | 'QUALITY_RESULT'
  | 'CERTIFICATION'
  | 'WORKFLOW'
  | 'ISSUE'
  | 'APPROVAL'

export type CanonicalRelationship = {
  type: string
  targetId: string
  attributes?: Record<string, unknown>
}

export type CanonicalGovernanceObject = {
  id: string
  type: CanonicalGovernanceObjectType
  externalKey: string
  name: string
  description?: string
  projectId: string
  attributes: Record<string, unknown>
  relationships: CanonicalRelationship[]
  version: number
}

export type ProviderProjectionSyncState =
  | 'IN_SYNC'
  | 'DRIFTED'
  | 'MISSING'
  | 'UNSUPPORTED'

export type ProviderProjection = {
  provider: string
  connectionId: string
  canonicalObjectId: string
  providerObjectId: string
  providerVersion?: string
  lastObservedFingerprint: string
  lastObservedAt: string
  syncState: ProviderProjectionSyncState
}
