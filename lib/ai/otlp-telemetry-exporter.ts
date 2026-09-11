import { createHash } from 'node:crypto'
import type { TelemetryEvent, TelemetryProvider, TelemetryReceipt } from './telemetry-provider'

export type OtlpTelemetryExporterOptions = {
  endpoint: string
  headers?: string | null
  timeoutMs?: number
  serviceName?: string
  fetchImpl?: typeof fetch
}

export interface TelemetryExporter {
  readonly id: string
  export(event: TelemetryEvent, receipt: TelemetryReceipt): Promise<void>
}

export function resolveOtlpTracesEndpoint(endpoint: string) {
  const normalized = endpoint.trim().replace(/\/$/, '')
  if (!normalized) throw new Error('OTLP endpoint is required')
  return /\/v1\/traces$/i.test(normalized) ? normalized : `${normalized}/v1/traces`
}

export function parseOtlpConfiguredHeaders(value?: string | null) {
  const headers: Record<string, string> = {}
  for (const item of value?.split(',') ?? []) {
    const separator = item.indexOf('=')
    if (separator <= 0) continue
    const key = item.slice(0, separator).trim()
    const rawValue = item.slice(separator + 1).trim()
    if (!key || /[\r\n]/.test(key) || /[\r\n]/.test(rawValue)) continue
    try {
      headers[decodeURIComponent(key)] = decodeURIComponent(rawValue)
    } catch {
      headers[key] = rawValue
    }
  }
  return headers
}

function unixNano(date: Date) {
  return `${Math.trunc(date.getTime())}000000`
}

function spanIdFromReceipt(receipt: TelemetryReceipt) {
  return createHash('sha256').update(receipt.eventId).digest('hex').slice(0, 16)
}

function otlpString(key: string, value: string | null | undefined) {
  return value ? { key, value: { stringValue: value } } : null
}

function otlpInt(key: string, value: number | null | undefined) {
  return value == null ? null : { key, value: { intValue: Math.trunc(value).toString() } }
}

function otlpDouble(key: string, value: number | null | undefined) {
  return value == null ? null : { key, value: { doubleValue: value } }
}

function canonicalAttributes(event: TelemetryEvent, receipt: TelemetryReceipt) {
  return [
    otlpString('datanexus.telemetry.event_id', receipt.eventId),
    otlpString('datanexus.project.id', event.projectId),
    otlpString('datanexus.event.type', event.eventType),
    otlpString('datanexus.event.status', event.status ?? 'INFO'),
    otlpString('datanexus.provider.id', event.providerId),
    otlpString('datanexus.model.name', event.modelName),
    otlpString('datanexus.agent_run.id', event.agentRunId),
    otlpString('datanexus.ai_system.id', event.aiSystemId),
    otlpString('datanexus.ai_system_version.id', event.aiSystemVersionId),
    otlpString('datanexus.correlation.id', event.correlationId),
    otlpInt('datanexus.latency_ms', event.latencyMs),
    otlpInt('gen_ai.usage.input_tokens', event.inputTokens),
    otlpInt('gen_ai.usage.output_tokens', event.outputTokens),
    otlpDouble('datanexus.cost_usd', event.costUsd),
  ].filter(Boolean)
}

/**
 * OTLP/HTTP JSON export is observation only. Canonical telemetry is already persisted
 * before this exporter is invoked. Free-form telemetry attributes are intentionally not
 * forwarded; only the explicit canonical whitelist above can leave the platform boundary.
 */
export class OtlpHttpJsonTelemetryExporter implements TelemetryExporter {
  readonly id = 'otlp_http_json'
  private readonly endpoint: string
  private readonly headers: Record<string, string>
  private readonly timeoutMs: number
  private readonly serviceName: string
  private readonly fetchImpl: typeof fetch

  constructor(options: OtlpTelemetryExporterOptions) {
    this.endpoint = resolveOtlpTracesEndpoint(options.endpoint)
    this.headers = parseOtlpConfiguredHeaders(options.headers)
    this.timeoutMs = Math.max(250, Math.min(10_000, options.timeoutMs ?? 2_000))
    this.serviceName = options.serviceName?.trim() || 'datanexus-ai'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async export(event: TelemetryEvent, receipt: TelemetryReceipt): Promise<void> {
    const trace = event.traceContext
    if (!trace?.traceId) return

    const end = event.observedAt ? new Date(event.observedAt) : new Date()
    if (Number.isNaN(end.getTime())) return
    const start = new Date(Math.max(0, end.getTime() - Math.max(0, event.latencyMs ?? 0)))
    const spanId = trace.spanId?.trim().toLowerCase() || spanIdFromReceipt(receipt)

    const payload = {
      resourceSpans: [{
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: this.serviceName } }],
        },
        scopeSpans: [{
          scope: { name: 'datanexus.governance.telemetry', version: '1' },
          spans: [{
            traceId: trace.traceId.toLowerCase(),
            spanId,
            ...(trace.parentSpanId ? { parentSpanId: trace.parentSpanId.toLowerCase() } : {}),
            ...(trace.tracestate ? { traceState: trace.tracestate } : {}),
            name: event.operation,
            kind: 1,
            startTimeUnixNano: unixNano(start),
            endTimeUnixNano: unixNano(end),
            attributes: canonicalAttributes(event, receipt),
            status: { code: event.status === 'ERROR' ? 2 : 1 },
          }],
        }],
      }],
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`OTLP trace export failed with HTTP ${response.status}`)
  }
}

export class ExportingTelemetryProvider implements TelemetryProvider {
  readonly id: string
  private readonly canonical: TelemetryProvider
  private readonly exporter: TelemetryExporter

  constructor(canonical: TelemetryProvider, exporter: TelemetryExporter) {
    this.canonical = canonical
    this.exporter = exporter
    this.id = `${canonical.id}+${exporter.id}`
  }

  async record(event: TelemetryEvent): Promise<TelemetryReceipt> {
    const receipt = await this.canonical.record(event)
    try {
      await this.exporter.export(event, receipt)
    } catch {
      // External observability is never governance authority. Export failure cannot
      // invalidate or erase canonical PostgreSQL telemetry that already persisted.
    }
    return receipt
  }
}
