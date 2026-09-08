import fs from 'node:fs'

const observable = fs.readFileSync('lib/ai/observable-intelligent-router.ts', 'utf8')
const composition = fs.readFileSync('lib/ai/governance-intelligent-router.ts', 'utf8')
const investigation = fs.readFileSync('lib/ai/investigation-model.ts', 'utf8')
const investigationEngine = fs.readFileSync('lib/profiling/investigation-engine.ts', 'utf8')
const profilingExecutor = fs.readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')
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

if (!investigation.includes('createGovernanceIntelligentRouter().route({')) failures.push('profiling investigation does not use governed Intelligent Router')
if (!investigation.includes("task: 'profiling_investigation'")) failures.push('profiling investigation does not declare profiling_investigation task')
if (!investigation.includes("from('dataset_versions')") || !investigation.includes("from('datasets')")) failures.push('profiling investigation does not resolve persisted project identity')
if (investigation.includes('getModelGateway')) failures.push('profiling investigation still bypasses Intelligent Router via ModelGateway')
if (!investigationEngine.includes('enrichInvestigationWithModel({')) failures.push('profiling investigation engine is not wired to model enrichment boundary')
if (!profilingExecutor.includes("case 'investigate_profile':") || !profilingExecutor.includes('investigateProfilingRun(profilingRunId, datasetVersionId)')) failures.push('production profiling executor does not reach investigation engine')

if (failures.length) {
  console.error('ADR-006 route telemetry contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log('ADR-006 route telemetry and active profiling routing contract passed.')
