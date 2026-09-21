const AUTH_RETURN_ORIGIN = 'https://datanexus.invalid'

export function safeAuthReturnPath(value: string | null, fallback = '/dashboard') {
  if (!value || !value.startsWith('/') || value.includes('\\')) return fallback

  try {
    const candidate = new URL(value, AUTH_RETURN_ORIGIN)
    if (candidate.origin !== AUTH_RETURN_ORIGIN) return fallback
    return `${candidate.pathname}${candidate.search}${candidate.hash}`
  } catch {
    return fallback
  }
}
