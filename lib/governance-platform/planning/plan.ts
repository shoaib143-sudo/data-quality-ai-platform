import type { CanonicalGovernanceObject } from '../canonical/model.ts'
import type { GovernanceDesiredState } from '../desired-state/model.ts'
import { validateGovernanceDesiredState } from '../desired-state/validate.ts'
import { diffGovernanceState, type GovernanceDiffAction } from './diff.ts'
import { governanceDesiredStateFingerprint,stableGovernanceFingerprint } from './fingerprint.ts'

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

  const desiredStateFingerprint = governanceDesiredStateFingerprint(desiredState)
  const diffs = diffGovernanceState(desiredState.objects, actual).sort((a,b)=>`${a.desired.type}\u0000${a.desired.externalKey}\u0000${a.desired.id}`.localeCompare(`${b.desired.type}\u0000${b.desired.externalKey}\u0000${b.desired.id}`))
  const diffByActualKey=new Map(diffs.filter(diff=>diff.actual).map(diff=>[`${diff.actual!.type}:${diff.actual!.externalKey}`,diff]))

  const operations = diffs.map(diff => {
    let dependencies:string[]
    if(diff.action==='DELETE'){
      const inbound=actual.filter(other=>other.id!==diff.desired.id&&other.relationships.some(relationship=>relationship.targetId===diff.desired.id))
      dependencies=inbound.map(other=>{
        const dependent=diffByActualKey.get(`${other.type}:${other.externalKey}`)
        if(!dependent||dependent.action==='NOOP'){
          throw new Error(`Governance delete of ${diff.desired.type}:${diff.desired.externalKey} is blocked because observed object ${other.type}:${other.externalKey} still references it and is not being updated or deleted.`)
        }
        return dependent.desired.id
      }).sort()
    }else{
      dependencies=diff.desired.relationships.map(relationship => relationship.targetId).sort()
    }

    return {
      operationId: stableGovernanceFingerprint({
        desiredStateFingerprint,
        action: diff.action,
        type: diff.desired.type,
        externalKey: diff.desired.externalKey,
        objectId: diff.desired.id,
      }).slice(0, 32),
      action: diff.action,
      canonicalKey: `${diff.desired.type}:${diff.desired.externalKey}`,
      objectId: diff.desired.id,
      dependencies,
    }
  })

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
