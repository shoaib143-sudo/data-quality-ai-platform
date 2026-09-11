const PROBE_TIMEOUT_MS = 5_000

export type ExternalIntegrationStatus = 'READY' | 'DEGRADED' | 'UNAVAILABLE'
export type ExternalIntegrationProbe = { status: ExternalIntegrationStatus; detail: string }
export type ExternalIntegrationComponents = {
  opa_enforcement: ExternalIntegrationProbe
  otlp_export: ExternalIntegrationProbe
}

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

async function checkOpaBoundary(): Promise<ExternalIntegrationProbe> {
  if (process.env.POLICY_DECISION_PROVIDER?.trim().toLowerCase() !== 'opa') {
    return {
      status: 'READY',
      detail: 'External OPA enforcement is not selected; the configured canonical policy path remains authoritative.',
    }
  }

  const baseUrl = normalizedBaseUrl(process.env.OPA_URL)
  const configuredPath = process.env.OPA_DECISION_PATH?.trim()
  const authConfigured = Boolean(process.env.OPA_AUTH_TOKEN?.trim())
  if (!baseUrl || !configuredPath || !configuredPath.startsWith('/') || !authConfigured) {
    return {
      status: 'UNAVAILABLE',
      detail: 'External OPA enforcement is selected but its endpoint, decision path, or authentication credential is incomplete.',
    }
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

    return { status: 'READY', detail: 'OPA is configured, reachable, and its decision endpoint rejects unauthenticated requests.' }
  } catch {
    return { status: 'UNAVAILABLE', detail: 'OPA readiness probe could not reach the configured service.' }
  }
}

async function checkOtlpBoundary(): Promise<ExternalIntegrationProbe> {
  const configuredEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
  if (!configuredEndpoint) {
    return {
      status: 'READY',
      detail: 'External OTLP export is not configured; canonical PostgreSQL telemetry remains authoritative.',
    }
  }

  const baseUrl = normalizedBaseUrl(configuredEndpoint)
  const exporterHeadersConfigured = Boolean(process.env.OTEL_EXPORTER_OTLP_HEADERS?.trim())
  if (!baseUrl || !exporterHeadersConfigured) {
    return {
      status: 'DEGRADED',
      detail: 'External OTLP export is configured but its endpoint or exporter authentication headers are incomplete.',
    }
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
        status: 'DEGRADED',
        detail: `OTLP trace endpoint did not enforce authentication as expected; HTTP ${unauthenticatedTrace.status}.`,
      }
    }

    return { status: 'READY', detail: 'OTLP export is configured, reachable, and trace ingestion rejects unauthenticated requests.' }
  } catch {
    return { status: 'DEGRADED', detail: 'OTLP readiness probe could not reach the configured collector.' }
  }
}

export async function checkExternalIntegrationBoundaries(): Promise<ExternalIntegrationComponents> {
  const [opa, otlp] = await Promise.all([checkOpaBoundary(), checkOtlpBoundary()])
  return { opa_enforcement: opa, otlp_export: otlp }
}
