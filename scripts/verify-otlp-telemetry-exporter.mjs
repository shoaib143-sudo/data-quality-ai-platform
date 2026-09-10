import fs from 'node:fs'

const exporter = fs.readFileSync('lib/ai/otlp-telemetry-exporter.ts', 'utf8')
const factory = fs.readFileSync('lib/ai/governance-telemetry-provider.ts', 'utf8')

const required = [
  [exporter, 'class OtlpHttpJsonTelemetryExporter', 'OTLP HTTP JSON exporter'],
  [exporter, "`${normalized}/v1/traces`", 'standard traces endpoint'],
  [exporter, "'content-type': 'application/json'", 'OTLP JSON transport'],
  [exporter, 'resourceSpans', 'OTLP resource spans envelope'],
  [exporter, 'scopeSpans', 'OTLP scope spans envelope'],
  [exporter, 'traceId: trace.traceId.toLowerCase()', 'W3C trace identity propagation'],
  [exporter, 'const receipt = await this.canonical.record(event)', 'canonical persistence before export'],
  [exporter, 'await this.exporter.export(event, receipt)', 'external export after persistence'],
  [exporter, 'External observability is never governance authority', 'non-authoritative external export'],
  [factory, 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'standard trace endpoint config'],
  [factory, 'OTEL_EXPORTER_OTLP_ENDPOINT', 'standard base endpoint config'],
  [factory, 'OTEL_EXPORTER_OTLP_HEADERS', 'standard exporter header config'],
  [factory, 'OTEL_SERVICE_NAME', 'standard service name config'],
]

const failures = required.filter(([source, token]) => !source.includes(token)).map(([, , label]) => `missing ${label}`)
for (const forbidden of ['event.attributes', 'JSON.stringify(event)', 'prompt', 'completion', 'reasoning']) {
  if (exporter.includes(forbidden)) failures.push(`external exporter must not forward free-form/sensitive payload: ${forbidden}`)
}
if (failures.length) {
  console.error('OTLP telemetry exporter verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('OTLP telemetry export boundary, W3C propagation, and canonical persistence ordering verified.')
