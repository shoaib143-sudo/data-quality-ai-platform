import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync(new URL('../infra/cloudflare/worker-runtime/wrangler.jsonc', import.meta.url), 'utf8'))
const router = fs.readFileSync(new URL('../infra/cloudflare/worker-runtime/src/router.ts', import.meta.url), 'utf8')

test('worker container is isolated from the web canary and disabled by default', () => {
  assert.equal(config.name, 'datanexus-worker-canary')
  assert.equal(config.vars.DATANEXUS_ENV, 'canary')
  assert.equal(config.vars.DATANEXUS_WORKER_EXECUTION_ENABLED, 'false')
  assert.equal(config.vars.DATANEXUS_WORKER_CANARY_JOB_TYPE, 'OBSERVABILITY')
  assert.equal(config.containers[0].max_instances, 1)
  assert.equal(config.containers[0].image, '../../../Dockerfile')
  assert.deepEqual(config.containers[0].constraints?.regions, ['APAC'])
  assert.equal(config.containers[0].instance_type, 'standard-1')
  assert.equal(config.containers[0].ssh?.enabled, false)
  assert.equal(config.containers[0].image_vars?.NEXT_PUBLIC_SUPABASE_URL, 'https://tvjnavjxuehpesxcfvrx.supabase.co')
  assert.match(config.containers[0].image_vars?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '', /^sb_publishable_/)
})

test('worker ingress exposes only health, build identity, and durable execution', () => {
  for (const path of ['/api/health/live', '/api/build-info', '/api/jobs/worker']) {
    assert.match(router, new RegExp(path.replaceAll('/', '\\/')))
  }
  assert.match(router, /Route is not exposed by the DataNexus worker runtime/)
  assert.match(router, /DATANEXUS_WORKER_EXECUTION_ENABLED !== 'true'/)
  assert.match(router, /pingEndpoint = 'container\/api\/health\/live'/)
  assert.match(router, /definedEnvVars/)
  assert.match(router, /status: 503/)
})

test('worker route keeps a dedicated execution secret and explicit Supabase runtime inputs', () => {
  assert.match(router, /CRON_SECRET: env\.DATANEXUS_WORKER_SECRET/)
  assert.match(router, /SUPABASE_SERVICE_ROLE_KEY: env\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(router, /NEXT_PUBLIC_SUPABASE_URL: env\.NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(router, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
})


test('worker ingress fails closed when execution is enabled without complete secrets and enforces methods', () => {
  assert.match(router, /workerRuntimeConfigured/)
  assert.match(router, /DATANEXUS_WORKER_SECRET\?\.trim/)
  assert.match(router, /SUPABASE_SERVICE_ROLE_KEY\?\.trim/)
  assert.match(router, /Worker execution is enabled but required runtime secrets are incomplete/)
  assert.match(router, /request\.method\.toUpperCase\(\) !== 'POST'/)
  assert.match(router, /status: 405/)
  assert.match(router, /Allow: 'POST'/)
})


test('enabled worker ingress authenticates before forwarding execution to the container', () => {
  assert.match(router, /const workerSecret = env\.DATANEXUS_WORKER_SECRET\?\.trim\(\)/)
  assert.match(router, /if \(!workerSecret\)/)
  assert.match(router, /expectedAuthorization = 'Bearer ' \+ workerSecret/)
  assert.match(router, /request\.headers\.get\('authorization'\)\?\.trim\(\) !== expectedAuthorization/)
  assert.match(router, /Worker access denied\./)
  assert.match(router, /status: 403/)
})

test('enabled worker ingress remains restricted to the observability canary mode', () => {
  assert.match(router, /DATANEXUS_WORKER_CANARY_JOB_TYPE !== 'OBSERVABILITY'/)
  assert.match(router, /CLOUDFLARE_OBSERVABILITY_CANARY/)
  assert.match(router, /Cloudflare worker execution is restricted to the observability canary mode/)
})
