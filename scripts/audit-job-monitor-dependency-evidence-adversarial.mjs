import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync('app/api/monitoring/dependencies/route.ts', 'utf8')
const projection = fs.readFileSync('lib/orchestration/monitoring-dependencies.ts', 'utf8')

assert.match(route, /requireUser\(\)/, 'dependency evidence endpoint must require an authenticated user')
assert.doesNotMatch(route, /createAdminClient/, 'HTTP route must not directly create an admin client')
assert.match(route, /console\.error\('\[monitoring-dependencies\] dependency evidence read failed', error\)/, 'unexpected dependency read failures must remain server-observable')
assert.doesNotMatch(route, /error instanceof Error \? error\.message/, 'unexpected internal dependency errors must not be reflected to clients')
assert.match(route, /error: 'Unable to load monitoring dependencies\.'/ , 'unexpected dependency failures must return a generic client-safe error')
assert.match(projection, /authorizeProject\(input\.userId, projectId, 'observability\.read'\)/, 'every requested project must pass governed observability authorization')
assert.ok(projection.indexOf("authorizeProject(input.userId, projectId, 'observability.read')") < projection.indexOf('createAdminClient()'), 'authorization must occur before privileged dependency reads')
assert.match(projection, /\.in\('project_id', projectIds\)/, 'privileged reads must remain inside authorized project scope')
assert.match(projection, /\.in\('agent_run_id', runIds\)/, 'target durable jobs must be constrained to monitored run IDs')
assert.match(projection, /job\.project_id !== dependency\.project_id \|\| parent\.project_id !== dependency\.project_id/, 'cross-project dependency edges must be discarded')
assert.doesNotMatch(projection, /\.select\([^\n]*payload/, 'dependency projection must not read or expose durable job payloads')
assert.doesNotMatch(projection, /service_role|SUPABASE_SERVICE_ROLE_KEY/, 'dependency projection must not embed service credentials')
assert.match(projection, /function uniqueBounded\(values: string\[\], limit: number\)/, 'dependency projection must use one bounded input normalizer')
assert.match(projection, /\.slice\(0, limit\)/, 'bounded input normalizer must enforce its caller-provided ceiling')
assert.match(projection, /uniqueBounded\(input\.projectIds, 25\)/, 'project scope must be bounded to 25 authorized projects')
assert.match(projection, /uniqueBounded\(input\.runIds, 50\)/, 'run scope must be bounded to 50 monitored runs')

console.log('Independent adversarial dependency audit passed: authenticated route, authorization before privilege, bounded scope, no payload exposure, client-safe failures, and cross-project isolation.')
