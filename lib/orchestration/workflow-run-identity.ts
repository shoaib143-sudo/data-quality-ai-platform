import { createHash, randomUUID } from 'node:crypto'

export type WorkflowRunIdentity = {
  workflowRunId: string
  correlationId: string
  workflowKey: string
  workflowVersion: number
  definitionHash: string
  createdAt: string
}

export function createWorkflowRunIdentity(input: {
  workflowKey: string
  workflowVersion: number
  canonicalDefinition: string
  correlationId?: string
  now?: Date
}): WorkflowRunIdentity {
  if (!input.workflowKey.trim()) throw new Error('workflowKey is required.')
  if (!Number.isInteger(input.workflowVersion) || input.workflowVersion < 1) throw new Error('workflowVersion must be >= 1.')
  if (!input.canonicalDefinition.trim()) throw new Error('canonicalDefinition is required.')
  return {
    workflowRunId: randomUUID(),
    correlationId: input.correlationId?.trim() || randomUUID(),
    workflowKey: input.workflowKey,
    workflowVersion: input.workflowVersion,
    definitionHash: createHash('sha256').update(input.canonicalDefinition).digest('hex'),
    createdAt: (input.now ?? new Date()).toISOString(),
  }
}
