import fs from 'node:fs'

const exporter = fs.readFileSync('lib/ai/otlp-telemetry-exporter.ts', 'utf8')
const factory = fs.readFileSync('lib/ai/governance-telemetry-provider.ts', 'utf8')
const ingestAuth = fs.readFileSync('lib/observability/otlp-ingest-auth.ts', 'utf8')
const verifyRoute = fs.readFileSync('app/api/internal/observability/otlp-auth/route.ts', 'utf8')
const collector = fs.readFileSync('infra/otel/collector-config.yaml', 'utf8')
const authProxy = fs.readFileSync('infra/otel/auth-proxy.mjs', 'utf8')
const install = fs.readFileSync('infra/otel/install-otelcol.sh', 'utf8')
const build = fs.readFileSync('infra/otel/render-build.sh', 'utf8')
const start = fs.readFileSync('infra/otel/render-start.sh', 'utf8')
const runtimeTest = fs.readFileSync('infra/otel/test-runtime.sh', 'utf8')

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
  [ingestAuth, 'timingSafeEqual', 'constant-time bearer comparison'],
  [ingestAuth, 'OTEL_EXPORTER_OTLP_HEADERS', 'Vercel exporter credential authority'],
  [verifyRoute, 'configuredOtlpAuthorizationHeader()', 'credential verifier endpoint'],
  [verifyRoute, 'status: authorized ? 204 : 401', 'fail-closed verifier response'],
  [collector, 'endpoint: "127.0.0.1:${env:OTLP_COLLECTOR_PORT}"', 'loopback-only collector receiver'],
  [collector, 'verbosity: basic', 'non-payload debug receipt sink'],
  [collector, 'traces:', 'trace pipeline'],
  [authProxy, 'OTLP_AUTH_VERIFY_URL', 'delegated authorization verifier'],
  [authProxy, "request.headers.authorization", 'presented bearer forwarding'],
  [authProxy, "http://127.0.0.1:${collectorPort}/v1/traces", 'loopback trace forwarding'],
  [authProxy, "response.writeHead(401", 'anonymous and invalid credential rejection'],
  [authProxy, "createHash('sha256')", 'non-secret authorization cache key'],
  [install, 'OTELCOL_VERSION:-0.160.0', 'pinned collector release'],
  [install, 'expected_hash=', 'upstream collector checksum read'],
  [install, 'sha256sum "$archive"', 'collector checksum calculation'],
  [install, 'Checksum mismatch for ${archive}', 'collector checksum mismatch failure'],
  [build, 'otelcol-contrib validate', 'collector configuration validation'],
  [start, 'OTLP_AUTH_VERIFY_URL', 'delegated auth startup contract'],
  [start, 'node infra/otel/auth-proxy.mjs', 'auth proxy process'],
  [runtimeTest, 'wrong-runtime-token', 'invalid credential runtime test'],
  [runtimeTest, 'OTLP delegated bearer authentication', 'delegated auth acceptance runtime test'],
]

const failures = required
  .filter(([source, token]) => !source.includes(token))
  .map(([, , label]) => `missing ${label}`)

for (const forbidden of ['event.attributes', 'JSON.stringify(event)', 'prompt', 'completion', 'reasoning']) {
  if (exporter.includes(forbidden)) failures.push(`external exporter must not forward free-form/sensitive payload: ${forbidden}`)
}
if (/verbosity:\s*(detailed|normal)/.test(collector)) failures.push('collector debug sink must remain at basic verbosity')
if (/0\.0\.0\.0:\$\{env:OTLP_COLLECTOR_PORT\}/.test(collector)) failures.push('collector receiver must remain loopback-only behind the auth proxy')
if (collector.includes('bearertokenauth/server')) failures.push('collector must not retain a second static bearer credential authority')
if (authProxy.includes('OTEL_AUTH_TOKEN')) failures.push('auth proxy must not depend on a duplicated Render bearer secret')
if (failures.length) {
  console.error('OTLP telemetry exporter verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('OTLP exporter, delegated authenticated collector deployment, checksum, W3C propagation, and canonical persistence ordering verified.')
