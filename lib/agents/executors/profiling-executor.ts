import type { ToolExecutionContext, ToolExecutionResult } from '../types'
import { detectDuplicates, detectOutliers, detectPatterns, detectSensitiveColumns, inferCandidateKeys } from '@/lib/profiling/derived-tools'
import { executeProfilingMetrics } from '@/lib/profiling/metric-engine'
import { executeProfilingMetricsReplaySafe } from '@/lib/profiling/metric-replay'
import { executeProfileDatasetReplaySafe } from '@/lib/profiling/profile-dataset-replay'
import { investigateProfilingRun } from '@/lib/profiling/investigation-engine'
import { investigateProfilingRunReplaySafe } from '@/lib/profiling/investigation-replay'
import { executeProfilingTool } from '@/lib/profiling/executor'
import { executeJdbcProfileDataset } from '@/lib/profiling/jdbc-profile'
import { executeFileProfileDataset } from '@/lib/profiling/file-profile'
import { compareProfilesReplaySafe } from '@/lib/profiling/replay-safe-comparison'
import { assertDatasetVersionProfileReady } from '@/lib/profiling/readiness-gate'
import {
  completeProfileRunReplaySafe,
  persistProfileSnapshotReplaySafe,
} from '@/lib/profiling/replay-safe-tools'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAgentRunLog } from '@/lib/agents/run-log'
import {
  admitNativeToolInvocation,
  completeNativeToolInvocation,
  failNativeToolInvocation,
} from '@/lib/agents/runtime/native-tool-contracts'

const PRODUCTION_AGENT_VERSION = '2.0'
const EXECUTOR_KEY = 'profiling-executor'
const DATASET_VERSION_OPTIONAL_OPERATIONS = new Set([
  'compare_profiles',
  'persist_profile_snapshot',
  'complete_profile_run',
])
const PROFILE_READINESS_GATED_OPERATIONS = new Set([
  'profile_dataset',
  'execute_metrics',
])

export async function executeProfilingExecutor(operation: string, input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { agentRunId, stepId, projectId, agentDefinitionId, agentVersion } = context
  if (!agentDefinitionId || !agentVersion) throw new Error('Profiling executor requires an agent definition and version')
  if (agentVersion !== PRODUCTION_AGENT_VERSION) throw new Error(`Profiling Agent ${agentVersion} is disabled for execution; production version is ${PRODUCTION_AGENT_VERSION}`)
  const suppliedDatasetVersionId = input?.datasetVersionId ?? input?.dataset_version_id
  const suppliedProfilingRunId = input?.profilingRunId ?? input?.profiling_run_id
  if (!DATASET_VERSION_OPTIONAL_OPERATIONS.has(operation) && !suppliedDatasetVersionId) throw new Error('datasetVersionId is required for profiling execution')

  let invocationId: string | null = null
  await writeAgentRunLog({ agentRunId, agentRunStepId: stepId, level: 'LIFECYCLE', eventType: 'PROFILING_EXECUTION_STARTED', message: `Profiling Agent ${PRODUCTION_AGENT_VERSION} started ${operation}.`, details: { operation, projectId, datasetVersionId: suppliedDatasetVersionId, profilingRunId: suppliedProfilingRunId, agentDefinitionId, agentVersion } })
  try {
    // Fail closed only for operations that read source data or generate source-derived
    // metric evidence. Diagnostic and investigation operations intentionally remain
    // available so agents can explain blockers and perform separately authorized
    // remediation. Every retry re-evaluates deterministic readiness from current
    // governed evidence; the agent itself never decides that a dataset is READY.
    if (PROFILE_READINESS_GATED_OPERATIONS.has(operation)) {
      if (!projectId) throw new Error('projectId is required for profiling readiness enforcement')
      const readiness = await assertDatasetVersionProfileReady(projectId, suppliedDatasetVersionId)
      await writeAgentRunLog({
        agentRunId,
        agentRunStepId: stepId,
        level: 'LIFECYCLE',
        eventType: 'PROFILE_READINESS_CONFIRMED',
        message: `Dataset version is READY for ${operation}.`,
        details: {
          operation,
          projectId,
          datasetVersionId: suppliedDatasetVersionId,
          readinessState: readiness.state,
          readinessPolicy: readiness.readiness_policy ?? null,
          sourceType: readiness.source_type ?? null,
          discoveryRunId: readiness.discovery_run_id ?? null,
          scopeVersionId: readiness.scope_version_id ?? null,
        },
      })
    }

    const admission = await admitNativeToolInvocation({
      agentRunId,
      toolKey: operation,
      expectedExecutor: EXECUTOR_KEY,
      toolInput: input as Record<string, unknown>,
    })
    invocationId = admission.invocationId
    const toolInput = admission.toolInput as Record<string, any>
    const datasetVersionId = toolInput.datasetVersionId ?? toolInput.dataset_version_id
    const profilingRunId = toolInput.profilingRunId ?? toolInput.profiling_run_id

    let result: unknown
    switch (operation) {
      case 'profile_dataset': {
        if (!profilingRunId) throw new Error('profilingRunId is required for profile_dataset')
        result = await executeProfileDatasetReplaySafe({
          datasetVersionId,
          profilingRunId,
          execute: async () => {
            const admin = createAdminClient()
            const { data: version, error } = await admin.schema('catalog').from('dataset_versions').select('id, datasets(source_identifier, data_sources(source_type))').eq('id', datasetVersionId).single()
            if (error || !version) throw new Error(`Unable to resolve dataset version for profile execution: ${error?.message ?? 'not found'}`)
            const dataset = Array.isArray(version.datasets) ? version.datasets[0] : version.datasets
            const sources = dataset?.data_sources
            const source = Array.isArray(sources) ? sources[0] : sources
            const sourceType = String(source?.source_type ?? '').trim().toLowerCase()
            if (sourceType === 'jdbc') return executeJdbcProfileDataset(datasetVersionId, profilingRunId)
            if (sourceType === 'file' || sourceType === 'csv') return executeFileProfileDataset(datasetVersionId, profilingRunId)
            return executeProfilingTool({ toolKey: operation, datasetVersionId, profilingRunId, input: toolInput })
          },
        })
        break
      }
      case 'execute_metrics':
        if (!profilingRunId) throw new Error('profilingRunId is required for execute_metrics')
        // Metric evidence must always come from the registered execution source.
        // Never forward caller supplied rows, metric values, findings, or scores.
        // The replay wrapper claims execution before source loading, and completed
        // replays return durable evidence without rewriting metrics/findings/scores.
        result = await executeProfilingMetricsReplaySafe({
          datasetVersionId,
          profilingRunId,
          execute: () => executeProfilingMetrics(datasetVersionId, profilingRunId, {}),
        }); break
      case 'investigate_profile':
        if (!profilingRunId) throw new Error('profilingRunId is required for investigate_profile')
        result = await investigateProfilingRunReplaySafe({
          profilingRunId,
          datasetVersionId,
          execute: () => investigateProfilingRun(profilingRunId, datasetVersionId),
        }); break
      case 'persist_profile_snapshot':
        result = await persistProfileSnapshotReplaySafe(toolInput); break
      case 'complete_profile_run':
        result = await completeProfileRunReplaySafe(toolInput); break
      case 'detect_patterns':
        if (!profilingRunId) throw new Error('profilingRunId is required for detect_patterns')
        result = await detectPatterns(profilingRunId); break
      case 'infer_candidate_keys':
        if (!profilingRunId) throw new Error('profilingRunId is required for infer_candidate_keys')
        result = await inferCandidateKeys(profilingRunId); break
      case 'detect_outliers':
        if (!profilingRunId) throw new Error('profilingRunId is required for detect_outliers')
        result = await detectOutliers(profilingRunId); break
      case 'detect_sensitive_columns':
        if (!profilingRunId) throw new Error('profilingRunId is required for detect_sensitive_columns')
        result = await detectSensitiveColumns(profilingRunId); break
      case 'detect_duplicates':
        if (!profilingRunId) throw new Error('profilingRunId is required for detect_duplicates')
        result = await detectDuplicates(profilingRunId); break
      case 'compare_profiles': {
        const baselineProfileRunId = toolInput.baselineProfileRunId ?? toolInput.baseline_profile_run_id
        const targetProfileRunId = toolInput.targetProfileRunId ?? toolInput.target_profile_run_id ?? toolInput.current_profile_run_id
        if (!baselineProfileRunId) throw new Error('baselineProfileRunId is required for compare_profiles')
        if (!targetProfileRunId) throw new Error('targetProfileRunId is required for compare_profiles')
        result = await compareProfilesReplaySafe({ baselineProfileRunId, targetProfileRunId }); break
      }
      default:
        result = await executeProfilingTool({ toolKey: operation, datasetVersionId, profilingRunId, input: toolInput })
    }

    await completeNativeToolInvocation({ invocationId: admission.invocationId, contract: admission.contract, output: result })
    await writeAgentRunLog({ agentRunId, agentRunStepId: stepId, level: operation === 'execute_metrics' ? 'METRIC' : 'TOOL', eventType: operation === 'execute_metrics' ? 'PROFILING_METRICS_COMPLETED' : 'PROFILING_TOOL_COMPLETED', message: `Profiling operation ${operation} completed.`, details: { operation, datasetVersionId, profilingRunId, invocationId: admission.invocationId, contractHash: admission.contract.contract_hash } })
    return { output: { execution_completed: true, agent_run_id: agentRunId, step_id: stepId, project_id: projectId, operation, result: result as Record<string, unknown> } }
  } catch (error) {
    if (invocationId) {
      try {
        await failNativeToolInvocation({ invocationId, error })
      } catch (evidenceError) {
        console.error('[profiling-executor] unable to persist tool failure evidence', evidenceError)
      }
    }
    await writeAgentRunLog({ agentRunId, agentRunStepId: stepId, level: 'ERROR', eventType: 'PROFILING_EXECUTION_FAILED', message: error instanceof Error ? error.message : 'Profiling execution failed.', details: { operation, datasetVersionId: suppliedDatasetVersionId, profilingRunId: suppliedProfilingRunId, invocationId } })
    throw error
  }
}