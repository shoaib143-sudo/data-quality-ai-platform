import { createHash } from 'node:crypto'
import type { CanonicalRelationship } from '../canonical/model.ts'
import type { GovernanceDesiredState } from '../desired-state/model.ts'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  return value
}

export function stableGovernanceFingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

export function normalizeGovernanceRelationships<T extends CanonicalRelationship>(relationships:T[]):T[]{
 return [...relationships].sort((a,b)=>{
  const primary=`${a.type}\u0000${a.targetId}`.localeCompare(`${b.type}\u0000${b.targetId}`)
  return primary||stableGovernanceFingerprint(a.attributes??{}).localeCompare(stableGovernanceFingerprint(b.attributes??{}))
 })
}

export function normalizeGovernanceDesiredState(desired:GovernanceDesiredState):GovernanceDesiredState{
 return{
  ...desired,
  targets:[...desired.targets]
   .map(target=>({...target,provider:target.provider.trim().toLowerCase(),connectionId:target.connectionId.trim()}))
   .sort((a,b)=>`${a.provider}\u0000${a.connectionId}`.localeCompare(`${b.provider}\u0000${b.connectionId}`)),
  objects:[...desired.objects]
   .map(object=>({...object,state:object.state??'present',relationships:normalizeGovernanceRelationships(object.relationships)}))
   .sort((a,b)=>`${a.type}\u0000${a.externalKey}\u0000${a.id}`.localeCompare(`${b.type}\u0000${b.externalKey}\u0000${b.id}`)),
 }
}

export function governanceDesiredStateFingerprint(desired:GovernanceDesiredState){
 return stableGovernanceFingerprint(normalizeGovernanceDesiredState(desired))
}
