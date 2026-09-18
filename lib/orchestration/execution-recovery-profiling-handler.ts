import { executeProfilingExecutor } from '@/lib/agents/executors/profiling-executor'
import type { ToolExecutionContext } from '@/lib/agents/types'
import type { RecoveryFailureContext } from './execution-recovery-contract'
import type { RecoveryHandler } from './execution-recovery-runtime'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

type MetricRetryInput = {
  datasetVersionId: string
  profilingRunId: string
  agentRunId: string
  stepId: string
  agentDefinitionId: string
  agentVersion: string
}

function metricRetryInput(context: RecoveryFailureContext): MetricRetryInput | null {
  const params = record(context.repairParameters)
  const datasetVersionId = stringValue(params.datasetVersionId ?? params.dataset_version_id)
  const profilingRunId = stringValue(params.profilingRunId ?? params.profiling_run_id)
  const agentRunId = stringValue(params.agentRunId ?? params.agent_run_id)
  const stepId = stringValue(params.stepId ?? params.step_id)
  const agentDefinitionId = stringValue(params.agentDefinitionId ?? params.agent_definition_id)
  const agentVersion = stringValue(params.agentVersion ?? params.agent_version)
  if (!datasetVersionId || !profilingRunId || !agentRunId || !stepId || !agentDefinitionId || !agentVersion) return null
  return { datasetVersionId, profilingRunId, agentRunId, stepId, agentDefinitionId, agentVersion }
}

export function createMetricExecutionRecoveryHandler(input?: {
  execute?: (operation: string, payload: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>
}): RecoveryHandler {
  const execute = input?.execute ?? executeProfilingExecutor
  const resultByCase = new Map<string, Record<string, unknown>>()

  return {
    key: 'profiling-metric-retry',

    canHandle(context) {
      return context.failingStage === 'METRIC_EXECUTION'
        && context.knownRepairClass === 'RETRY_SAFE_RUNTIME_REPAIR'
        && metricRetryInput(context) !== null
    },

    async diagnose(context) {
      if (!metricRetryInput(context)) throw new Error('Metric recovery requires pinned profiling execution identity.')
      return {
        rootCause: `Persisted profiling evidence classifies ${context.code ?? 'the metric failure'} as retry-safe without invalidating upstream checkpoints.`,
        repairClass: 'RETRY_SAFE_RUNTIME_REPAIR',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    async proposeRepair(context) {
      const ids = metricRetryInput(context)
      if (!ids) throw new Error('Metric recovery requires pinned profiling execution identity.')
      return {
        repairClass: 'RETRY_SAFE_RUNTIME_REPAIR',
        toolKey: 'profiling-executor:execute_metrics',
        mutationScope: `project:${context.projectId}:profile-run:${ids.profilingRunId}`,
        payload: { datasetVersionId: ids.datasetVersionId, profilingRunId: ids.profilingRunId },
      }
    },

    async apply(context) {
      const ids = metricRetryInput(context)
      if (!ids) throw new Error('Metric recovery requires pinned profiling execution identity.')
      const toolContext: ToolExecutionContext = {
        agentRunId: ids.agentRunId,
        stepId: ids.stepId,
        projectId: context.projectId,
        agentDefinitionId: ids.agentDefinitionId,
        agentVersion: ids.agentVersion,
      }
      const result = await execute('execute_metrics', {
        datasetVersionId: ids.datasetVersionId,
        profilingRunId: ids.profilingRunId,
      }, toolContext)
      resultByCase.set(context.recoveryCaseId, record(result))
      return { mutationId: `metric-retry:${context.recoveryCaseId}:${ids.profilingRunId}` }
    },

    async validate(context) {
      const result = resultByCase.get(context.recoveryCaseId)
      if (!result) return { valid: false, code: 'METRIC_RETRY_EVIDENCE_MISSING' }
      const status = stringValue(result.status)
      const persisted = Number(result.metrics_persisted)
      const valid = status === 'COMPLETED' && Number.isSafeInteger(persisted) && persisted >= 0
      return {
        valid,
        code: valid ? 'METRIC_EXECUTION_RECOVERED' : 'METRIC_EXECUTION_STILL_INVALID',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    sameStageRetrySafe() {
      return true
    },
  }
}
