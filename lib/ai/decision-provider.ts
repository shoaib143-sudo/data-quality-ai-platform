export type DecisionQuestion =
  | { type: 'noul'; instructions?: unknown; criteria?: { true?: unknown; false?: unknown } | null }
  | { type: 'choice'; instructions?: unknown; criteria: Record<string, unknown> }
  | { type: 'score'; instructions?: unknown; criteria: unknown[] }

export type DecisionAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; legend: Record<string, unknown>; probabilities: Record<string, number> }

export type DecisionProviderState = 'AVAILABLE' | 'DEGRADED' | 'BYPASSED' | 'UNAVAILABLE' | 'FAIL_CLOSED'

export type DecisionRequest = {
  decisionFamily: string
  schemaVersion: string
  state: string | Record<string, unknown> | unknown[]
  questions: Record<string, DecisionQuestion>
  model?: string | null
  signal?: AbortSignal
  timeoutMs?: number
  correlationId?: string | null
}

export type DecisionUsage = {
  inputTokens: number
  outputTokens: number
}

export type DecisionResult = {
  provider: string
  model: string
  answers: Record<string, DecisionAnswer>
  usage: DecisionUsage
  latencyMs: number
  providerRequestId?: string
}

export interface DecisionProvider {
  readonly id: string
  readonly state: DecisionProviderState
  evaluate(request: DecisionRequest): Promise<DecisionResult>
}

export class DecisionProviderHttpError extends Error {
  readonly status: number
  readonly providerRequestId?: string

  constructor(provider: string, status: number, providerRequestId?: string) {
    super(`${provider} decision provider returned ${status}${providerRequestId ? ` (request ${providerRequestId})` : ''}.`)
    this.name = 'DecisionProviderHttpError'
    this.status = status
    this.providerRequestId = providerRequestId
  }
}
