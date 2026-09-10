import assert from 'node:assert/strict'

const { ExportingTelemetryProvider, OtlpHttpJsonTelemetryExporter } = await import('../lib/ai/otlp-telemetry-exporter.ts')

const event = {
  projectId: 'project-1',
  eventType: 'MODEL_INVOCATION',
  operation: 'reasoning',
  status: 'SUCCESS',
  providerId: 'provider-a',
  modelName: 'model-a',
  correlationId: 'corr-1',
  latencyMs: 25,
  inputTokens: 10,
  outputTokens: 4,
  attributes: { prompt: 'must-not-leave-platform', safe_nested: { value: 'also-not-exported' } },
  traceContext: {
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    parentSpanId: 'fedcba9876543210',
    tracestate: 'vendor=value',
  },
  observedAt: '2026-09-11T00:00:00.000Z',
}

let request = null
const exporter = new OtlpHttpJsonTelemetryExporter({
  endpoint: 'https://otel.example.test',
  headers: 'Authorization=Bearer%20test,X-Tenant=demo',
  serviceName: 'datanexus-test',
  fetchImpl: async (url, init) => {
    request = { url, init }
    return new Response('', { status: 200 })
  },
})
await exporter.export(event, { eventId: 'event-1', persisted: true })
assert.equal(request.url, 'https://otel.example.test/v1/traces')
assert.equal(request.init.headers.Authorization, 'Bearer test')
const body = JSON.parse(request.init.body)
const span = body.resourceSpans[0].scopeSpans[0].spans[0]
assert.equal(span.traceId, event.traceContext.traceId)
assert.equal(span.spanId, event.traceContext.spanId)
assert.equal(span.parentSpanId, event.traceContext.parentSpanId)
assert.equal(span.traceState, 'vendor=value')
assert.equal(body.resourceSpans[0].resource.attributes[0].value.stringValue, 'datanexus-test')
assert.ok(JSON.stringify(body).includes('datanexus.telemetry.event_id'))
assert.ok(!JSON.stringify(body).includes('must-not-leave-platform'), 'free-form attributes must not be externally exported')
assert.ok(!JSON.stringify(body).includes('safe_nested'), 'only canonical whitelisted attributes may leave the platform')

let canonicalCalls = 0
let exportCalls = 0
const canonical = {
  id: 'postgres_ai_telemetry',
  async record(recorded) {
    canonicalCalls += 1
    assert.equal(recorded, event)
    return { eventId: 'persisted-event', persisted: true }
  },
}
const failingExporter = {
  id: 'failing_exporter',
  async export(_recorded, receipt) {
    exportCalls += 1
    assert.equal(receipt.eventId, 'persisted-event')
    throw new Error('collector unavailable')
  },
}
const provider = new ExportingTelemetryProvider(canonical, failingExporter)
const receipt = await provider.record(event)
assert.equal(receipt.eventId, 'persisted-event')
assert.equal(canonicalCalls, 1)
assert.equal(exportCalls, 1)

let untracedCalls = 0
const untracedExporter = new OtlpHttpJsonTelemetryExporter({
  endpoint: 'https://otel.example.test/v1/traces',
  fetchImpl: async () => {
    untracedCalls += 1
    return new Response('', { status: 200 })
  },
})
await untracedExporter.export({ ...event, traceContext: null }, { eventId: 'event-2', persisted: true })
assert.equal(untracedCalls, 0, 'events without W3C trace context must not fabricate external trace identity')

console.log('OTLP export preserves canonical persistence, W3C identity, data minimization, and non-blocking failure semantics.')
