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

export type ReasoningResult = {
  provider: string
  model: string
  result: Record<string, unknown>
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

function extractJson(content: string) {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}

export class OpenAICompatibleReasoningProvider implements ReasoningProvider {
  readonly id = 'openai_compatible'
  private readonly config: OpenAICompatibleConfig

  constructor(config: OpenAICompatibleConfig) {
    this.config = config
  }

  async generateJson(request: ReasoningRequest): Promise<ReasoningResult> {
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
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('AI reasoning provider returned no content.')

    const result = extractJson(content)
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('AI reasoning provider returned an invalid JSON object.')
    }

    return {
      provider: this.id,
      model: this.config.model,
      result: result as Record<string, unknown>,
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
