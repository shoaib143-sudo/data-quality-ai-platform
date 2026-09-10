type ProfilingRequestInput = Record<string, unknown>

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Keep only orchestration metadata that is safe to carry through a profiling run.
 *
 * Dataset rows, metric values, findings, scores, source configuration and other
 * caller supplied evidence are deliberately excluded. Profiling evidence must be
 * loaded from the authorized dataset execution source instead of the HTTP body.
 */
export function sanitizeProfilingRequestInput(input: ProfilingRequestInput) {
  const safe: Record<string, unknown> = {}

  const trigger = text(input.trigger)
  if (trigger) safe.trigger = trigger

  const workflowInstanceId = text(input.workflowInstanceId ?? input.workflow_instance_id)
  if (workflowInstanceId) safe.workflowInstanceId = workflowInstanceId

  const correlationId = text(input.correlationId ?? input.correlation_id)
  if (correlationId) safe.correlationId = correlationId

  return safe
}
