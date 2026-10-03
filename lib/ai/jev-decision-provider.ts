import {
  DecisionProviderHttpError,
  type DecisionAnswer,
  type DecisionProvider,
  type DecisionProviderState,
  type DecisionRequest,
  type DecisionResult,
} from './decision-provider.ts'

type JevConfig = {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
}

function requestId(response: Response) {
  for (const name of ['x-request-id', 'request-id']) {
    const value = response.headers.get(name)?.trim()
    if (value) return value.slice(0, 256)
  }
  return undefined
}

function finiteProbability(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Jev returned invalid probability for ${label}.`)
  }
  return value
}

function numericMap(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Jev returned invalid ${label}.`)
  return Object.fromEntries(Object.entries(value).map(([key, probability]) => [key, finiteProbability(probability, `${label}.${key}`)]))
}

function parseAnswer(value: unknown, name: string): DecisionAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Jev returned invalid answer for ${name}.`)
  const answer = value as Record<string, unknown>
  if (answer.type === 'noul') return { type: 'noul', noul: finiteProbability(answer.noul, name) }
  if (answer.type === 'choice') {
    if (typeof answer.choice !== 'string' || !answer.choice.trim()) throw new Error(`Jev returned invalid choice for ${name}.`)
    return {
      type: 'choice',
      choice: answer.choice,
      confidence: finiteProbability(answer.confidence, `${name}.confidence`),
      probabilities: numericMap(answer.probabilities, `${name}.probabilities`),
    }
  }
  if (answer.type === 'score') {
    if (typeof answer.score !== 'number' || !Number.isFinite(answer.score)) throw new Error(`Jev returned invalid score for ${name}.`)
    if (!answer.legend || typeof answer.legend !== 'object' || Array.isArray(answer.legend)) throw new Error(`Jev returned invalid legend for ${name}.`)
    return {
      type: 'score',
      score: answer.score,
      confidence: finiteProbability(answer.confidence, `${name}.confidence`),
      legend: answer.legend as Record<string, unknown>,
      probabilities: numericMap(answer.probabilities, `${name}.probabilities`),
    }
  }
  throw new Error(`Jev returned unsupported answer type for ${name}.`)
}

function parseUsage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Jev returned invalid usage.')
  const usage = value as Record<string, unknown>
  const inputTokens = usage.input_tokens
  const outputTokens = usage.output_tokens
  if (
    typeof inputTokens !== 'number' || !Number.isInteger(inputTokens) || inputTokens < 0 ||
    typeof outputTokens !== 'number' || !Number.isInteger(outputTokens) || outputTokens < 0
  ) {
    throw new Error('Jev returned invalid token usage.')
  }
  return { inputTokens, outputTokens }
}

export class JevDecisionProvider implements DecisionProvider {
  readonly id = 'typesafe_jev'
  readonly state: DecisionProviderState = 'AVAILABLE'
  private readonly config: JevConfig

  constructor(config: JevConfig) {
    this.config = config
  }

  async evaluate(request: DecisionRequest): Promise<DecisionResult> {
    request.signal?.throwIfAborted()
    const controller = new AbortController()
    const requestedTimeoutMs = request.timeoutMs
    if (requestedTimeoutMs != null && (!Number.isFinite(requestedTimeoutMs) || requestedTimeoutMs < 100)) {
      throw new Error('Decision timeoutMs must be at least 100ms.')
    }
    const effectiveTimeoutMs = requestedTimeoutMs == null
      ? this.config.timeoutMs
      : Math.min(this.config.timeoutMs, Math.round(requestedTimeoutMs))
    const timeout = setTimeout(() => controller.abort(new DOMException('Jev decision timed out.', 'TimeoutError')), effectiveTimeoutMs)
    const relayAbort = () => controller.abort(request.signal?.reason)
    request.signal?.addEventListener('abort', relayAbort, { once: true })
    const startedAt = performance.now()
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/systemone`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
          ...(request.correlationId ? { 'x-correlation-id': request.correlationId.slice(0, 256) } : {}),
        },
        body: JSON.stringify({
          state: request.state,
          model: request.model?.trim() || this.config.model,
          questions: request.questions,
        }),
      })
      if (!response.ok) throw new DecisionProviderHttpError(this.id, response.status, requestId(response))
      const payload = await response.json() as { model?: unknown; answers?: unknown; usage?: unknown }
      request.signal?.throwIfAborted()
      if (typeof payload.model !== 'string' || !payload.model.trim()) throw new Error('Jev returned no model identity.')
      if (!payload.answers || typeof payload.answers !== 'object' || Array.isArray(payload.answers)) throw new Error('Jev returned invalid answers.')
      const answers = Object.fromEntries(Object.entries(payload.answers).map(([name, value]) => [name, parseAnswer(value, name)]))
      for (const name of Object.keys(request.questions)) {
        if (!answers[name]) throw new Error(`Jev omitted required answer ${name}.`)
      }
      return {
        provider: this.id,
        model: payload.model,
        answers,
        usage: parseUsage(payload.usage),
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ...(requestId(response) ? { providerRequestId: requestId(response) } : {}),
      }
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', relayAbort)
    }
  }
}

export function getJevDecisionProvider(): JevDecisionProvider | null {
  const apiKey = process.env.JEV_API_KEY?.trim()
  if (!apiKey) return null
  const timeoutMsRaw = Number(process.env.JEV_TIMEOUT_MS ?? 1500)
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw >= 100 ? Math.round(timeoutMsRaw) : 1500
  return new JevDecisionProvider({
    apiKey,
    baseUrl: (process.env.JEV_BASE_URL?.trim() || 'https://api.typesafe.ai').replace(/\/$/, ''),
    model: process.env.JEV_MODEL?.trim() || 'jev-latest',
    timeoutMs,
  })
}
