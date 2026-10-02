const SECRET_KEY = /(password|passwd|secret|api[_-]?key|authorization|cookie|token|credential|private[_-]?key)/i

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

function minimize(value: unknown, limits: DecisionPayloadLimits, depth: number): unknown {
  if (depth > limits.maxDepth) return '[TRUNCATED_DEPTH]'
  if (typeof value === 'string') return value.length > limits.maxStringLength ? `${value.slice(0, limits.maxStringLength)}[TRUNCATED]` : value
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
