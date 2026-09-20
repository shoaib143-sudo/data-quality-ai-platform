import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync(new URL('../.github/workflows/release-governance.yml', import.meta.url), 'utf8')
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('Cloudflare canary and worker have non-deploying exact-SHA preflight operations', () => {
  assert.match(workflow, /cloudflare-canary-preflight/)
  assert.match(workflow, /cloudflare-worker-preflight/)
  assert.match(workflow, /inputs\.operation == 'cloudflare-canary-preflight'/)
  assert.match(workflow, /inputs\.operation == 'cloudflare-worker-preflight'/)
  assert.match(workflow, /datanexus-canary-preflight/)
  assert.match(workflow, /datanexus-worker-preflight/)
})

test('Cloudflare preflight does not require Cloudflare credentials or paid activation', () => {
  const start = workflow.indexOf('preflight-cloudflare-canary:')
  const end = workflow.indexOf('deploy-cloudflare-canary:')
  const preflight = workflow.slice(start, end)
  assert.doesNotMatch(preflight, /CLOUDFLARE_API_TOKEN/)
  assert.doesNotMatch(preflight, /CLOUDFLARE_ACCOUNT_ID/)
  assert.doesNotMatch(preflight, /confirm_paid_activation == true/)
  const wranglerDeployLines = preflight
    .split(/\r?\n/)
    .filter(line => /dlx wrangler deploy/.test(line))
  assert.ok(wranglerDeployLines.length >= 2)
  for (const line of wranglerDeployLines) {
    assert.match(line, /dlx wrangler deploy --dry-run/)
  }
})

test('all runtime verification commands referenced by release governance are registered', () => {
  assert.ok(pkg.scripts['verify:provider-neutral-runtime'])
  assert.ok(pkg.scripts['verify:container-runtime'])
  assert.ok(pkg.scripts['verify:worker-runtime'])
})
