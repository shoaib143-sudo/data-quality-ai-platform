import { parseOtlpConfiguredHeaders, resolveOtlpTracesEndpoint } from '@/lib/ai/otlp-telemetry-exporter'
import {
  normalizeOpaDecisionPath,
  normalizeOpaEndpoint,
  opaAuthorizationHeaders,
} from '@/lib/governance/opa-policy-decision-provider'

const PROBE_TIMEOUT_MS = 5_000

export type ExternalIntegrationStatus = 'READY' | 'DEGRADED' | 'UNAVAILABLE'
export type ExternalIntegrationProbe = { status: ExternalIntegrationStatus; detail: string }
export type ExternalIntegrationComponents = {
  opa_enforcement: ExternalIntegrationProbe
  otlp_export: ExternalIntegrationProbe
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

  const baseUrl = normalizeOpaEndpoint(process.env.OPA_URL)
  const decisionPath = normalizeOpaDecisionPath(process.env.OPA_DECISION_PATH)
  const authorizationHeaders = opaAuthorizationHeaders(process.env.OPA_AUTH_TOKEN)
  if (!baseUrl || !authorizationHeaders) {
    return {
      status: 'UNAVAILABLE',
      detail: 'External OPA enforcement is selected but its endpoint or authentication credential is incomplete.',
    }
  }

  const decisionUrl = `${baseUrl}${decisionPath}`
  const emptyDecisionBody = JSON.stringify({ input: {} })

  try {
    const health = await withTimeout(`${baseUrl}/health`, { method: 'GET' })
    if (!health.ok) {
      return { status: 'UNAVAILABLE', detail: `OPA health probe returned HTTP ${health.status}.` }
    }

    const unauthenticatedDecision = await withTimeout(decisionUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: emptyDecisionBody,
    })
    if (unauthenticatedDecision.status !== 401 && unauthenticatedDecision.status !== 403) {
      return {
        status: 'UNAVAILABLE',
        detail: `OPA decision endpoint did not enforce authentication as expected; HTTP ${unauthenticatedDecision.status}.`,
      }
    }

    const authenticatedDecision = await withTimeout(decisionUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authorizationHeaders,
      },
      body: emptyDecisionBody,
    })
    if (!authenticatedDecision.ok) {
      return {
        status: 'UNAVAILABLE',
        detail: `OPA rejected the configured application credential; HTTP ${authenticatedDecision.status}.`,
      }
    }

    return {
      status: 'READY',
      detail: 'OPA is reachable, rejects anonymous decisions, and accepts the configured application credential.',
    }
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

  const exporterHeaders = parseOtlpConfiguredHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)
  if (!Object.keys(exporterHeaders).length) {
    return {
      status: 'DEGRADED',
      detail: 'External OTLP export is configured but its exporter authentication headers are missing or invalid.',
    }
  }

  let tracesUrl: string
  try {
    tracesUrl = resolveOtlpTracesEndpoint(configuredEndpoint)
  } catch {
    return { status: 'DEGRADED', detail: 'External OTLP export endpoint is invalid.' }
  }

  const emptyTraceBody = JSON.stringify({ resourceSpans: [] })

  try {
    const unauthenticatedTrace = await withTimeout(tracesUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: emptyTraceBody,
    })
    if (unauthenticatedTrace.status !== 401 && unauthenticatedTrace.status !== 403) {
      return {
        status: 'DEGRADED',
        detail: `OTLP trace endpoint did not enforce authentication as expected; HTTP ${unauthenticatedTrace.status}.`,
      }
    }

    const authenticatedTrace = await withTimeout(tracesUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...exporterHeaders,
      },
      body: emptyTraceBody,
    })
    if (!authenticatedTrace.ok) {
      return {
        status: 'DEGRADED',
        detail: `OTLP collector rejected the configured application credential; HTTP ${authenticatedTrace.status}.`,
      }
    }

    return {
      status: 'READY',
      detail: 'OTLP trace ingestion rejects anonymous traffic and accepts the configured application credential.',
    }
  } catch {
    return { status: 'DEGRADED', detail: 'OTLP readiness probe could not reach the configured collector.' }
  }
}

export async function checkExternalIntegrationBoundaries(): Promise<ExternalIntegrationComponents> {
  const [opa, otlp] = await Promise.all([checkOpaBoundary(), checkOtlpBoundary()])
  return { opa_enforcement: opa, otlp_export: otlp }
}
