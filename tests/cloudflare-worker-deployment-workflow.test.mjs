import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync(new URL('../.github/workflows/release-governance.yml', import.meta.url), 'utf8')

test('Cloudflare worker deployment is manual, exact-SHA, and paid-activation gated', () => {
  assert.match(workflow, /cloudflare-worker-deploy/)
  assert.match(workflow, /inputs\.operation == 'cloudflare-worker-deploy' && inputs\.confirm_paid_activation == true/)
  assert.match(workflow, /environment: cloudflare-worker/)
  assert.match(workflow, /ref: \$\{\{ inputs\.commit_sha \}\}/)
})

test('first worker deployment remains execution-disabled', () => {
  assert.match(workflow, /DATANEXUS_WORKER_EXECUTION_ENABLED:false/)
  assert.match(workflow, /infra\/cloudflare\/worker-runtime\/wrangler\.jsonc/)
  assert.doesNotMatch(workflow, /DGP_DURABLE_WORKER_URL/)
})

test('worker deployment revalidates portable worker and exact build', () => {
  assert.match(workflow, /pnpm run verify:worker-runtime/)
  assert.match(workflow, /pnpm exec tsc --noEmit/)
  assert.match(workflow, /pnpm build/)
  assert.match(workflow, /docker build --tag "datanexus-worker:\$EXACT_SHA"/)
  assert.match(workflow, /wrangler@4\.131\.1/)
})
