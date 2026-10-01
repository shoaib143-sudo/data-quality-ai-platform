import type { GovernancePlanOperation } from './plan'
import type { ProviderPlannedOperation } from './provider-plan'

export function orderGovernanceOperations(operations: GovernancePlanOperation[]): GovernancePlanOperation[] {
  const byObjectId = new Map(operations.map(operation => [operation.objectId, operation]))
  const permanent = new Set<string>()
  const temporary = new Set<string>()
  const ordered: GovernancePlanOperation[] = []

  function visit(operation: GovernancePlanOperation) {
    if (permanent.has(operation.operationId)) return
    if (temporary.has(operation.operationId)) throw new Error(`Governance plan contains a dependency cycle at ${operation.canonicalKey}.`)
    temporary.add(operation.operationId)
    for (const dependencyId of operation.dependencies) {
      const dependency = byObjectId.get(dependencyId)
      if (dependency) visit(dependency)
    }
    temporary.delete(operation.operationId)
    permanent.add(operation.operationId)
    ordered.push(operation)
  }

  for (const operation of operations) visit(operation)
  return ordered
}

export function orderProviderGovernanceOperations(operations:ProviderPlannedOperation[]):ProviderPlannedOperation[]{
 const byOperationId=new Map(operations.map(operation=>[operation.operationId,operation]))
 const permanent=new Set<string>(),temporary=new Set<string>(),ordered:ProviderPlannedOperation[]=[]
 function visit(operation:ProviderPlannedOperation){
  if(permanent.has(operation.operationId))return
  if(temporary.has(operation.operationId))throw new Error(`Provider governance plan contains a dependency cycle at ${operation.provider}/${operation.connectionId}/${operation.object.externalKey}.`)
  temporary.add(operation.operationId)
  for(const dependencyId of operation.dependencies){
   const dependency=byOperationId.get(dependencyId)
   if(!dependency)throw new Error(`Provider governance operation ${operation.operationId} references missing dependency ${dependencyId}.`)
   if(dependency.provider!==operation.provider||dependency.connectionId!==operation.connectionId)throw new Error('Provider governance dependencies cannot cross provider targets.')
   visit(dependency)
  }
  temporary.delete(operation.operationId)
  permanent.add(operation.operationId)
  ordered.push(operation)
 }
 for(const operation of operations)visit(operation)
 return ordered
}
