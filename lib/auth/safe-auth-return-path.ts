const AUTH_RETURN_ORIGIN = 'https://datanexus.invalid'
const DEFAULT_AUTH_RETURN_PATH = '/dashboard'

function normalizeSameOriginPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.includes('\\')) return null

  try {
    const candidate = new URL(value, AUTH_RETURN_ORIGIN)
    if (candidate.origin !== AUTH_RETURN_ORIGIN) return null
    return `${candidate.pathname}${candidate.search}${candidate.hash}`
  } catch {
    return null
  }
}

export function safeAuthReturnPath(value: string | null, fallback = DEFAULT_AUTH_RETURN_PATH) {
  const safeFallback = normalizeSameOriginPath(fallback) ?? DEFAULT_AUTH_RETURN_PATH
  return normalizeSameOriginPath(value) ?? safeFallback
}
