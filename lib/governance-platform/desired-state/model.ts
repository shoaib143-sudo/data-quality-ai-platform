import type { CanonicalGovernanceObject } from '../canonical/model.ts'

export const GOVERNANCE_DESIRED_STATE_API_VERSION = 'datanexus.io/governance/v1' as const

export type DesiredStateTarget = {
  provider: string
  connectionId: string
}

export type DesiredGovernanceObject = CanonicalGovernanceObject & {
  state?: 'present' | 'absent'
}

export type GovernanceDesiredState = {
  apiVersion: typeof GOVERNANCE_DESIRED_STATE_API_VERSION
  projectId: string
  targets: DesiredStateTarget[]
  objects: DesiredGovernanceObject[]
}
