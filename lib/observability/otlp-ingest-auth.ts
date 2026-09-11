import { timingSafeEqual } from 'node:crypto'
import { parseOtlpConfiguredHeaders } from '@/lib/ai/otlp-telemetry-exporter'

export function configuredOtlpAuthorizationHeader(value = process.env.OTEL_EXPORTER_OTLP_HEADERS) {
  const headers = parseOtlpConfiguredHeaders(value)
  for (const [key, headerValue] of Object.entries(headers)) {
    if (key.trim().toLowerCase() === 'authorization' && headerValue.trim()) return headerValue.trim()
  }
  return null
}

export function otlpAuthorizationMatches(presented: string | null | undefined, expected: string | null | undefined) {
  if (!presented?.trim() || !expected?.trim()) return false
  const left = Buffer.from(presented.trim(), 'utf8')
  const right = Buffer.from(expected.trim(), 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}
