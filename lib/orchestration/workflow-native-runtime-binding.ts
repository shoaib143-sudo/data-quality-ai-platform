import type { WorkflowTaskDefinition } from './hierarchical-workflow'
import { isGovernedAgentKey } from '@/lib/agents/governed-agent-registry'
import { NATIVE_AUTONOMY_ALLOWED_AGENTS, type NativePlanStep } from '@/lib/agents/runtime/native-autonomy-kernel'

export function bindWorkflowAgentTaskToNativeStep(input: {
  task: WorkflowTaskDefinition
  projectId: string
  payload: Record<string, unknown>
  idempotencyKey: string
}): NativePlanStep {
  if (input.task.type !== 'AGENT') throw new Error('Only AGENT workflow tasks can bind to native agent steps.')
  if (!input.task.agentKey || !isGovernedAgentKey(input.task.agentKey)) throw new Error('Agent task has an unknown governed agentKey.')
  if (!(NATIVE_AUTONOMY_ALLOWED_AGENTS as readonly string[]).includes(input.task.agentKey)) throw new Error('Agent is not allowed in native autonomous execution.')
  if (!input.task.toolKey) throw new Error('Agent task is missing toolKey.')
  if (!input.projectId.trim()) throw new Error('Native workflow binding requires projectId.')
  if (!input.idempotencyKey.trim()) throw new Error('Native workflow binding requires idempotencyKey.')

  return {
    id: input.task.key,
    agentKey: input.task.agentKey,
    toolKey: input.task.toolKey,
    projectId: input.projectId,
    input: input.payload,
    dependsOn: [...input.task.dependencies],
    idempotencyKey: input.idempotencyKey,
  }
}
