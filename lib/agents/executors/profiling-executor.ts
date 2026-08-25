import type {
  ToolExecutionContext,
  ToolExecutionResult,
} from "../types"

import {
  executeProfilingTool,
} from "@/lib/profiling/executor"

export async function executeProfilingExecutor(
  operation: string,
  input: any,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const {
    agentRunId,
    stepId,
    projectId,
  } = context

  const datasetVersionId =
    input?.datasetVersionId

  if (!datasetVersionId) {
    throw new Error(
      "datasetVersionId is required for profiling execution",
    )
  }

  const result =
    await executeProfilingTool({
      toolKey: operation,
      datasetVersionId,
      profilingRunId:
        input?.profilingRunId,
      input,
    })

  return {
    output: {
      execution_completed: true,
      agent_run_id: agentRunId,
      step_id: stepId,
      project_id: projectId,
      operation,
      result,
    },
  }
}