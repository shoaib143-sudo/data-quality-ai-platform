import type { GovernanceDesiredState } from '../desired-state/model'
import { getGovernanceProvider } from '../providers/registry'
import type { GovernanceTargetObservedState } from './deployment-plan'

export async function discoverGovernanceTargetStates(desired:GovernanceDesiredState):Promise<GovernanceTargetObservedState[]>{
 const states:GovernanceTargetObservedState[]=[]
 for(const target of desired.targets){
  const provider=getGovernanceProvider(target.provider)
  if(!provider)throw new Error(`Governance provider "${target.provider}" is not registered.`)
  const discovery=await provider.discover({
   projectId:desired.projectId,
   connectionId:target.connectionId,
   objectTypes:[...new Set(desired.objects.map(object=>object.type))],
   externalKeys:[...new Set(desired.objects.map(object=>object.externalKey))],
  })
  states.push({
   provider:target.provider.trim().toLowerCase(),
   connectionId:target.connectionId,
   objects:discovery.objects,
   observedAt:discovery.observedAt,
  })
 }
 return states
}
