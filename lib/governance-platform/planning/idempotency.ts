import { stableGovernanceFingerprint } from './fingerprint'

export type GovernanceIdempotencyInput = {
  projectId: string
  provider: string
  connectionId: string
  canonicalKey: string
  operation: string
  desiredStateFingerprint: string
}

export function governanceIdempotencyKey(input: GovernanceIdempotencyInput) {
  return stableGovernanceFingerprint({
    projectId: input.projectId,
    provider: input.provider.trim().toLowerCase(),
    connectionId: input.connectionId.trim(),
    canonicalKey: input.canonicalKey,
    operation: input.operation.toUpperCase(),
    desiredStateFingerprint: input.desiredStateFingerprint,
  })
}
