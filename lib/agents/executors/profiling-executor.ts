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

const PRODUCTION_AGENT_KEY = "profiling_agent"
const PRODUCTION_AGENT_VERSION = "2.0"

export async function executeProfilingExecutor(
  operation: string,
  input: any,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const {
    agentRunId,
    stepId,
    projectId,
    agentDefinitionId,
    agentVersion,
  } = context

  if (!agentDefinitionId || !agentVersion) {
    throw new Error("Profiling executor requires an agent definition and version")
  }

  if (agentVersion !== PRODUCTION_AGENT_VERSION) {
    throw new Error(
      `Profiling Agent ${agentVersion} is disabled for execution; production version is ${PRODUCTION_AGENT_VERSION}`,
    )
  }

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
