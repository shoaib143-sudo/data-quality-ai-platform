import type { CanonicalGovernanceObject, ProviderProjection } from '../../canonical/model.ts'
import type { ProviderCapability } from './capability.ts'

export type ProviderManifest = {
  provider: string
  providerVersion: string
  canonicalSchemaVersion: string
  capabilities: ProviderCapability[]
}

export type DiscoveryRequest = {
  projectId: string
  connectionId: string
  objectTypes?: CanonicalGovernanceObject['type'][]
  externalKeys?: string[]
}

export type DiscoveryResult = {
  objects: CanonicalGovernanceObject[]
  projections: ProviderProjection[]
  observedAt: string
}

export type GovernanceOperationKind =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RELATE'
  | 'ASSIGN'
  | 'EXECUTE'

export type GovernanceOperation = {
  planId: string
  operationId: string
  idempotencyKey: string
  desiredStateFingerprint: string
  projectId: string
  connectionId: string
  capability: string
  kind: GovernanceOperationKind
  object: CanonicalGovernanceObject
}

export type ExecutionResult = {
  operationId: string
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING'
  providerObjectId?: string
  providerJobId?: string
  evidence?: Record<string, unknown>
}

export type VerificationResult = {
  operationId: string
  status: 'VERIFIED' | 'MISMATCH' | 'PENDING' | 'MANUAL'
  observed?: CanonicalGovernanceObject
  details?: Record<string, unknown>
}

export interface GovernanceProvider {
  manifest(): ProviderManifest
  capabilities(): Promise<ProviderCapability[]>
  discover(request: DiscoveryRequest): Promise<DiscoveryResult>
  execute(operation: GovernanceOperation): Promise<ExecutionResult>
  verify(operation: GovernanceOperation, result: ExecutionResult): Promise<VerificationResult>
}
