import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync(new URL('../infra/cloudflare/jdbc-bridge-poc/wrangler.jsonc', import.meta.url), 'utf8'))
const router = fs.readFileSync(new URL('../infra/cloudflare/jdbc-bridge-poc/src/router.ts', import.meta.url), 'utf8')
const docs = fs.readFileSync(new URL('../infra/cloudflare/jdbc-bridge-poc/README.md', import.meta.url), 'utf8')

test('Cloudflare JDBC execution is disabled by default', () => {
  assert.equal(config.vars.DATANEXUS_JDBC_EXECUTION_ENABLED, 'false')
  assert.match(router, /DATANEXUS_JDBC_EXECUTION_ENABLED !== 'true'/)
  assert.match(router, /status: 503/)
})

test('protected routes require POST and bearer authentication before container forwarding', () => {
  assert.match(router, /method !== 'POST'/)
  assert.match(router, /Allow: 'POST'/)
  assert.match(router, /request\.headers\.get\('authorization'\)\?\.trim\(\) !== 'Bearer ' \+ expectedToken/)
  assert.match(router, /status: 401/)
})

test('unknown routes fail closed instead of reaching the container', () => {
  assert.match(router, /!PROTECTED_POST_PATHS\.has\(url\.pathname\)/)
  assert.match(router, /Route is not exposed by the DataNexus JDBC bridge PoC/)
  assert.match(router, /status: 404/)
})

test('PoC does not silently claim private or static-egress enterprise support', () => {
  assert.match(docs, /Private enterprise database connectivity is a separate gate/)
  assert.match(docs, /stable dedicated public source IP.*not certified/is)
  assert.match(docs, /do not change production.*JDBC_BRIDGE_URL/is)
})

test('PoC stays isolated and bounded', () => {
  assert.equal(config.containers[0].max_instances, 1)
  assert.deepEqual(config.containers[0].constraints.regions, ['APAC'])
  assert.equal(config.containers[0].ssh.enabled, false)
})
