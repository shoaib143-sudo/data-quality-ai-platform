import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PROBE_TIMEOUT_MS = 5_000

type ProbeStatus = 'READY' | 'DEGRADED' | 'UNAVAILABLE'
type ProbeResult = { status: ProbeStatus; detail: string }

function normalizedBaseUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/$/, '') ?? ''
  if (!normalized || !/^https?:\/\//i.test(normalized)) return null
  return normalized
}

async function withTimeout(input: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, cache: 'no-store', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function checkOpaBoundary(): Promise<ProbeResult> {
  if (process.env.POLICY_DECISION_PROVIDER?.trim().toLowerCase() !== 'opa') {
    return { status: 'DEGRADED', detail: 'External OPA enforcement is not selected.' }
  }

  const baseUrl = normalizedBaseUrl(process.env.OPA_URL)
  const configuredPath = process.env.OPA_DECISION_PATH?.trim()
  if (!baseUrl || !configuredPath || !configuredPath.startsWith('/')) {
    return { status: 'UNAVAILABLE', detail: 'External OPA enforcement is selected but not fully configured.' }
  }

  try {
    const health = await withTimeout(`${baseUrl}/health`, { method: 'GET' })
    if (!health.ok) {
      return { status: 'UNAVAILABLE', detail: `OPA health probe returned HTTP ${health.status}.` }
    }

    const unauthenticatedDecision = await withTimeout(`${baseUrl}${configuredPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    })
    if (unauthenticatedDecision.status !== 401 && unauthenticatedDecision.status !== 403) {
      return {
        status: 'UNAVAILABLE',
        detail: `OPA decision endpoint did not enforce authentication as expected; HTTP ${unauthenticatedDecision.status}.`,
      }
    }

    return { status: 'READY', detail: 'OPA is reachable and its decision endpoint rejects unauthenticated requests.' }
  } catch {
    return { status: 'UNAVAILABLE', detail: 'OPA readiness probe could not reach the configured service.' }
  }
}

async function checkOtlpBoundary(): Promise<ProbeResult> {
  const baseUrl = normalizedBaseUrl(process.env.OTEL_EXPORTER_OTLP_ENDPOINT)
  if (!baseUrl) {
    return { status: 'DEGRADED', detail: 'External OTLP export is not configured.' }
  }

  const tracesUrl = /\/v1\/traces$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v1/traces`
  try {
    const unauthenticatedTrace = await withTimeout(tracesUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resourceSpans: [] }),
    })
    if (unauthenticatedTrace.status !== 401 && unauthenticatedTrace.status !== 403) {
      return {
        status: 'UNAVAILABLE',
        detail: `OTLP trace endpoint did not enforce authentication as expected; HTTP ${unauthenticatedTrace.status}.`,
      }
    }

    return { status: 'READY', detail: 'OTLP trace ingestion is reachable and rejects unauthenticated requests.' }
  } catch {
    return { status: 'UNAVAILABLE', detail: 'OTLP readiness probe could not reach the configured collector.' }
  }
}

export async function GET() {
  const [opa, otlp] = await Promise.all([checkOpaBoundary(), checkOtlpBoundary()])
  const components = { opa_enforcement: opa, otlp_export: otlp }
  const unavailable = Object.values(components).some((component) => component.status === 'UNAVAILABLE')
  const degraded = Object.values(components).some((component) => component.status === 'DEGRADED')

  return NextResponse.json({
    status: unavailable ? 'UNAVAILABLE' : degraded ? 'DEGRADED' : 'READY',
    components,
    authority_boundary: 'Connectivity and authentication-boundary evidence only; not governance authority or telemetry evidence.',
    timestamp: new Date().toISOString(),
  }, {
    status: unavailable ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
