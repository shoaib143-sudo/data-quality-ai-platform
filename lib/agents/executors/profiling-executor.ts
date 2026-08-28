import type {
  ToolExecutionContext,
  ToolExecutionResult,
} from "../types"

import {
  executeProfilingTool,
} from "@/lib/profiling/executor"
import {
  executeProfilingMetrics,
} from "@/lib/profiling/metric-engine"

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
    input?.datasetVersionId ??
    input?.dataset_version_id

  if (!datasetVersionId) {
    throw new Error(
      "datasetVersionId is required for profiling execution",
    )
  }

  const profilingRunId =
    input?.profilingRunId ??
    input?.profiling_run_id

  if (operation === "execute_metrics") {
    if (!profilingRunId) {
      throw new Error(
        "profilingRunId is required for execute_metrics",
      )
    }

    const result = await executeProfilingMetrics(
      datasetVersionId,
      profilingRunId,
      input,
    )

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

  const result =
    await executeProfilingTool({
      toolKey: operation,
      datasetVersionId,
      profilingRunId,
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
