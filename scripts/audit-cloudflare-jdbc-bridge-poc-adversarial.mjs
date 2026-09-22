import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => fs.readFileSync(resolve(root, path), 'utf8')
const configText = read('infra/cloudflare/jdbc-bridge-poc/wrangler.jsonc')
const config = JSON.parse(configText)
const router = read('infra/cloudflare/jdbc-bridge-poc/src/router.ts')
const docs = read('infra/cloudflare/jdbc-bridge-poc/README.md')
const dockerfile = read('services/jdbc-bridge/Dockerfile')
const credentialConfig = read('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/CredentialStoreConfiguration.java')

assert.equal(config.vars?.DATANEXUS_JDBC_EXECUTION_ENABLED, 'false', 'adversarial: execution must fail closed by default')
assert.equal(config.containers?.[0]?.max_instances, 1, 'adversarial: PoC must stay single-instance')
assert.equal(config.containers?.[0]?.ssh?.enabled, false, 'adversarial: SSH must remain disabled')
assert.match(router, /PUBLIC_READ_PATHS = new Set\(\['\/', '\/health'\]\)/)
assert.match(router, /PROTECTED_POST_PATHS = new Set/)
assert.match(router, /JDBC execution is disabled on this Cloudflare PoC/)
assert.match(router, /JDBC execution is enabled but the bridge token is not configured/)
assert.match(router, /JDBC bridge access denied/)
assert.match(router, /getByName\('bridge'\)\.fetch\(request\)/)

for (const source of [configText, router]) {
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/, 'adversarial: JDBC PoC must not inherit Supabase authority')
  assert.doesNotMatch(source, /R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID/, 'adversarial: JDBC PoC must not inherit R2 authority')
  assert.doesNotMatch(source, /JDBC_CREDENTIAL_PASSWORD|JDBC_CREDENTIAL_USERNAME/, 'adversarial: database credentials must not be stored in Worker config')
}
assert.doesNotMatch(configText, /"DATANEXUS_JDBC_EXECUTION_ENABLED"\s*:\s*"true"/)
assert.match(dockerfile, /^USER 10001$/m, 'adversarial: Java container must remain non-root')
assert.match(credentialConfig, /JDBC_CREDENTIAL_MODE:infisical/, 'adversarial: Infisical remains the default credential authority')
assert.match(docs, /Workers Paid.*explicit owner approval/is)
assert.match(docs, /cannot directly consume a Worker VPC binding/is)
assert.match(docs, /not certified/is)

console.log('Independent adversarial Cloudflare JDBC PoC audit passed.')
