import { assertBrowserExecutionPolicy } from './policy'
import type { BrowserExecutionProvider, BrowserExecutionRequest, BrowserExecutionResult } from './contracts'

const DEFAULT_BASE_URL = 'https://api.browser-use.com'

export class BrowserUseProvider implements BrowserExecutionProvider {
  readonly key = 'browser-use'

  constructor(
    private readonly apiKey = process.env.BROWSER_USE_API_KEY,
    private readonly baseUrl = process.env.BROWSER_USE_BASE_URL ?? DEFAULT_BASE_URL,
  ) {}

  private headers() {
    if (!this.apiKey) throw new Error('BROWSER_USE_API_KEY_NOT_CONFIGURED')
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
  }

  async execute(request: BrowserExecutionRequest): Promise<BrowserExecutionResult> {
    assertBrowserExecutionPolicy(request)
    if (request.mode === 'DETERMINISTIC') throw new Error('BROWSER_USE_DETERMINISTIC_MODE_REQUIRES_CDP_ADAPTER')

    const response = await fetch(`${this.baseUrl}/api/v2/tasks`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        task: request.task,
        start_url: request.startUrl,
        max_steps: request.policy.maxActions,
        metadata: { runId: request.runId, agentRunId: request.agentRunId, projectId: request.projectId, persona: request.persona },
      }),
      signal: AbortSignal.timeout(request.policy.maxDurationMs),
    })
    if (!response.ok) throw new Error(`BROWSER_USE_CREATE_FAILED:${response.status}`)
    const data = await response.json() as Record<string, unknown>
    const id = String(data.id ?? data.task_id ?? '')
    if (!id) throw new Error('BROWSER_USE_CREATE_INVALID_RESPONSE')
    return this.mapResult(id, data)
  }

  async getStatus(providerSessionId: string): Promise<BrowserExecutionResult> {
    const response = await fetch(`${this.baseUrl}/api/v2/tasks/${encodeURIComponent(providerSessionId)}`, { headers: this.headers() })
    if (!response.ok) throw new Error(`BROWSER_USE_STATUS_FAILED:${response.status}`)
    return this.mapResult(providerSessionId, await response.json() as Record<string, unknown>)
  }

  async cancel(providerSessionId: string) {
    const response = await fetch(`${this.baseUrl}/api/v2/tasks/${encodeURIComponent(providerSessionId)}`, { method: 'DELETE', headers: this.headers() })
    if (!response.ok && response.status !== 404) throw new Error(`BROWSER_USE_CANCEL_FAILED:${response.status}`)
  }

  private mapResult(id: string, data: Record<string, unknown>): BrowserExecutionResult {
    const rawStatus = String(data.status ?? 'CREATED').toUpperCase()
    const status = rawStatus === 'FINISHED' || rawStatus === 'DONE' ? 'SUCCEEDED'
      : rawStatus === 'STOPPED' ? 'CANCELLED'
      : rawStatus === 'ERROR' ? 'FAILED'
      : rawStatus === 'RUNNING' ? 'RUNNING' : 'CREATED'
    return {
      provider: this.key,
      providerSessionId: id,
      status,
      startedAt: String(data.created_at ?? data.started_at ?? new Date().toISOString()),
      completedAt: data.finished_at ? String(data.finished_at) : undefined,
      liveViewUrl: data.live_url ? String(data.live_url) : data.live_view_url ? String(data.live_view_url) : undefined,
      finalUrl: data.final_url ? String(data.final_url) : undefined,
      output: typeof data.output === 'object' && data.output ? data.output as Record<string, unknown> : undefined,
      evidence: [],
      errorMessage: data.error ? String(data.error) : undefined,
    }
  }
}
