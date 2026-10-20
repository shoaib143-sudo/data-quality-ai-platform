import type { TelemetryProvider } from '@/lib/ai/telemetry-provider'
import type { WorkflowRunIdentity } from './workflow-run-identity'

export async function recordWorkflowTaskTelemetry(input: {
  telemetry: TelemetryProvider
  identity: WorkflowRunIdentity
  projectId: string
  taskKey: string
  capabilityKey: string
  status: 'INFO' | 'SUCCESS' | 'ERROR'
  latencyMs?: number
  attempt: number
}) {
  if (!input.taskKey.trim() || !input.capabilityKey.trim()) throw new Error('Workflow telemetry requires task and capability identity.')
  if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error('Workflow telemetry attempt must be >= 1.')
  return input.telemetry.record({
    projectId: input.projectId,
    eventType: 'WORKFLOW_TASK',
    operation: input.capabilityKey,
    status: input.status,
    correlationId: input.identity.correlationId,
    latencyMs: input.latencyMs,
    attributes: {
      workflow_run_id: input.identity.workflowRunId,
      workflow_key: input.identity.workflowKey,
      workflow_version: input.identity.workflowVersion,
      definition_hash: input.identity.definitionHash,
      task_key: input.taskKey,
      attempt: input.attempt,
    },
  })
}
