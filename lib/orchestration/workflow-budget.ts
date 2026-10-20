export type WorkflowBudget = {
  maxRuntimeMs: number
  maxTaskExecutions: number
  maxAgentExecutions: number
  maxMcpCalls: number
  maxToolCalls: number
}

export type WorkflowUsage = {
  startedAtMs: number
  taskExecutions: number
  agentExecutions: number
  mcpCalls: number
  toolCalls: number
}

export function assertWithinWorkflowBudget(budget: WorkflowBudget, usage: WorkflowUsage, nowMs = Date.now()) {
  const values = Object.values(budget)
  if (values.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('Workflow budget limits must be finite and positive.')
  if (nowMs - usage.startedAtMs > budget.maxRuntimeMs) throw new Error('Workflow runtime budget exceeded.')
  if (usage.taskExecutions >= budget.maxTaskExecutions) throw new Error('Workflow task execution budget exceeded.')
  if (usage.agentExecutions >= budget.maxAgentExecutions) throw new Error('Workflow agent execution budget exceeded.')
  if (usage.mcpCalls >= budget.maxMcpCalls) throw new Error('Workflow MCP call budget exceeded.')
  if (usage.toolCalls >= budget.maxToolCalls) throw new Error('Workflow tool call budget exceeded.')
}
