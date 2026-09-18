import { timingSafeEqual } from 'node:crypto'

export function requireInternalBearer(request: Request, envName = 'CRON_SECRET') {
  const expected = process.env[envName]?.trim()
  if (!expected) return false

  const authorization = request.headers.get('authorization') ?? ''
  const prefix = 'Bearer '
  if (!authorization.startsWith(prefix)) return false

  const provided = authorization.slice(prefix.length)
  const expectedBytes = Buffer.from(expected)
  const providedBytes = Buffer.from(provided)
  if (expectedBytes.length !== providedBytes.length) return false

  return timingSafeEqual(expectedBytes, providedBytes)
}


const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`
const GITHUB_OIDC_AUDIENCE = 'datanexus-r2-production'
const GITHUB_OIDC_REPOSITORY = 'shoaib143-sudo/data-quality-ai-platform'
const GITHUB_OIDC_ENVIRONMENT = 'production'
const GITHUB_OIDC_REF = 'refs/heads/main'
const GITHUB_OIDC_WORKFLOW_REF = 'shoaib143-sudo/data-quality-ai-platform/.github/workflows/storage-r2-assurance.yml@refs/heads/main'

type GitHubOidcClaims = {
  iss?: string
  aud?: string | string[]
  exp?: number
  nbf?: number
  repository?: string
  environment?: string
  ref?: string
  event_name?: string
  workflow_ref?: string
  iat?: number
}

type JsonWebKeyWithKid = JsonWebKey & { kid?: string; alg?: string; use?: string }

let cachedJwks: { expiresAt: number; keys: JsonWebKeyWithKid[] } | undefined

function decodeBase64UrlJson<T>(value: string): T | undefined {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T
  } catch {
    return undefined
  }
}

function githubAudienceMatches(aud: string | string[] | undefined) {
  return typeof aud === 'string'
    ? aud === GITHUB_OIDC_AUDIENCE
    : Array.isArray(aud) && aud.includes(GITHUB_OIDC_AUDIENCE)
}

async function githubOidcKeys() {
  const now = Date.now()
  if (cachedJwks && cachedJwks.expiresAt > now) return cachedJwks.keys

  const response = await fetch(GITHUB_OIDC_JWKS_URL, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) return []
  const body = await response.json() as { keys?: JsonWebKeyWithKid[] }
  const keys = Array.isArray(body.keys) ? body.keys : []
  cachedJwks = { expiresAt: now + 5 * 60_000, keys }
  return keys
}

async function verifyGitHubActionsOidcBearer(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return false
  const token = authorization.slice('Bearer '.length)
  const parts = token.split('.')
  if (parts.length !== 3) return false

  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(parts[0])
  const claims = decodeBase64UrlJson<GitHubOidcClaims>(parts[1])
  if (!header || !claims || header.alg !== 'RS256' || !header.kid) return false

  const now = Math.floor(Date.now() / 1000)
  if (claims.iss !== GITHUB_OIDC_ISSUER
    || !githubAudienceMatches(claims.aud)
    || claims.repository !== GITHUB_OIDC_REPOSITORY
    || claims.environment !== GITHUB_OIDC_ENVIRONMENT
    || claims.ref !== GITHUB_OIDC_REF
    || claims.event_name !== 'workflow_dispatch'
    || claims.workflow_ref !== GITHUB_OIDC_WORKFLOW_REF
    || typeof claims.exp !== 'number'
    || claims.exp <= now
    || claims.exp > now + 10 * 60
    || (typeof claims.iat === 'number' && claims.iat > now + 30)
    || (typeof claims.nbf === 'number' && claims.nbf > now + 30)) {
    return false
  }

  const jwk = (await githubOidcKeys()).find((candidate) =>
    candidate.kid === header.kid
    && (!candidate.alg || candidate.alg === 'RS256')
    && (!candidate.use || candidate.use === 'sig'))
  if (!jwk) return false

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const signature = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[2].length / 4) * 4, '='), 'base64')
    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature,
      Buffer.from(`${parts[0]}.${parts[1]}`),
    )
  } catch {
    return false
  }
}

export async function requireInternalAutomation(request: Request) {
  if (requireInternalBearer(request)) return true
  return verifyGitHubActionsOidcBearer(request)
}
