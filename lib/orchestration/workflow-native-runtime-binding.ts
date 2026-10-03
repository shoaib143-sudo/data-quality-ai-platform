import type { WorkflowTaskDefinition } from './hierarchical-workflow'
import type { NativePlanStep } from '@/lib/agents/runtime/native-autonomy-kernel'

export function bindWorkflowAgentTaskToNativeStep(input: {
  task: WorkflowTaskDefinition
  projectId: string
  payload: Record<string, unknown>
  idempotencyKey: string
}): NativePlanStep {
  if (input.task.type !== 'AGENT') throw new Error('Only AGENT workflow tasks can bind to native agent steps.')
  if (!input.task.agentKey) throw new Error('Agent task is missing agentKey.')
  if (!input.task.toolKey) throw new Error('Agent task is missing toolKey.')
  if (!input.projectId.trim()) throw new Error('Native workflow binding requires projectId.')
  if (!input.idempotencyKey.trim()) throw new Error('Native workflow binding requires idempotencyKey.')

  return {
    id: input.task.key,
    agentKey: input.task.agentKey as NativePlanStep['agentKey'],
    toolKey: input.task.toolKey,
    projectId: input.projectId,
    input: input.payload,
    dependsOn: [...input.task.dependencies],
    idempotencyKey: input.idempotencyKey,
  }
}
