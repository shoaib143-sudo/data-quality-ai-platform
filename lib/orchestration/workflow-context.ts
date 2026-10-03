export type WorkflowContextValue = {
  value: unknown
  classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'
  source: string
}

export type WorkflowContext = Readonly<Record<string, WorkflowContextValue>>

export function deriveTaskContext(input: {
  workflowContext: WorkflowContext
  allowedKeys: readonly string[]
  maxEntries?: number
}): WorkflowContext {
  const maxEntries = input.maxEntries ?? 64
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('maxEntries must be a positive integer.')
  const allowed = [...new Set(input.allowedKeys)]
  if (allowed.length > maxEntries) throw new Error('Task context exceeds the configured entry budget.')
  const result: Record<string, WorkflowContextValue> = {}
  for (const key of allowed) {
    const item = input.workflowContext[key]
    if (item) result[key] = item
  }
  return Object.freeze(result)
}
