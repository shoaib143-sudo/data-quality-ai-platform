import { assertNodeTransition, type OrchestratorNode, type OrchestratorNodeState } from './governance-orchestrator-runtime'
import { assertTaskClosureAllowed, type WorkflowVerificationResult } from './workflow-verification'

export type WorkflowExecutionSnapshot = {
  workflowRunId: string
  nodes: ReadonlyMap<string, OrchestratorNode>
}

export function transitionWorkflowNode(input: {
  snapshot: WorkflowExecutionSnapshot
  taskKey: string
  to: OrchestratorNodeState
  verification?: WorkflowVerificationResult
}): WorkflowExecutionSnapshot {
  const current = input.snapshot.nodes.get(input.taskKey)
  if (!current) throw new Error(`Unknown workflow task: ${input.taskKey}`)
  assertNodeTransition(current.state, input.to)
  if (input.to === 'SUCCEEDED') {
    if (!input.verification) throw new Error('Verification result is required before task success.')
    assertTaskClosureAllowed(input.verification)
  }
  const nodes = new Map(input.snapshot.nodes)
  nodes.set(input.taskKey, { ...current, state: input.to })
  return { ...input.snapshot, nodes }
}

export function releaseReadyDependencies(snapshot: WorkflowExecutionSnapshot): WorkflowExecutionSnapshot {
  const nodes = new Map(snapshot.nodes)
  for (const [key, node] of nodes) {
    if (node.state !== 'PENDING') continue
    const dependencies = node.dependencies.map(dep => nodes.get(dep))
    if (dependencies.some(dep => !dep)) throw new Error(`${key}: dependency disappeared from execution snapshot.`)
    if (dependencies.every(dep => dep?.state === 'SUCCEEDED')) nodes.set(key, { ...node, state: 'READY' })
  }
  return { ...snapshot, nodes }
}
