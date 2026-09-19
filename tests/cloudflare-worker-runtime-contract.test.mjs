import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync(new URL('../infra/cloudflare/worker-runtime/wrangler.jsonc', import.meta.url), 'utf8'))
const router = fs.readFileSync(new URL('../infra/cloudflare/worker-runtime/src/router.ts', import.meta.url), 'utf8')

test('worker container is isolated from the web canary and disabled by default', () => {
  assert.equal(config.name, 'datanexus-worker-canary')
  assert.equal(config.vars.DATANEXUS_ENV, 'canary')
  assert.equal(config.vars.DATANEXUS_WORKER_EXECUTION_ENABLED, 'false')
  assert.equal(config.containers[0].max_instances, 1)
  assert.equal(config.containers[0].image, '../../../Dockerfile')
  assert.deepEqual(config.containers[0].constraints?.regions, ['APAC'])
})

test('worker ingress exposes only health, build identity, and durable execution', () => {
  for (const path of ['/api/health/live', '/api/build-info', '/api/jobs/worker']) {
    assert.match(router, new RegExp(path.replaceAll('/', '\\/')))
  }
  assert.match(router, /Route is not exposed by the DataNexus worker runtime/)
  assert.match(router, /DATANEXUS_WORKER_EXECUTION_ENABLED !== 'true'/)
  assert.match(router, /status: 503/)
})

test('worker route keeps a dedicated execution secret and explicit Supabase runtime inputs', () => {
  assert.match(router, /CRON_SECRET: env\.DATANEXUS_WORKER_SECRET/)
  assert.match(router, /SUPABASE_SERVICE_ROLE_KEY: env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(router, /NEXT_PUBLIC_SUPABASE_URL: env\.NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(router, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
})
