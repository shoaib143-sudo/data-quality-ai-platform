import { UNIFIED_READINESS_FRAMEWORK_VERSION, type ReadinessContext } from './unified-readiness-framework.ts'
import type { ReadinessEvidence } from './unified-readiness-engine.ts'

export type ReadinessSnapshot = {
  id: string
  organizationId: string
  frameworkVersion: typeof UNIFIED_READINESS_FRAMEWORK_VERSION
  context: ReadinessContext
  evidence: readonly ReadinessEvidence[]
  createdAt: string
  supersedesSnapshotId: string | null
  immutable: true
}

export function createReadinessSnapshot(input: Omit<ReadinessSnapshot,'frameworkVersion'|'immutable'>): ReadinessSnapshot {
  return Object.freeze({ ...input, frameworkVersion: UNIFIED_READINESS_FRAMEWORK_VERSION, immutable: true as const })
}
