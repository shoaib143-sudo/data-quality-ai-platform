import fs from 'node:fs'

const observable = fs.readFileSync('lib/ai/observable-intelligent-router.ts', 'utf8')
const composition = fs.readFileSync('lib/ai/governance-intelligent-router.ts', 'utf8')
const failures = []

for (const token of [
  'ObservableIntelligentRouter',
  "eventType: 'AI_ROUTE_DECISION'",
  "operation: 'model_route'",
  'route_source',
  'route_reason',
  'routing_policy_id',
  'evaluation_average_score',
]) if (!observable.includes(token)) failures.push(`missing route telemetry token: ${token}`)

for (const forbidden of [
  /prompt\s*:/i,
  /completion\s*:/i,
  /hidden[_\s-]*reason/i,
  /chain[_\s-]*of[_\s-]*thought/i,
]) if (forbidden.test(observable)) failures.push(`forbidden telemetry payload pattern: ${forbidden}`)

if (!composition.includes('createGovernanceTelemetryProvider()')) failures.push('governance telemetry provider not composed')
if (!composition.includes('new ObservableIntelligentRouter')) failures.push('governed router not telemetry-decorated')
if (!/catch\s*\{[\s\S]*?return decision/m.test(observable)) failures.push('telemetry failure must preserve resolved decision')

if (failures.length) {
  console.error('ADR-006 route telemetry contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log('ADR-006 route telemetry contract passed.')
