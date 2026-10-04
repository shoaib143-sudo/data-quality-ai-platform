export type WorkflowDataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'

export type WorkflowContextValue = {
  value: unknown
  classification: WorkflowDataClassification
  source: string
}

export type WorkflowContext = Readonly<Record<string, WorkflowContextValue>>

const rank: Record<WorkflowDataClassification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
}

export function deriveTaskContext(input: {
  workflowContext: WorkflowContext
  allowedKeys: readonly string[]
  maxClassification: WorkflowDataClassification
  maxEntries?: number
}): WorkflowContext {
  const maxEntries = input.maxEntries ?? 64
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('maxEntries must be a positive integer.')
  const allowed = [...new Set(input.allowedKeys)]
  if (allowed.length > maxEntries) throw new Error('Task context exceeds the configured entry budget.')
  const result: Record<string, WorkflowContextValue> = {}
  for (const key of allowed) {
    const item = input.workflowContext[key]
    if (!item) throw new Error(`Required task context key is unavailable: ${key}`)
    if (!item.source.trim()) throw new Error(`Task context source is required: ${key}`)
    if (rank[item.classification] > rank[input.maxClassification]) throw new Error(`Task context classification exceeds authorized ceiling: ${key}`)
    result[key] = Object.freeze({ ...item })
  }
  return Object.freeze(result)
}
