import type { BrowserExecutionRequest } from './contracts'

const HTTP_PROTOCOLS = new Set(['https:', 'http:'])

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^\*\./, '')
}

function domainMatches(hostname: string, rule: string) {
  const normalized = normalizeDomain(rule)
  return hostname === normalized || hostname.endsWith(`.${normalized}`)
}

export function assertBrowserExecutionPolicy(request: BrowserExecutionRequest) {
  const url = new URL(request.startUrl)
  if (!HTTP_PROTOCOLS.has(url.protocol)) throw new Error('BROWSER_PROTOCOL_DENIED')
  if (url.username || url.password) throw new Error('BROWSER_URL_CREDENTIALS_DENIED')

  const hostname = url.hostname.toLowerCase()
  if (request.policy.deniedDomains?.some((domain) => domainMatches(hostname, domain))) {
    throw new Error('BROWSER_DOMAIN_DENIED')
  }
  if (!request.policy.allowedDomains.length || !request.policy.allowedDomains.some((domain) => domainMatches(hostname, domain))) {
    throw new Error('BROWSER_DOMAIN_NOT_ALLOWLISTED')
  }
  if (!Number.isSafeInteger(request.policy.maxDurationMs) || request.policy.maxDurationMs < 1 || request.policy.maxDurationMs > 30 * 60_000) {
    throw new Error('BROWSER_DURATION_POLICY_INVALID')
  }
  if (!Number.isSafeInteger(request.policy.maxActions) || request.policy.maxActions < 1 || request.policy.maxActions > 500) {
    throw new Error('BROWSER_ACTION_LIMIT_INVALID')
  }
  if (request.risk === 'HIGH' && request.mode !== 'VERIFY_ONLY') {
    throw new Error('BROWSER_HIGH_RISK_REQUIRES_APPROVAL')
  }

  return { hostname, normalizedUrl: url.toString() }
}
