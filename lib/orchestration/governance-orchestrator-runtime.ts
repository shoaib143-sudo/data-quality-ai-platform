export type OrchestratorNodeState =
  | 'PENDING'
  | 'READY'
  | 'AUTHORIZED'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'BLOCKED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'COMPENSATING'
  | 'ROLLED_BACK'
  | 'CANCELLED'

export type RetryClass = 'NONE' | 'TRANSIENT_SAFE' | 'REQUIRES_REPLAN' | 'REQUIRES_APPROVAL'

export type OrchestratorNode = {
  executionKey: string
  capabilityKey: string
  dependencies: string[]
  state: OrchestratorNodeState
  attempt: number
  leaseGeneration: number
  policyVersion: string
  inputHash: string
  evidenceRequirements: string[]
  timeoutMs: number
  retryClass: RetryClass
  compensationAction: string | null
}

const legalTransitions: Record<OrchestratorNodeState, ReadonlySet<OrchestratorNodeState>> = {
  PENDING: new Set(['READY', 'BLOCKED', 'CANCELLED']),
  READY: new Set(['AUTHORIZED', 'BLOCKED', 'CANCELLED']),
  AUTHORIZED: new Set(['RUNNING', 'WAITING_APPROVAL', 'BLOCKED', 'CANCELLED']),
  RUNNING: new Set(['SUCCEEDED', 'FAILED', 'WAITING_APPROVAL', 'COMPENSATING', 'CANCELLED']),
  WAITING_APPROVAL: new Set(['AUTHORIZED', 'BLOCKED', 'CANCELLED']),
  BLOCKED: new Set(['READY', 'CANCELLED']),
  SUCCEEDED: new Set(),
  FAILED: new Set(['READY', 'COMPENSATING', 'CANCELLED']),
  COMPENSATING: new Set(['ROLLED_BACK', 'FAILED']),
  ROLLED_BACK: new Set(),
  CANCELLED: new Set(),
}

export function canTransitionNode(from: OrchestratorNodeState, to: OrchestratorNodeState): boolean {
  return legalTransitions[from].has(to)
}

export function assertNodeTransition(from: OrchestratorNodeState, to: OrchestratorNodeState): void {
  if (!canTransitionNode(from, to)) {
    throw new Error(`Illegal orchestrator node transition: ${from} -> ${to}`)
  }
}

export function validateExecutionPlan(nodes: OrchestratorNode[]): string[] {
  const errors: string[] = []
  const keys = new Set(nodes.map(node => node.executionKey))

  if (keys.size !== nodes.length) errors.push('Execution keys must be unique.')

  for (const node of nodes) {
    if (!node.executionKey.trim()) errors.push('Execution key must not be blank.')
    if (!node.capabilityKey.trim()) errors.push(`${node.executionKey || '<blank>'}: capability key must not be blank.`)
    if (node.attempt < 1 || !Number.isInteger(node.attempt)) errors.push(`${node.executionKey}: attempt must be an integer >= 1.`)
    if (node.leaseGeneration < 0 || !Number.isInteger(node.leaseGeneration)) errors.push(`${node.executionKey}: lease generation must be an integer >= 0.`)
    if (node.timeoutMs <= 0 || !Number.isFinite(node.timeoutMs)) errors.push(`${node.executionKey}: timeout must be finite and > 0.`)
    if (!node.policyVersion.trim()) errors.push(`${node.executionKey}: policy version must not be blank.`)
    if (!node.inputHash.trim()) errors.push(`${node.executionKey}: input hash must not be blank.`)
    if (new Set(node.evidenceRequirements).size !== node.evidenceRequirements.length) {
      errors.push(`${node.executionKey}: evidence requirements must be unique.`)
    }
    for (const dependency of node.dependencies) {
      if (!keys.has(dependency)) errors.push(`${node.executionKey}: unknown dependency ${dependency}.`)
      if (dependency === node.executionKey) errors.push(`${node.executionKey}: node cannot depend on itself.`)
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byKey = new Map(nodes.map(node => [node.executionKey, node]))

  function visit(key: string): void {
    if (visited.has(key)) return
    if (visiting.has(key)) {
      errors.push(`Dependency cycle detected at ${key}.`)
      return
    }
    visiting.add(key)
    for (const dependency of byKey.get(key)?.dependencies ?? []) {
      if (byKey.has(dependency)) visit(dependency)
    }
    visiting.delete(key)
    visited.add(key)
  }

  for (const key of keys) visit(key)
  return [...new Set(errors)]
}

export function assertLeaseGeneration(expected: number, presented: number): void {
  if (!Number.isInteger(expected) || expected < 0 || !Number.isInteger(presented) || presented < 0) {
    throw new Error('Execution lease generations must be non-negative integers.')
  }
  if (expected !== presented) {
    throw new Error(`Stale execution lease: expected generation ${expected}, received ${presented}.`)
  }
}
