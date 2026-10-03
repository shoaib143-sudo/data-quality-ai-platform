import type { WorkflowTaskDefinition } from './hierarchical-workflow'

export type WorkflowApprovalBinding = {
  workflowRunId: string
  taskKey: string
  approvalPolicyKey: string
  exactInputHash: string
  policyVersion: string
}

export function bindApprovalTask(input: {
  workflowRunId: string
  task: WorkflowTaskDefinition
  exactInputHash: string
  policyVersion: string
}): WorkflowApprovalBinding {
  if (input.task.type !== 'APPROVAL') throw new Error('Only APPROVAL tasks can create approval bindings.')
  if (!input.task.approvalPolicyKey?.trim()) throw new Error('Approval task requires approvalPolicyKey.')
  if (!input.exactInputHash.trim()) throw new Error('Approval binding requires exact immutable input hash.')
  if (!input.policyVersion.trim()) throw new Error('Approval binding requires policy version.')
  return {
    workflowRunId: input.workflowRunId,
    taskKey: input.task.key,
    approvalPolicyKey: input.task.approvalPolicyKey,
    exactInputHash: input.exactInputHash,
    policyVersion: input.policyVersion,
  }
}

export function assertApprovalStillMatches(binding: WorkflowApprovalBinding, input: {
  workflowRunId: string
  taskKey: string
  exactInputHash: string
  policyVersion: string
}) {
  if (binding.workflowRunId !== input.workflowRunId || binding.taskKey !== input.taskKey) throw new Error('Approval is bound to a different workflow task.')
  if (binding.exactInputHash !== input.exactInputHash) throw new Error('Workflow task input changed while approval was pending.')
  if (binding.policyVersion !== input.policyVersion) throw new Error('Workflow policy changed while approval was pending.')
}
