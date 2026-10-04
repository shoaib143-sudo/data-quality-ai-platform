import { assertBrowserExecutionPolicy } from './policy'
import type { BrowserExecutionProvider, BrowserExecutionRequest, BrowserExecutionResult } from './contracts'

type BrowserUseConfig = {
  apiKey: string
  baseUrl?: string
}

/**
 * Browser Use v2 transport kept deliberately small behind the provider contract.
 * DataNexus policy remains authoritative for scope and approvals. A v4 SDK adapter
 * can replace this transport without changing governed callers.
 */
export class BrowserUseProvider implements BrowserExecutionProvider {
  readonly key = 'browser-use'
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(config: BrowserUseConfig) {
    this.apiKey = config.apiKey.trim()
    if (!this.apiKey) throw new Error('Browser Use API key is required')
    this.baseUrl = (config.baseUrl ?? 'https://api.browser-use.com').replace(/\/$/, '')
  }

  private headers() {
    return {
      'X-Browser-Use-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    }
  }

  async execute(request: BrowserExecutionRequest, signal?: AbortSignal): Promise<BrowserExecutionResult> {
    const policy = assertBrowserExecutionPolicy(request)
    const response = await fetch(`${this.baseUrl}/api/v2/tasks`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        task: `Start at ${request.startUrl}. ${request.task}. Do not navigate outside these allowed origins: ${policy.allowedOrigins.join(', ')}.`,
      }),
      signal,
    })
    if (!response.ok) throw new Error(`Browser Use task creation failed with HTTP ${response.status}`)
    const payload = await response.json() as Record<string, unknown>
    const taskId = String(payload.id ?? '')
    const sessionId = String(payload.sessionId ?? '')
    if (!taskId || !sessionId) throw new Error('Browser Use returned an incomplete task identity')

    return {
      provider: this.key,
      sessionId: taskId,
      status: 'SUCCEEDED',
      liveViewUrl: null,
      finalUrl: null,
      summary: null,
      evidence: [{
        kind: 'STATE',
        occurredAt: new Date().toISOString(),
        ref: `browser-use:task:${taskId}:session:${sessionId}`,
      }],
    }
  }

  async cancel(taskId: string) {
    if (!taskId.trim()) throw new Error('Browser task id is required')
    const response = await fetch(`${this.baseUrl}/api/v2/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ action: 'stop' }),
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(`Browser Use cancellation failed with HTTP ${response.status}`)
    }
  }
}
