export type ProviderRuntimePolicy = {
  timeoutMs: number
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  retryableStatuses: ReadonlySet<number>
}

const DEFAULT_POLICY: ProviderRuntimePolicy = {
  timeoutMs: 10_000,
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
  retryableStatuses: new Set([408, 425, 429, 500, 502, 503, 504]),
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function providerRuntimePolicy(prefix?: string): ProviderRuntimePolicy {
  const key = prefix?.trim().toUpperCase()
  const timeoutMs = boundedInt(
    key ? process.env[`${key}_TIMEOUT_MS`] : process.env.PROVIDER_TIMEOUT_MS,
    boundedInt(process.env.PROVIDER_TIMEOUT_MS, DEFAULT_POLICY.timeoutMs, 500, 120_000),
    500,
    120_000,
  )
  const maxAttempts = boundedInt(
    key ? process.env[`${key}_MAX_ATTEMPTS`] : process.env.PROVIDER_MAX_ATTEMPTS,
    boundedInt(process.env.PROVIDER_MAX_ATTEMPTS, DEFAULT_POLICY.maxAttempts, 1, 6),
    1,
    6,
  )
  const baseDelayMs = boundedInt(
    key ? process.env[`${key}_RETRY_BASE_MS`] : process.env.PROVIDER_RETRY_BASE_MS,
    boundedInt(process.env.PROVIDER_RETRY_BASE_MS, DEFAULT_POLICY.baseDelayMs, 25, 10_000),
    25,
    10_000,
  )
  const maxDelayMs = boundedInt(
    key ? process.env[`${key}_RETRY_MAX_MS`] : process.env.PROVIDER_RETRY_MAX_MS,
    boundedInt(process.env.PROVIDER_RETRY_MAX_MS, DEFAULT_POLICY.maxDelayMs, baseDelayMs, 30_000),
    baseDelayMs,
    30_000,
  )
  return { timeoutMs, maxAttempts, baseDelayMs, maxDelayMs, retryableStatuses: DEFAULT_POLICY.retryableStatuses }
}

function retryDelay(attempt: number, policy: ProviderRuntimePolicy) {
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** Math.max(0, attempt - 1)))
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential * 0.2)))
  return exponential + jitter
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryableError(error: unknown) {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true
  return /ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|fetch failed/i.test(error.message)
}

export async function providerFetch(
  input: string | URL,
  init: RequestInit = {},
  options: { providerKey?: string; policy?: ProviderRuntimePolicy } = {},
): Promise<Response> {
  const policy = options.policy ?? providerRuntimePolicy(options.providerKey)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), policy.timeoutMs)
    try {
      const response = await fetch(input, { ...init, signal: controller.signal })
      clearTimeout(timer)
      if (!policy.retryableStatuses.has(response.status) || attempt === policy.maxAttempts) return response
      await response.body?.cancel().catch(() => undefined)
    } catch (error) {
      clearTimeout(timer)
      lastError = error
      if (!retryableError(error) || attempt === policy.maxAttempts) throw error
    }

    await sleep(retryDelay(attempt, policy))
  }

  throw lastError instanceof Error ? lastError : new Error('Provider request failed without a response')
}

export async function providerHealthCheck(
  providerKey: string,
  check: () => Promise<Response | boolean>,
): Promise<{ providerKey: string; healthy: boolean; latencyMs: number; detail?: string }> {
  const started = Date.now()
  try {
    const result = await check()
    const healthy = typeof result === 'boolean' ? result : result.ok
    return {
      providerKey,
      healthy,
      latencyMs: Date.now() - started,
      ...(typeof result === 'boolean' || healthy ? {} : { detail: `HTTP ${result.status}` }),
    }
  } catch (error) {
    return {
      providerKey,
      healthy: false,
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : 'Unknown provider health failure',
    }
  }
}
