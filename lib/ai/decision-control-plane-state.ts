import { BUILTIN_DECISION_DEFINITIONS } from './decision-registry.ts'
import { readDecisionRuntimeStatus } from './decision-runtime.ts'

export type DecisionControlPlaneFamily = {
  family: string
  schemaVersion: string
  lifecycle: string
  owner: string
  minimumConfidence: number
  failureMode: string
  synchronous: boolean
  enforcementEligible: boolean
}

export type DecisionControlPlaneState = {
  provider: ReturnType<typeof readDecisionRuntimeStatus>
  families: DecisionControlPlaneFamily[]
  counts: {
    total: number
    shadow: number
    advisory: number
    active: number
    enforcementEligible: number
  }
  authority: {
    semanticMayGrantCapability: false
    semanticMayOverrideDeny: false
    semanticMayApproveMutation: false
    semanticMayPromoteEvidence: false
  }
}

export function readDecisionControlPlaneState(): DecisionControlPlaneState {
  const families = Object.values(BUILTIN_DECISION_DEFINITIONS).map(definition => ({
    family: definition.family,
    schemaVersion: definition.schemaVersion,
    lifecycle: definition.lifecycle,
    owner: definition.owner,
    minimumConfidence: definition.minimumConfidence,
    failureMode: definition.failureMode,
    synchronous: definition.synchronous,
    enforcementEligible: definition.enforcementEligible,
  }))

  return {
    provider: readDecisionRuntimeStatus(),
    families,
    counts: {
      total: families.length,
      shadow: families.filter(row => row.lifecycle === 'SHADOW').length,
      advisory: families.filter(row => row.lifecycle === 'ADVISORY').length,
      active: families.filter(row => row.lifecycle === 'ACTIVE').length,
      enforcementEligible: families.filter(row => row.enforcementEligible).length,
    },
    authority: {
      semanticMayGrantCapability: false,
      semanticMayOverrideDeny: false,
      semanticMayApproveMutation: false,
      semanticMayPromoteEvidence: false,
    },
  }
}
