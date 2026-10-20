import type { GovernanceDesiredState } from '../desired-state/model.ts'
import { validateGovernanceDesiredState } from '../desired-state/validate.ts'
import { getGovernanceProvider } from '../providers/registry.ts'
import { validateGovernanceProjectionObservation } from '../projections/store.ts'
import type { GovernanceTargetObservedState } from './deployment-plan.ts'

export async function discoverGovernanceTargetStates(desired:GovernanceDesiredState):Promise<GovernanceTargetObservedState[]>{
 const states:GovernanceTargetObservedState[]=[]
 const hasExplicitDelete=desired.objects.some(object=>object.state==='absent')
 for(const target of desired.targets){
  const provider=getGovernanceProvider(target.provider)
  if(!provider)throw new Error(`Governance provider "${target.provider}" is not registered.`)
  const discovery=await provider.discover({
   projectId:desired.projectId,
   connectionId:target.connectionId,
   objectTypes:hasExplicitDelete?undefined:[...new Set(desired.objects.map(object=>object.type))],
   externalKeys:hasExplicitDelete?undefined:[...new Set(desired.objects.map(object=>object.externalKey))],
  })
  const observedValidation=validateGovernanceDesiredState({...desired,objects:discovery.objects})
  if(!observedValidation.ok)throw new Error(`Governance provider "${target.provider}" returned invalid canonical discovery state: ${observedValidation.errors.join(' ')}`)

  const objectIds=new Set(discovery.objects.map(object=>object.id))
  const canonicalProjectionIds=new Set<string>()
  const providerProjectionIds=new Set<string>()
  const projections=(discovery.projections??[]).map(projection=>{
   const normalized=validateGovernanceProjectionObservation({
    projectId:desired.projectId,
    provider:target.provider,
    connectionId:target.connectionId,
    projection,
   }).projection
   if(!objectIds.has(normalized.canonicalObjectId))throw new Error(`Governance provider "${target.provider}" returned a projection for an undiscovered canonical object.`)
   if(canonicalProjectionIds.has(normalized.canonicalObjectId))throw new Error(`Governance provider "${target.provider}" returned duplicate canonical projection identity.`)
   if(providerProjectionIds.has(normalized.providerObjectId))throw new Error(`Governance provider "${target.provider}" returned duplicate provider projection identity.`)
   canonicalProjectionIds.add(normalized.canonicalObjectId)
   providerProjectionIds.add(normalized.providerObjectId)
   return normalized
  })

  states.push({
   provider:target.provider.trim().toLowerCase(),
   connectionId:target.connectionId,
   objects:discovery.objects,
   projections,
   observedAt:discovery.observedAt,
  })
 }
 return states
}
