import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync('app/api/monitoring/dependencies/route.ts', 'utf8')
const projection = fs.readFileSync('lib/orchestration/monitoring-dependencies.ts', 'utf8')

assert.match(route, /loadMonitoringDependencyEvidence/, 'Job Monitor must expose dependencies through the governed server projection.')
assert.match(route, /parseIdList\(url\.searchParams\.get\('projectIds'\), 25\)/, 'dependency endpoint must bound project scope')
assert.match(route, /parseIdList\(url\.searchParams\.get\('runIds'\), 50\)/, 'dependency endpoint must bound run scope')
assert.match(projection, /authorizeProject\(input\.userId, projectId, 'observability\.read'\)/, 'dependency projection must enforce observability.read for every project')
assert.match(projection, /from\('job_dependencies'\)/, 'dependency evidence must come from the persisted durable dependency graph')
assert.match(projection, /dependencyType === 'SUCCESS'\) return parentStatus === 'SUCCEEDED'/, 'SUCCESS dependency semantics must match the durable claim function')
assert.match(projection, /TERMINAL_JOB_STATUSES\.has\(parentStatus\)/, 'TERMINAL dependency semantics must match the durable claim function')
assert.match(projection, /satisfied: isMonitoringDependencySatisfied\(dependencyType, parent\.status\)/, 'projection must include deterministic dependency satisfaction evidence')
assert.doesNotMatch(projection, /payload/, 'dependency projection must not expose job payloads')

console.log('Job Monitor dependency evidence contract verified: governed project authorization, bounded run scope, persisted dependency evidence, backend-aligned blocker semantics, and no payload exposure.')

await import('./test-job-monitor-dependency-evidence.mjs')
await import('./audit-job-monitor-dependency-evidence-adversarial.mjs')
