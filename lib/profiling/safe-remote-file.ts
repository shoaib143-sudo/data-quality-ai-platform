import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_REDIRECTS = 5

function ipv4Private(address: string) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true
  const [a, b] = octets
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224
}

function ipv6Private(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.')
    || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(normalized)
}

function privateAddress(address: string) {
  const family = isIP(address.replace(/^\[|\]$/g, ''))
  if (family === 4) return ipv4Private(address)
  if (family === 6) return ipv6Private(address)
  return true
}

function allowedHost(hostname: string) {
  const configured = (process.env.FILE_REMOTE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  if (!configured.length) return true
  const host = hostname.toLowerCase()
  return configured.some((entry) => entry.startsWith('*.')
    ? host.endsWith(entry.slice(1)) && host !== entry.slice(2)
    : host === entry)
}

export async function assertSafeRemoteFileUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Remote FILE source URL is invalid.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Remote FILE source must use HTTP or HTTPS.')
  if (url.username || url.password) throw new Error('Remote FILE source URLs must not contain embedded credentials.')
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || !allowedHost(hostname)) {
    throw new Error('Remote FILE source host is not allowed.')
  }

  if (isIP(hostname)) {
    if (privateAddress(hostname)) throw new Error('Remote FILE source cannot target a private or local network address.')
    return url
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) {
    throw new Error('Remote FILE source resolves to a private or local network address.')
  }
  return url
}

export async function safeRemoteFileFetch(
  sourceUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  let current = await assertSafeRemoteFileUrl(sourceUrl)

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, { ...init, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    await response.body?.cancel().catch(() => undefined)
    if (!location) throw new Error('Remote FILE source returned a redirect without a location.')
    if (redirect === MAX_REDIRECTS) throw new Error(`Remote FILE source exceeded ${MAX_REDIRECTS} redirects.`)
    current = await assertSafeRemoteFileUrl(new URL(location, current).toString())
  }

  throw new Error('Remote FILE source redirect handling failed.')
}
