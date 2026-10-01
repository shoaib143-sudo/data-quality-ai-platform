import type { CanonicalGovernanceObject } from '../canonical/model.ts'
import type { GovernanceDesiredState } from '../desired-state/model.ts'
import { validateGovernanceDesiredState } from '../desired-state/validate.ts'
import { diffGovernanceState, type GovernanceDiffAction } from './diff.ts'
import { stableGovernanceFingerprint } from './fingerprint.ts'

export type GovernancePlanOperation = {
  operationId: string
  action: GovernanceDiffAction
  canonicalKey: string
  objectId: string
  dependencies: string[]
}

export type GovernancePlan = {
  planId: string
  planFingerprint: string
  projectId: string
  desiredStateFingerprint: string
  operations: GovernancePlanOperation[]
}

export function buildGovernancePlan(
  desiredState: GovernanceDesiredState,
  actual: CanonicalGovernanceObject[],
): GovernancePlan {
  const validation = validateGovernanceDesiredState(desiredState)
  if (!validation.ok) throw new Error(`Invalid governance desired state: ${validation.errors.join(' ')}`)

  const desiredStateFingerprint = stableGovernanceFingerprint(desiredState)
  const operations = diffGovernanceState(desiredState.objects, actual).map((diff, index) => ({
    operationId: stableGovernanceFingerprint({
      desiredStateFingerprint,
      action: diff.action,
      type: diff.desired.type,
      externalKey: diff.desired.externalKey,
      index,
    }).slice(0, 32),
    action: diff.action,
    canonicalKey: `${diff.desired.type}:${diff.desired.externalKey}`,
    objectId: diff.desired.id,
    dependencies: diff.desired.relationships.map(relationship => relationship.targetId).sort(),
  }))

  const planFingerprint = stableGovernanceFingerprint({
    projectId: desiredState.projectId,
    desiredStateFingerprint,
    operations,
  })
  return {
    planId: planFingerprint.slice(0, 32),
    planFingerprint,
    projectId: desiredState.projectId,
    desiredStateFingerprint,
    operations,
  }
}
