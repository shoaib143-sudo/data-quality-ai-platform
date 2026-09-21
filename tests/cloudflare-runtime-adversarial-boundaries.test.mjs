import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const canaryConfig = fs.readFileSync('infra/cloudflare/runtime/wrangler.jsonc', 'utf8')
const workerConfig = fs.readFileSync('infra/cloudflare/worker-runtime/wrangler.jsonc', 'utf8')
const canaryRouter = fs.readFileSync('infra/cloudflare/runtime/src/router.ts', 'utf8')
const workerRouter = fs.readFileSync('infra/cloudflare/worker-runtime/src/router.ts', 'utf8')
const release = fs.readFileSync('.github/workflows/release-governance.yml', 'utf8')

test('Cloudflare canary never receives privileged Supabase or R2 credentials', () => {
  for (const source of [canaryConfig, canaryRouter]) {
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/)
    assert.doesNotMatch(source, /R2_SECRET_ACCESS_KEY/)
    assert.doesNotMatch(source, /R2_ACCESS_KEY_ID/)
    assert.doesNotMatch(source, /NEXT_PUBLIC_R2_/)
  }
})

test('Cloudflare web canary blocks every production mutation authority surface', () => {
  for (const path of [
    '/api/jobs/worker',
    '/api/internal/storage/configure-r2-cors',
    '/api/internal/storage/migrate-to-r2',
    '/api/internal/storage/reference-cutover',
    '/api/internal/governance/approval-automation',
  ]) assert.ok(canaryRouter.includes(path), `missing blocked canary path: ${path}`)
  assert.match(canaryRouter, /url\.pathname\.startsWith\('\/api\/internal\/'\)/)
  assert.match(canaryRouter, /status: 403/)
})

test('Cloudflare worker is disabled by default and fails closed without both execution secrets', () => {
  assert.match(workerConfig, /"DATANEXUS_WORKER_EXECUTION_ENABLED": "false"/)
  assert.match(workerRouter, /DATANEXUS_WORKER_EXECUTION_ENABLED !== 'true'/)
  assert.match(workerRouter, /DATANEXUS_WORKER_SECRET\?\.trim/)
  assert.match(workerRouter, /SUPABASE_SERVICE_ROLE_KEY\?\.trim/)
  assert.match(workerRouter, /status: 503/)
})

test('Cloudflare deployments require manual dispatch, exact SHA, and explicit paid activation', () => {
  assert.match(release, /workflow_dispatch:/)
  assert.match(release, /confirm_paid_activation/)
  assert.match(release, /inputs\.operation == 'cloudflare-canary-deploy' && inputs\.confirm_paid_activation == true/)
  assert.match(release, /inputs\.operation == 'cloudflare-worker-deploy' && inputs\.confirm_paid_activation == true/)
  assert.match(release, /git merge-base --is-ancestor "\$REQUESTED_SHA" origin\/main/)
  assert.doesNotMatch(release.slice(release.indexOf('  deploy-cloudflare-canary:')), /schedule:/)
})
