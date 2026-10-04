import { assertBrowserExecutionPolicy } from './policy'
import type { BrowserExecutionProvider, BrowserExecutionRequest, BrowserExecutionResult } from './contracts'

type BrowserUseConfig = {
  apiKey: string
  baseUrl?: string
}

export class BrowserUseProvider implements BrowserExecutionProvider {
  readonly key = 'browser-use'
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(config: BrowserUseConfig) {
    this.apiKey = config.apiKey.trim()
    if (!this.apiKey) throw new Error('Browser Use API key is required')
    this.baseUrl = (config.baseUrl ?? 'https://api.browser-use.com').replace(/\/$/, '')
  }

  async execute(request: BrowserExecutionRequest, signal?: AbortSignal): Promise<BrowserExecutionResult> {
    const policy = assertBrowserExecutionPolicy(request)
    const response = await fetch(`${this.baseUrl}/api/v2/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: request.task,
        start_url: request.startUrl,
        allowed_domains: policy.allowedOrigins.map(origin => new URL(origin).hostname),
      }),
      signal,
    })
    if (!response.ok) throw new Error(`Browser Use task creation failed with HTTP ${response.status}`)
    const payload = await response.json() as Record<string, unknown>
    const sessionId = String(payload.id ?? payload.task_id ?? '')
    if (!sessionId) throw new Error('Browser Use returned no task identifier')

    return {
      provider: this.key,
      sessionId,
      status: 'SUCCEEDED',
      liveViewUrl: typeof payload.live_url === 'string' ? payload.live_url : null,
      finalUrl: typeof payload.final_url === 'string' ? payload.final_url : null,
      summary: typeof payload.output === 'string' ? payload.output : null,
      evidence: [],
    }
  }

  async cancel(sessionId: string) {
    if (!sessionId.trim()) throw new Error('Browser session id is required')
    const response = await fetch(`${this.baseUrl}/api/v2/tasks/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(`Browser Use cancellation failed with HTTP ${response.status}`)
    }
  }
}
