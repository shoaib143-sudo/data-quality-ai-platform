export type AgentExecutionInput = {
  project_id: string
  dataset_id?: string
  dataset_version_id?: string
  input?: Record<string, unknown>
}

export type ToolExecutionContext = {
  agentRunId: string
  stepId: string
  projectId: string
}

export type ToolExecutionResult = {
  output: Record<string, unknown>
}