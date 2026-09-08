import type { TelemetryTraceContext } from './telemetry-provider'

const TRACEPARENT_PATTERN = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/

function validTracestate(value: string | null) {
  if (!value) return null
  const normalized = value.trim()
  if (!normalized || normalized.length > 512 || /[\r\n]/.test(normalized)) return null
  return normalized
}

export function parseW3CTraceContext(traceparent: string | null, tracestate?: string | null): TelemetryTraceContext | null {
  if (!traceparent) return null
  const normalized = traceparent.trim().toLowerCase()
  const match = TRACEPARENT_PATTERN.exec(normalized)
  if (!match) return null

  const [, version, traceId, parentSpanId, traceFlags] = match
  if (version === 'ff' || traceId === '0'.repeat(32) || parentSpanId === '0'.repeat(16)) return null
  if (version === '00' && normalized.length !== 55) return null

  return {
    traceId,
    parentSpanId,
    traceFlags,
    tracestate: validTracestate(tracestate),
  }
}

export function telemetryTraceContextFromRequest(request: Request): TelemetryTraceContext | null {
  return parseW3CTraceContext(request.headers.get('traceparent'), request.headers.get('tracestate'))
}
