export type ReasoningTask =
  | 'profiling_investigation'
  | 'governance_reasoning'
  | 'incident_investigation'
  | 'general'

export type ReasoningRequest = {
  task: ReasoningTask
  system: string
  input: Record<string, unknown>
  temperature?: number
}

export type ReasoningUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type ReasoningResult = {
  provider: string
  model: string
  result: Record<string, unknown>
  latencyMs: number
  usage?: ReasoningUsage
  providerRequestId?: string
}

export interface ReasoningProvider {
  readonly id: string
  generateJson(request: ReasoningRequest): Promise<ReasoningResult>
}

export type ReasoningProviderSelection = {
  providerId?: string | null
  model?: string | null
}

type OpenAICompatibleConfig = {
  apiKey: string
  baseUrl: string
  model: string
}

type OpenAICompatibleUsage = {
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_tokens?: unknown
}

function extractJson(content: string) {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}

function observedTokenCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function observedUsage(value: OpenAICompatibleUsage | undefined): ReasoningUsage | undefined {
  if (!value) return undefined
  const inputTokens = observedTokenCount(value.prompt_tokens)
  const outputTokens = observedTokenCount(value.completion_tokens)
  const totalTokens = observedTokenCount(value.total_tokens)
  if (inputTokens == null && outputTokens == null && totalTokens == null) return undefined
  return {
    ...(inputTokens != null ? { inputTokens } : {}),
    ...(outputTokens != null ? { outputTokens } : {}),
    ...(totalTokens != null ? { totalTokens } : {}),
  }
}

function observedRequestId(response: Response) {
  for (const header of ['x-request-id', 'request-id']) {
    const value = response.headers.get(header)?.trim()
    if (value) return value.slice(0, 256)
  }
  return undefined
}

export class OpenAICompatibleReasoningProvider implements ReasoningProvider {
  readonly id = 'openai_compatible'
  private readonly config: OpenAICompatibleConfig

  constructor(config: OpenAICompatibleConfig) {
    this.config = config
  }

  async generateJson(request: ReasoningRequest): Promise<ReasoningResult> {
    const startedAt = performance.now()
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: request.temperature ?? 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: JSON.stringify(request.input) },
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`AI reasoning provider returned ${response.status}: ${text.slice(0, 500)}`)
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: OpenAICompatibleUsage
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('AI reasoning provider returned no content.')

    const result = extractJson(content)
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('AI reasoning provider returned an invalid JSON object.')
    }

    const usage = observedUsage(payload.usage)
    const providerRequestId = observedRequestId(response)

    return {
      provider: this.id,
      model: this.config.model,
      result: result as Record<string, unknown>,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...(usage ? { usage } : {}),
      ...(providerRequestId ? { providerRequestId } : {}),
    }
  }
}

export function createReasoningProvider(selection: ReasoningProviderSelection = {}): ReasoningProvider | null {
  const apiKey = process.env.AI_MODEL_API_KEY?.trim()
  if (!apiKey) return null

  const provider = (selection.providerId ?? process.env.AI_REASONING_PROVIDER ?? 'openai_compatible').trim()
  if (provider !== 'openai_compatible') {
    throw new Error(`Unsupported AI reasoning provider: ${provider}`)
  }

  return new OpenAICompatibleReasoningProvider({
    apiKey,
    baseUrl: (process.env.AI_MODEL_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: selection.model?.trim() || process.env.AI_MODEL_NAME?.trim() || 'gpt-4.1-mini',
  })
}

export function getReasoningProvider(): ReasoningProvider | null {
  return createReasoningProvider()
}
