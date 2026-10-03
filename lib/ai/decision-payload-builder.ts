const SECRET_KEY = /(password|passwd|secret|api[_-]?key|authorization|cookie|token|credential|private[_-]?key)/i
const PRIVATE_KEY_BLOCK = /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/gi
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
const INLINE_SECRET = /\b(api[_-]?key|token|secret|password|passwd)\s*[:=]\s*["']?([^\s,"']{6,})["']?/gi

export type DecisionPayloadLimits = {
  maxDepth: number
  maxKeys: number
  maxArrayItems: number
  maxStringLength: number
}

const DEFAULT_LIMITS: DecisionPayloadLimits = {
  maxDepth: 6,
  maxKeys: 80,
  maxArrayItems: 40,
  maxStringLength: 4000,
}

function redactString(value: string) {
  return value
    .replace(PRIVATE_KEY_BLOCK, '[REDACTED_PRIVATE_KEY]')
    .replace(BEARER_TOKEN, '[REDACTED_BEARER_TOKEN]')
    .replace(JWT_LIKE, '[REDACTED_JWT]')
    .replace(INLINE_SECRET, (_match, key: string) => `${key}=[REDACTED]`)
}

function minimize(value: unknown, limits: DecisionPayloadLimits, depth: number): unknown {
  if (depth > limits.maxDepth) return '[TRUNCATED_DEPTH]'
  if (typeof value === 'string') {
    const redacted = redactString(value)
    return redacted.length > limits.maxStringLength ? `${redacted.slice(0, limits.maxStringLength)}[TRUNCATED]` : redacted
  }
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, limits.maxArrayItems).map(item => minimize(item, limits, depth + 1))
  if (typeof value !== 'object') return String(value)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEY.test(key))
      .slice(0, limits.maxKeys)
      .map(([key, child]) => [key, minimize(child, limits, depth + 1)]),
  )
}

export class DecisionPayloadBuilder {
  private readonly limits: DecisionPayloadLimits

  constructor(limits: Partial<DecisionPayloadLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits }
  }

  build(input: unknown) {
    return minimize(input, this.limits, 0)
  }
}
