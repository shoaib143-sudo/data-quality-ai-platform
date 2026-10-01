import type { CanonicalGovernanceObject } from '../canonical/model'
import type { GovernanceDesiredState } from '../desired-state/model'
import { resolveGovernanceAuthorizationCapability } from '../authorization/capabilities'
import { governanceIdempotencyKey } from './idempotency'
import type { GovernancePlan } from './plan'
import type { GovernanceOperation, GovernanceOperationKind } from '../providers/sdk/provider'

export type ProviderPlannedOperation = GovernanceOperation & {
  provider: string
  requiredCapability: ReturnType<typeof resolveGovernanceAuthorizationCapability>
}

const KIND: Record<string, GovernanceOperationKind> = { CREATE:'CREATE', UPDATE:'UPDATE', DELETE:'DELETE' }

export function expandGovernancePlanForProviders(plan: GovernancePlan, desired: GovernanceDesiredState): ProviderPlannedOperation[] {
  const byId=new Map<string,CanonicalGovernanceObject>(desired.objects.map(object=>[object.id,object]))
  const expanded: ProviderPlannedOperation[]=[]
  for(const operation of plan.operations){
    if(operation.action==='NOOP') continue
    const object=byId.get(operation.objectId)
    if(!object) throw new Error(`Planned governance object ${operation.objectId} is missing from desired state.`)
    for(const target of desired.targets){
      const canonicalKey=operation.canonicalKey
      expanded.push({
        provider:target.provider.trim().toLowerCase(), connectionId:target.connectionId,
        planId:plan.planId, operationId:`${operation.operationId}:${target.provider.toLowerCase()}:${target.connectionId}`,
        idempotencyKey:governanceIdempotencyKey({projectId:plan.projectId,provider:target.provider,connectionId:target.connectionId,canonicalKey,operation:operation.action,desiredStateFingerprint:plan.desiredStateFingerprint}),
        desiredStateFingerprint:plan.desiredStateFingerprint, projectId:plan.projectId,
        capability:semanticCapability(object.type,operation.action), kind:KIND[operation.action],
        object, requiredCapability:resolveGovernanceAuthorizationCapability(object.type,operation.action),
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
