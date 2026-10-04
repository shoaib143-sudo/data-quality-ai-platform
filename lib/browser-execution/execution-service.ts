import { assertBrowserExecutionPolicy } from './policy'
import type { BrowserExecutionProvider, BrowserExecutionRequest, BrowserExecutionResult } from './contracts'

export type BrowserExecutionAudit = {
  runId: string
  projectId: string
  provider: string
  taskId: string
  startedAt: string
  result: BrowserExecutionResult
}

export async function executeGovernedBrowserTask(input: {
  provider: BrowserExecutionProvider
  request: BrowserExecutionRequest
  signal?: AbortSignal
  recordAudit?: (audit: BrowserExecutionAudit) => Promise<void>
}) {
  assertBrowserExecutionPolicy(input.request)
  const startedAt = new Date().toISOString()
  const result = await input.provider.execute(input.request, input.signal)
  if (result.provider !== input.provider.key) throw new Error('Browser provider identity mismatch')
  if (!result.sessionId.trim()) throw new Error('Browser provider returned no governed execution identity')

  await input.recordAudit?.({
    runId: input.request.runId,
    projectId: input.request.projectId,
    provider: input.provider.key,
    taskId: result.sessionId,
    startedAt,
    result,
  })
  return result
}
