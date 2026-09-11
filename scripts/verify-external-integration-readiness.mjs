import fs from 'node:fs'

const probe = fs.readFileSync('lib/observability/external-integration-readiness.ts', 'utf8')
const opaProvider = fs.readFileSync('lib/governance/opa-policy-decision-provider.ts', 'utf8')
const otlpExporter = fs.readFileSync('lib/ai/otlp-telemetry-exporter.ts', 'utf8')
const integrationRoute = fs.readFileSync('app/api/health/integrations/route.ts', 'utf8')
const canonicalReadyRoute = fs.readFileSync('app/api/health/ready/route.ts', 'utf8')
const failures = []

for (const token of [
  "process.env.POLICY_DECISION_PROVIDER",
  "process.env.OPA_URL",
  "process.env.OPA_DECISION_PATH",
  "process.env.OPA_AUTH_TOKEN",
  "normalizeOpaEndpoint",
  "normalizeOpaDecisionPath",
  "opaAuthorizationHeaders",
  "process.env.OTEL_EXPORTER_OTLP_ENDPOINT",
  "process.env.OTEL_EXPORTER_OTLP_HEADERS",
  "parseOtlpConfiguredHeaders",
  "resolveOtlpTracesEndpoint",
  "`${baseUrl}/health`",
  "JSON.stringify({ input: {} })",
  "JSON.stringify({ resourceSpans: [] })",
  "unauthenticatedDecision.status !== 401 && unauthenticatedDecision.status !== 403",
  "unauthenticatedTrace.status !== 401 && unauthenticatedTrace.status !== 403",
  "const authenticatedDecision = await withTimeout",
  "const authenticatedTrace = await withTimeout",
  "if (!authenticatedDecision.ok)",
  "if (!authenticatedTrace.ok)",
  "...authorizationHeaders",
  "...exporterHeaders",
  "status: 'UNAVAILABLE'",
  "status: 'DEGRADED'",
]) {
  if (!probe.includes(token)) failures.push(`missing external readiness probe contract token: ${token}`)
}

for (const forbidden of [
  /canonical\s*:/i,
  /traceId\s*:/i,
  /spanId\s*:/i,
  /prompt\s*:/i,
  /completion\s*:/i,
  /chain[_\s-]*of[_\s-]*thought/i,
  /JSON\.stringify\([^\n]*(OPA_AUTH_TOKEN|OTEL_EXPORTER_OTLP_HEADERS)/i,
  /detail:[^\n]*(OPA_AUTH_TOKEN|OTEL_EXPORTER_OTLP_HEADERS)/i,
]) {
  if (forbidden.test(probe)) failures.push(`external readiness probe must not expose secrets or manufacture governed/telemetry evidence: ${forbidden}`)
}

for (const token of [
  "export function normalizeOpaEndpoint",
  "export function normalizeOpaDecisionPath",
  "export function opaAuthorizationHeaders",
  "this.endpoint = normalizeOpaEndpoint(options.endpoint)",
  "this.decisionPath = normalizeOpaDecisionPath(options.decisionPath)",
  "this.authorizationHeaders = opaAuthorizationHeaders(options.authorizationToken)",
  "...this.authorizationHeaders",
]) {
  if (!opaProvider.includes(token)) failures.push(`OPA production client must share readiness auth semantics: ${token}`)
}

for (const token of [
  "export function resolveOtlpTracesEndpoint",
  "export function parseOtlpConfiguredHeaders",
  "this.endpoint = resolveOtlpTracesEndpoint(options.endpoint)",
  "this.headers = parseOtlpConfiguredHeaders(options.headers)",
  "...this.headers",
]) {
  if (!otlpExporter.includes(token)) failures.push(`OTLP production client must share readiness auth semantics: ${token}`)
}

for (const token of [
  "checkExternalIntegrationBoundaries",
  "status: unavailable ? 'UNAVAILABLE' : degraded ? 'DEGRADED' : 'READY'",
  "authority_boundary: 'Connectivity and authentication-boundary evidence only; not governance authority or telemetry evidence.'",
  "headers: { 'Cache-Control': 'no-store' }",
]) {
  if (!integrationRoute.includes(token)) failures.push(`missing dedicated integration readiness route contract token: ${token}`)
}

for (const token of [
  "checkExternalIntegrationBoundaries",
  "components.opa_enforcement = externalIntegrations.opa_enforcement",
  "components.otlp_export = externalIntegrations.otlp_export",
  "if (externalIntegrations.opa_enforcement.status === 'UNAVAILABLE') criticalFailure = true",
  "status: criticalFailure ? 'UNAVAILABLE' : degraded ? 'DEGRADED' : 'READY'",
]) {
  if (!canonicalReadyRoute.includes(token)) failures.push(`canonical readiness must include external integration contract token: ${token}`)
}

if (!probe.includes("External OPA enforcement is not selected") || !probe.includes("status: 'READY'")) {
  failures.push('OPA must not degrade canonical readiness when the external provider is not selected')
}
if (!probe.includes("External OTLP export is not configured") || !probe.includes("canonical PostgreSQL telemetry remains authoritative")) {
  failures.push('disabled OTLP export must preserve canonical PostgreSQL telemetry readiness')
}
if (!probe.includes('emptyDecisionBody') || !probe.includes('emptyTraceBody')) {
  failures.push('credential validation must use empty non-governed, non-telemetry-bearing payloads')
}

if (failures.length) {
  console.error('External integration readiness contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}

console.log('External OPA/OTLP configuration, credential validity, auth boundary, and canonical readiness contract passed.')
