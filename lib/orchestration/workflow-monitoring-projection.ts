import type { CompiledWorkflowPlan } from './hierarchical-workflow'

export type WorkflowMonitoringNode = {
  id: string
  capabilityKey: string
  status: string
  dependencies: string[]
  attempt: number
  policyVersion: string
  evidenceRequirements: string[]
}

export type WorkflowMonitoringEdge = { from: string; to: string }

export function projectWorkflowPlanForMonitoring(plan: CompiledWorkflowPlan) {
  const nodes: WorkflowMonitoringNode[] = plan.nodes.map(node => ({
    id: node.executionKey,
    capabilityKey: node.capabilityKey,
    status: node.state,
    dependencies: [...node.dependencies],
    attempt: node.attempt,
    policyVersion: node.policyVersion,
    evidenceRequirements: [...node.evidenceRequirements],
  }))
  const edges: WorkflowMonitoringEdge[] = nodes.flatMap(node =>
    node.dependencies.map(dependency => ({ from: dependency, to: node.id })),
  )
  return {
    workflowKey: plan.workflowKey,
    workflowVersion: plan.workflowVersion,
    mode: plan.mode,
    nodes,
    edges,
  }
}
