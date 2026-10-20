import { createHash } from 'node:crypto'

export type WorkflowEvidenceRecord = {
  workflowRunId: string
  taskKey: string
  correlationId: string
  evidenceType: string
  payloadHash: string
  observedAt: string
}

export function createWorkflowEvidenceRecord(input: {
  workflowRunId: string
  taskKey: string
  correlationId: string
  evidenceType: string
  canonicalPayload: string
  observedAt?: Date
}): WorkflowEvidenceRecord {
  for (const [label, value] of Object.entries({
    workflowRunId: input.workflowRunId,
    taskKey: input.taskKey,
    correlationId: input.correlationId,
    evidenceType: input.evidenceType,
    canonicalPayload: input.canonicalPayload,
  })) if (!value.trim()) throw new Error(`${label} is required for workflow evidence.`)
  return {
    workflowRunId: input.workflowRunId,
    taskKey: input.taskKey,
    correlationId: input.correlationId,
    evidenceType: input.evidenceType,
    payloadHash: createHash('sha256').update(input.canonicalPayload).digest('hex'),
    observedAt: (input.observedAt ?? new Date()).toISOString(),
  }
}
