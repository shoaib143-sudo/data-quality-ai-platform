import fs from 'node:fs'

const exporter = fs.readFileSync('lib/ai/otlp-telemetry-exporter.ts', 'utf8')
const factory = fs.readFileSync('lib/ai/governance-telemetry-provider.ts', 'utf8')
const collector = fs.readFileSync('infra/otel/collector-config.yaml', 'utf8')
const install = fs.readFileSync('infra/otel/install-otelcol.sh', 'utf8')
const build = fs.readFileSync('infra/otel/render-build.sh', 'utf8')
const start = fs.readFileSync('infra/otel/render-start.sh', 'utf8')

const required = [
  [exporter, 'class OtlpHttpJsonTelemetryExporter', 'OTLP HTTP JSON exporter'],
  [exporter, '`${normalized}/v1/traces`', 'standard traces endpoint'],
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
  [collector, 'bearertokenauth/server:', 'collector bearer authenticator'],
  [collector, 'authenticator: bearertokenauth/server', 'OTLP receiver authentication'],
  [collector, 'endpoint: "0.0.0.0:${env:PORT}"', 'Render-bound OTLP HTTP receiver'],
  [collector, 'verbosity: basic', 'non-payload debug receipt sink'],
  [collector, 'traces:', 'trace pipeline'],
  [install, 'OTELCOL_VERSION:-0.160.0', 'pinned collector release'],
  [install, 'expected_hash=', 'upstream collector checksum read'],
  [install, 'sha256sum "$archive"', 'collector checksum calculation'],
  [install, 'Checksum mismatch for ${archive}', 'collector checksum mismatch failure'],
  [build, 'otelcol-contrib validate', 'collector configuration validation'],
  [start, ': "${OTEL_AUTH_TOKEN:?OTEL_AUTH_TOKEN is required}"', 'fail-closed collector credential requirement'],
]

const failures = required
  .filter(([source, token]) => !source.includes(token))
  .map(([, , label]) => `missing ${label}`)

for (const forbidden of ['event.attributes', 'JSON.stringify(event)', 'prompt', 'completion', 'reasoning']) {
  if (exporter.includes(forbidden)) failures.push(`external exporter must not forward free-form/sensitive payload: ${forbidden}`)
}
if (/verbosity:\s*(detailed|normal)/.test(collector)) failures.push('collector debug sink must remain at basic verbosity')
if (/OTEL_AUTH_TOKEN\s*:\s*[^"$\s]/.test(collector)) failures.push('collector credential must not be embedded in configuration')
if (failures.length) {
  console.error('OTLP telemetry exporter verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('OTLP exporter, authenticated collector deployment, checksum, W3C propagation, and canonical persistence ordering verified.')
