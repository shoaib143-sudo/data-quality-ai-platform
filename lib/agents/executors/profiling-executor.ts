import type {
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types'

import {
  compareProfiles,
  detectDuplicates,
  detectOutliers,
  detectPatterns,
  detectSensitiveColumns,
  inferCandidateKeys,
} from '@/lib/profiling/derived-tools'
import { executeProfilingMetrics } from '@/lib/profiling/metric-engine'
import { investigateProfilingRun } from '@/lib/profiling/investigation-engine'
import { executeProfilingTool } from '@/lib/profiling/executor'
import { writeAgentRunLog } from '@/lib/agents/run-log'

const PRODUCTION_AGENT_VERSION = '2.0'

export async function executeProfilingExecutor(
  operation: string,
  input: any,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const { agentRunId, stepId, projectId, agentDefinitionId, agentVersion } = context
  if (!agentDefinitionId || !agentVersion) throw new Error('Profiling executor requires an agent definition and version')
  if (agentVersion !== PRODUCTION_AGENT_VERSION) throw new Error(`Profiling Agent ${agentVersion} is disabled for execution; production version is ${PRODUCTION_AGENT_VERSION}`)

  const datasetVersionId = input?.datasetVersionId ?? input?.dataset_version_id
  const profilingRunId = input?.profilingRunId ?? input?.profiling_run_id
  const requiresDatasetVersion = !['compare_profiles'].includes(operation)
  if (requiresDatasetVersion && !datasetVersionId) throw new Error('datasetVersionId is required for profiling execution')

  await writeAgentRunLog({
    agentRunId,
    agentRunStepId: stepId,
    level: 'LIFECYCLE',
    eventType: 'PROFILING_EXECUTION_STARTED',
    message: `Profiling Agent ${PRODUCTION_AGENT_VERSION} started ${operation}.`,
    details: { operation, projectId, datasetVersionId, profilingRunId, agentDefinitionId, agentVersion },
  })

  try {
    let result: unknown
    switch (operation) {
      case 'execute_metrics':
        if (!profilingRunId) throw new Error('profilingRunId is required for execute_metrics')
        result = await executeProfilingMetrics(datasetVersionId, profilingRunId, input)
        break
      case 'investigate_profile':
        if (!profilingRunId) throw new Error('profilingRunId is required for investigate_profile')
        result = await investigateProfilingRun(profilingRunId, datasetVersionId)
        break
      case 'detect_patterns':
        if (!profilingRunId) throw new Error('profilingRunId is required for detect_patterns')
        result = await detectPatterns(profilingRunId)
        break
      case 'infer_candidate_keys':
        if (!profilingRunId) throw new Error('profilingRunId is required for infer_candidate_keys')
        result = await inferCandidateKeys(profilingRunId)
        break
      case 'detect_outliers':
        if (!profilingRunId) throw new Error('profilingRunId is required for detect_outliers')
        result = await detectOutliers(profilingRunId)
        break
      case 'detect_sensitive_columns':
        if (!profilingRunId) throw new Error('profilingRunId is required for detect_sensitive_columns')
        result = await detectSensitiveColumns(profilingRunId)
        break
      case 'detect_duplicates':
        if (!profilingRunId) throw new Error('profilingRunId is required for detect_duplicates')
        result = await detectDuplicates(profilingRunId)
        break
      case 'compare_profiles':
        result = await compareProfiles(input?.baselineProfileRunId ?? input?.baseline_profile_run_id, input?.targetProfileRunId ?? input?.target_profile_run_id)
        break
      default:
        if (!datasetVersionId) throw new Error('datasetVersionId is required for profiling execution')
        result = await executeProfilingTool({ toolKey: operation, datasetVersionId, profilingRunId, input })
    }

    await writeAgentRunLog({
      agentRunId,
      agentRunStepId: stepId,
      level: operation === 'execute_metrics' ? 'METRIC' : 'TOOL',
      eventType: operation === 'execute_metrics' ? 'PROFILING_METRICS_COMPLETED' : 'PROFILING_TOOL_COMPLETED',
      message: `Profiling operation ${operation} completed.`,
      details: { operation, datasetVersionId, profilingRunId },
    })

    return {
      output: {
        execution_completed: true,
        agent_run_id: agentRunId,
        step_id: stepId,
        project_id: projectId,
        operation,
        result: result as Record<string, unknown>,
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
