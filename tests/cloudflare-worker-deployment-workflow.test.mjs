import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync(new URL('../.github/workflows/release-governance.yml', import.meta.url), 'utf8')
const tooling = fs.readFileSync(new URL('../scripts/prepare-cloudflare-tooling.mjs', import.meta.url), 'utf8')

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
  assert.match(workflow, /build-cloudflare-container\.mjs/)
  assert.match(tooling, /wrangler: '4\.131\.1'/)
})


test('Cloudflare worker release verifies exact identity and remains execution-disabled', () => {
  assert.match(workflow, /DATANEXUS_CLOUDFLARE_WORKER_URL: \$\{\{ vars\.DATANEXUS_CLOUDFLARE_WORKER_URL \}\}/)
  assert.match(workflow, /body\.commitSha !== expected/)
  assert.match(workflow, /body\.environment !== 'canary'/)
  assert.match(workflow, /body\.platform !== 'cloudflare'/)
  assert.match(workflow, /disabled_code/)
  assert.match(workflow, /test "\$disabled_code" = "503"/)
})


test('Cloudflare worker preflight validates Wrangler without deployment', () => {
  assert.match(workflow, /cloudflare-worker-preflight/)
  assert.match(workflow, /datanexus-cloudflare-tools\/node_modules\/\.bin\/wrangler.*deploy --dry-run/)
})
