export type BrowserExecutionRisk = 'READ_ONLY' | 'LOW' | 'HIGH'

export type BrowserExecutionRequest = {
  runId: string
  projectId: string
  task: string
  startUrl: string
  allowedOrigins: readonly string[]
  risk: BrowserExecutionRisk
  approvalId?: string | null
  timeoutMs?: number
}

export type BrowserExecutionEvidence = {
  kind: 'SCREENSHOT' | 'ACTION' | 'STATE' | 'VERIFICATION'
  occurredAt: string
  ref: string
  sha256?: string | null
}

export type BrowserExecutionResult = {
  provider: string
  sessionId: string
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  liveViewUrl: string | null
  finalUrl: string | null
  summary: string | null
  evidence: readonly BrowserExecutionEvidence[]
}

export interface BrowserExecutionProvider {
  readonly key: string
  execute(request: BrowserExecutionRequest, signal?: AbortSignal): Promise<BrowserExecutionResult>
  cancel(sessionId: string): Promise<void>
}
