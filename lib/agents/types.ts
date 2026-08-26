export interface ToolExecutionContext {
  agentRunId: string
  stepId: string
  projectId: string
}

export interface ToolExecutionResult {
  output: Record<string, unknown>
}
