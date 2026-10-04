export type BrowserExecutionMode = 'AUTONOMOUS' | 'DETERMINISTIC' | 'VERIFY_ONLY'
export type BrowserActionRisk = 'READ' | 'LOW' | 'MEDIUM' | 'HIGH'
export type BrowserExecutionStatus = 'CREATED' | 'RUNNING' | 'WAITING_APPROVAL' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export type BrowserExecutionPolicy = {
  allowedDomains: readonly string[]
  deniedDomains?: readonly string[]
  allowDownloads?: boolean
  allowUploads?: boolean
  allowCredentialEntry?: boolean
  maxDurationMs: number
  maxActions: number
}

export type BrowserExecutionRequest = {
  runId: string
  agentRunId: string
  projectId: string
  persona: string
  purpose: string
  mode: BrowserExecutionMode
  startUrl: string
  task: string
  risk: BrowserActionRisk
  policy: BrowserExecutionPolicy
  expectedOutcome?: Record<string, unknown>
}

export type BrowserEvidence = {
  kind: 'SCREENSHOT' | 'ACTION' | 'STATE' | 'VERIFICATION'
  capturedAt: string
  uri?: string
  sha256?: string
  metadata?: Record<string, unknown>
}

export type BrowserExecutionResult = {
  provider: string
  providerSessionId: string
  status: BrowserExecutionStatus
  startedAt: string
  completedAt?: string
  liveViewUrl?: string
  finalUrl?: string
  output?: Record<string, unknown>
  evidence: readonly BrowserEvidence[]
  errorCode?: string
  errorMessage?: string
}

export interface BrowserExecutionProvider {
  readonly key: string
  execute(request: BrowserExecutionRequest): Promise<BrowserExecutionResult>
  getStatus(providerSessionId: string): Promise<BrowserExecutionResult>
  cancel(providerSessionId: string): Promise<void>
}
