import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => fs.readFileSync(resolve(root, path), 'utf8')
const config = JSON.parse(read('infra/cloudflare/jdbc-bridge-poc/wrangler.jsonc'))
const router = read('infra/cloudflare/jdbc-bridge-poc/src/router.ts')
const dockerfile = read('services/jdbc-bridge/Dockerfile')
const bridgeAuth = read('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/BridgeAuthFilter.java')
const docs = read('infra/cloudflare/jdbc-bridge-poc/README.md')

assert.equal(config.name, 'datanexus-jdbc-bridge-poc')
assert.equal(config.vars?.DATANEXUS_JDBC_EXECUTION_ENABLED, 'false')
assert.equal(config.containers?.length, 1)
assert.equal(config.containers[0].class_name, 'DataNexusJdbcBridgeContainer')
assert.equal(config.containers[0].image, '../../../services/jdbc-bridge/Dockerfile')
assert.equal(config.containers[0].max_instances, 1)
assert.deepEqual(config.containers[0].constraints?.regions, ['APAC'])
assert.equal(config.containers[0].instance_type, 'standard-1')
assert.equal(config.containers[0].ssh?.enabled, false)
assert.equal(config.durable_objects?.bindings?.[0]?.name, 'DATANEXUS_JDBC_BRIDGE')
assert.deepEqual(config.migrations?.[0]?.new_sqlite_classes, ['DataNexusJdbcBridgeContainer'])

assert.match(router, /defaultPort = 10000/)
assert.match(router, /sleepAfter = '30m'/)
assert.match(router, /pingEndpoint = 'container\/health'/)
for (const path of ['/', '/health', '/v1/credentials', '/v1/catalog', '/v1/validate', '/v1/query', '/v1/lineage']) {
  assert.ok(router.includes(path), `missing governed route ${path}`)
}
assert.match(router, /DATANEXUS_JDBC_EXECUTION_ENABLED !== 'true'/)
assert.match(router, /JDBC_BRIDGE_TOKEN/)
assert.match(router, /status: 503/)
assert.match(router, /status: 401/)
assert.match(router, /Route is not exposed by the DataNexus JDBC bridge PoC/)

assert.match(dockerfile, /eclipse-temurin:21-jre/)
assert.match(dockerfile, /^USER 10001$/m)
assert.match(bridgeAuth, /requestUri\.equals\("\/"\) \|\| requestUri\.equals\("\/health"\)/)
assert.match(bridgeAuth, /response\.sendError\(503, "Bridge authentication is not configured\."\)/)
assert.match(bridgeAuth, /response\.sendError\(401, "Unauthorized\."\)/)

for (const source of [config, router]) {
  const text = typeof source === 'string' ? source : JSON.stringify(source)
  assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(text, /JDBC_CREDENTIAL_PASSWORD/)
  assert.doesNotMatch(text, /JDBC_CREDENTIAL_USERNAME/)
}
assert.match(docs, /requires Workers Paid and therefore requires explicit owner approval/i)
assert.match(docs, /Private enterprise database connectivity is a separate gate/i)
assert.match(docs, /not certified/i)

console.log('Cloudflare JDBC bridge PoC contract passed.')
