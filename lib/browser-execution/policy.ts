import type { BrowserExecutionRequest } from './contracts'

function normalizedOrigin(value: string) {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Browser execution only supports HTTP(S) URLs')
  if (url.username || url.password) throw new Error('Credentials must not be embedded in browser URLs')
  return url.origin
}

export function assertBrowserExecutionPolicy(request: BrowserExecutionRequest) {
  if (!request.runId.trim() || !request.projectId.trim()) throw new Error('Governed run and project scope are required')
  if (!request.task.trim()) throw new Error('Browser task is required')
  if (!request.allowedOrigins.length) throw new Error('Browser execution requires an explicit origin allowlist')

  const allowed = new Set(request.allowedOrigins.map(normalizedOrigin))
  const target = normalizedOrigin(request.startUrl)
  if (!allowed.has(target)) throw new Error(`Browser target origin is not allowlisted: ${target}`)

  if (request.risk === 'HIGH' && !request.approvalId?.trim()) {
    throw new Error('High-risk browser execution requires an approval')
  }

  const timeoutMs = request.timeoutMs ?? 120_000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 900_000) {
    throw new Error('Browser execution timeout must be between 1s and 15m')
  }

  return { allowedOrigins: [...allowed].sort(), startOrigin: target, timeoutMs }
}
