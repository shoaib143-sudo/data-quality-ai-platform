import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const configText = fs.readFileSync(new URL('../infra/cloudflare/runtime/wrangler.jsonc', import.meta.url), 'utf8')
const config = JSON.parse(configText)
const router = fs.readFileSync(new URL('../infra/cloudflare/runtime/src/router.ts', import.meta.url), 'utf8')
const declarations = fs.readFileSync(new URL('../infra/cloudflare/runtime/cloudflare-runtime.d.ts', import.meta.url), 'utf8')

test('Cloudflare canary is a single-instance secondary container runtime', () => {
  assert.equal(config.name, 'datanexus-canary')
  assert.equal(config.vars.DATANEXUS_ENV, 'canary')
  assert.equal(config.vars.DATANEXUS_PLATFORM, 'cloudflare')
  assert.equal(config.containers.length, 1)
  assert.equal(config.containers[0].class_name, 'DataNexusCanary')
  assert.equal(config.containers[0].max_instances, 1)
  assert.equal(config.containers[0].image, '../../../Dockerfile')
  assert.equal(config.durable_objects.bindings[0].name, 'DATANEXUS_CANARY')
  assert.deepEqual(config.migrations[0].new_sqlite_classes, ['DataNexusCanary'])
})

test('Cloudflare canary ingress fails closed on production-authority endpoints', () => {
  for (const path of [
    '/api/jobs/worker',
    '/api/internal/storage/configure-r2-cors',
    '/api/internal/storage/migrate-to-r2',
    '/api/internal/storage/reference-cutover',
    '/api/internal/governance/approval-automation',
  ]) {
    assert.match(router, new RegExp(path.replaceAll('/', '\\/')))
  }
  assert.match(router, /status: 403/)
  assert.match(router, /DATANEXUS_COMMIT_SHA/)
  assert.match(router, /DATANEXUS_RELEASE_ID/)
  assert.match(router, /DATANEXUS_BUILD_TIMESTAMP/)
})


test('primary application typecheck has an isolated Cloudflare runtime declaration boundary', () => {
  assert.match(declarations, /declare module '@cloudflare\/containers'/)
  assert.match(declarations, /declare module 'cloudflare:workers'/)
  assert.match(declarations, /interface DurableObjectNamespace/)
})
