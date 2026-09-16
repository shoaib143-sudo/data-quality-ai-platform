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
