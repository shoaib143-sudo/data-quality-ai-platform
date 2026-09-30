import type { GovernancePlanOperation } from './plan'

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
