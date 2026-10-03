import type { CanonicalGovernanceObject } from '../canonical/model.ts'
import type { GovernanceDesiredState,DesiredStateTarget } from '../desired-state/model.ts'
import { governanceDesiredStateFingerprint,stableGovernanceFingerprint } from './fingerprint.ts'
import { buildGovernancePlan,type GovernancePlan } from './plan.ts'
import { expandGovernancePlanForProviders,type ProviderPlannedOperation } from './provider-plan.ts'

export type GovernanceTargetObservedState={
 provider:string
 connectionId:string
 objects:CanonicalGovernanceObject[]
 observedAt?:string
}

export type GovernanceTargetPlan={
 target:DesiredStateTarget
 observedAt:string|null
 plan:GovernancePlan
 operations:ProviderPlannedOperation[]
}

export type GovernanceDeploymentPlan={
 deploymentId:string
 deploymentFingerprint:string
 desiredStateFingerprint:string
 projectId:string
 targets:GovernanceTargetPlan[]
 operations:ProviderPlannedOperation[]
}

function targetKey(provider:string,connectionId:string){return `${provider.trim().toLowerCase()}::${connectionId.trim()}`}

export function buildGovernanceDeploymentPlan(
 desired:GovernanceDesiredState,
 observedStates:GovernanceTargetObservedState[],
):GovernanceDeploymentPlan{
 const observedByTarget=new Map<string,GovernanceTargetObservedState>()
 for(const observed of observedStates){
  const key=targetKey(observed.provider,observed.connectionId)
  if(observedByTarget.has(key))throw new Error(`Observed governance state duplicates target ${key}.`)
  observedByTarget.set(key,observed)
 }
 const targets=[...desired.targets].sort((a,b)=>targetKey(a.provider,a.connectionId).localeCompare(targetKey(b.provider,b.connectionId))).map(target=>{
  const key=targetKey(target.provider,target.connectionId)
  const observed=observedByTarget.get(key)
  if(!observed)throw new Error(`Observed governance state is required for target ${key}.`)
  const targetDesired:GovernanceDesiredState={...desired,targets:[target]}
  const plan=buildGovernancePlan(targetDesired,observed.objects)
  return{target,observedAt:observed.observedAt??null,plan,operations:expandGovernancePlanForProviders(plan,targetDesired)}
 })
 const desiredStateFingerprint=governanceDesiredStateFingerprint(desired)
 const deploymentFingerprint=stableGovernanceFingerprint({
  projectId:desired.projectId,desiredStateFingerprint,
  targets:targets.map(value=>({
   provider:value.target.provider.trim().toLowerCase(),connectionId:value.target.connectionId,
   planFingerprint:value.plan.planFingerprint,
  })),
 })
 const deploymentId=deploymentFingerprint.slice(0,32)
 const boundTargets=targets.map(value=>({...value,operations:value.operations.map(operation=>({...operation,deploymentId}))}))
 return{
  deploymentId,deploymentFingerprint,desiredStateFingerprint,
  projectId:desired.projectId,targets:boundTargets,operations:boundTargets.flatMap(value=>value.operations),
 }
}
