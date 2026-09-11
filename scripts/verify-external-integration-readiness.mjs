import fs from 'node:fs'

const route = fs.readFileSync('app/api/health/integrations/route.ts', 'utf8')
const failures = []

for (const token of [
  "process.env.POLICY_DECISION_PROVIDER",
  "process.env.OPA_URL",
  "process.env.OPA_DECISION_PATH",
  "process.env.OTEL_EXPORTER_OTLP_ENDPOINT",
  "`${baseUrl}/health`",
  "body: JSON.stringify({ input: {} })",
  "body: JSON.stringify({ resourceSpans: [] })",
  "unauthenticatedDecision.status !== 401 && unauthenticatedDecision.status !== 403",
  "unauthenticatedTrace.status !== 401 && unauthenticatedTrace.status !== 403",
  "authority_boundary: 'Connectivity and authentication-boundary evidence only; not governance authority or telemetry evidence.'",
  "headers: { 'Cache-Control': 'no-store' }",
]) {
  if (!route.includes(token)) failures.push(`missing external readiness contract token: ${token}`)
}

for (const forbidden of [
  /OPA_AUTH_TOKEN/,
  /OTEL_EXPORTER_OTLP_HEADERS/,
  /authorization\s*:/i,
  /Bearer\s+/i,
  /canonical\s*:/i,
  /traceId\s*:/i,
  /spanId\s*:/i,
  /prompt\s*:/i,
  /completion\s*:/i,
  /chain[_\s-]*of[_\s-]*thought/i,
]) {
  if (forbidden.test(route)) failures.push(`external readiness probe must not consume secrets or manufacture governed/telemetry evidence: ${forbidden}`)
}

if (!route.includes("status: unavailable ? 'UNAVAILABLE' : degraded ? 'DEGRADED' : 'READY'")) {
  failures.push('readiness endpoint must surface unavailable external boundaries as unavailable')
}

if (failures.length) {
  console.error('External integration readiness contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}

console.log('External OPA/OTLP reachability and authentication-boundary readiness contract passed.')
