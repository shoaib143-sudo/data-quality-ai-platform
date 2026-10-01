import type { CanonicalGovernanceObject } from '../canonical/model.ts'
import type { GovernanceDesiredState } from '../desired-state/model.ts'
import { resolveGovernanceAuthorizationCapability } from '../authorization/capabilities.ts'
import { governanceIdempotencyKey } from './idempotency.ts'
import { stableGovernanceFingerprint } from './fingerprint.ts'
import type { GovernancePlan } from './plan.ts'
import type { GovernanceOperation, GovernanceOperationKind } from '../providers/sdk/provider.ts'

export type ProviderPlannedOperation = GovernanceOperation & {
  deploymentId?: string
  provider: string
  requiredCapability: ReturnType<typeof resolveGovernanceAuthorizationCapability>
  dependencies: string[]
}

const KIND: Record<string, GovernanceOperationKind> = { CREATE:'CREATE', UPDATE:'UPDATE', DELETE:'DELETE' }

function providerOperationId(canonicalOperationId:string,provider:string,connectionId:string){
 return stableGovernanceFingerprint({canonicalOperationId,provider:provider.trim().toLowerCase(),connectionId}).slice(0,32)
}

export function expandGovernancePlanForProviders(plan: GovernancePlan, desired: GovernanceDesiredState): ProviderPlannedOperation[] {
  const byId=new Map<string,CanonicalGovernanceObject>(desired.objects.map(object=>[object.id,object]))
  const operationByObjectId=new Map(plan.operations.map(operation=>[operation.objectId,operation]))
  const expanded: ProviderPlannedOperation[]=[]
  for(const operation of plan.operations){
    if(operation.action==='NOOP') continue
    const object=byId.get(operation.objectId)
    if(!object) throw new Error(`Planned governance object ${operation.objectId} is missing from desired state.`)
    for(const target of desired.targets){
      const provider=target.provider.trim().toLowerCase()
      const canonicalKey=operation.canonicalKey
      const dependencies=operation.dependencies.flatMap(objectId=>{
        const dependency=operationByObjectId.get(objectId)
        if(!dependency||dependency.action==='NOOP')return[]
        return[providerOperationId(dependency.operationId,provider,target.connectionId)]
      }).sort()
      expanded.push({
        provider, connectionId:target.connectionId,
        planId:plan.planId, operationId:providerOperationId(operation.operationId,provider,target.connectionId),
        idempotencyKey:governanceIdempotencyKey({projectId:plan.projectId,provider,connectionId:target.connectionId,canonicalKey,operation:operation.action,desiredStateFingerprint:plan.desiredStateFingerprint}),
        desiredStateFingerprint:plan.desiredStateFingerprint, projectId:plan.projectId,
        capability:semanticCapability(object.type,operation.action), kind:KIND[operation.action],
        object, requiredCapability:resolveGovernanceAuthorizationCapability(object.type,operation.action),dependencies,
      })
    }
  }
  return expanded
}

function semanticCapability(type:string, action:string){
  const verb=action.toLowerCase()
  if(type==='BUSINESS_TERM') return `glossary.term.${verb}`
  if(type==='LINEAGE_EDGE') return `lineage.${verb}`
  if(type==='QUALITY_RULE') return `quality.rule.${verb}`
  return `catalog.asset.${verb}`
}
