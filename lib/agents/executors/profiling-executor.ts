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
import { writeAgentRunLog } from "@/lib/agents/run-log"

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

  await writeAgentRunLog({
    agentRunId,
    agentRunStepId: stepId,
    level: 'LIFECYCLE',
    eventType: 'PROFILING_EXECUTION_STARTED',
    message: `Profiling Agent ${PRODUCTION_AGENT_VERSION} started ${operation}.`,
    details: { operation, projectId, datasetVersionId, profilingRunId, agentDefinitionId, agentVersion },
  })

  try {
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

      await writeAgentRunLog({
        agentRunId,
        agentRunStepId: stepId,
        level: 'METRIC',
        eventType: 'PROFILING_METRICS_COMPLETED',
        message: 'Profiling metrics execution completed.',
        details: { operation, datasetVersionId, profilingRunId },
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

    const result =
      await executeProfilingTool({
        toolKey: operation,
        datasetVersionId,
        profilingRunId,
        input,
      })

    await writeAgentRunLog({
      agentRunId,
      agentRunStepId: stepId,
      level: 'TOOL',
      eventType: 'PROFILING_TOOL_COMPLETED',
      message: `Profiling tool ${operation} completed.`,
      details: { operation, datasetVersionId, profilingRunId },
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
  } catch (error) {
    await writeAgentRunLog({
      agentRunId,
      agentRunStepId: stepId,
      level: 'ERROR',
      eventType: 'PROFILING_EXECUTION_FAILED',
      message: error instanceof Error ? error.message : 'Profiling execution failed.',
      details: { operation, datasetVersionId, profilingRunId },
    })
    throw error
  }
}
