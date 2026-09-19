import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync(new URL('../.github/workflows/release-governance.yml', import.meta.url), 'utf8')

test('Cloudflare canary deployment is manual-only and cost-gated', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /\npush:|\nschedule:/)
  assert.match(workflow, /confirm_paid_activation/)
  assert.match(workflow, /inputs\.operation == 'cloudflare-canary-deploy' && inputs\.confirm_paid_activation == true/)
  assert.match(workflow, /environment: cloudflare-canary/)
})

test('Cloudflare canary deploys an immutable validated SHA', () => {
  assert.match(workflow, /commit_sha:/)
  assert.match(workflow, /ref: \$\{\{ inputs\.commit_sha \}\}/)
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$\{\{ inputs\.commit_sha \}\}"/)
  assert.match(workflow, /DATANEXUS_COMMIT_SHA:\$GITHUB_SHA/)
  assert.match(workflow, /DATANEXUS_ENV:canary/)
  assert.match(workflow, /DATANEXUS_PLATFORM:cloudflare/)
})

test('Cloudflare credentials remain step-scoped and deployment tooling is pinned', () => {
  assert.match(workflow, /wrangler@4\.131\.1/)
  assert.match(workflow, /@cloudflare\/containers@0\.3\.7/)
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/)
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/)
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf('steps:')), /CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/)
})


test('Cloudflare canary deployment passes only public Supabase browser configuration', () => {
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL: \$\{\{ vars\.NEXT_PUBLIC_SUPABASE_URL \}\}/)
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: \$\{\{ vars\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \}\}/)
  assert.match(workflow, /--var "NEXT_PUBLIC_SUPABASE_URL:\$NEXT_PUBLIC_SUPABASE_URL"/)
  assert.match(workflow, /--var "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:\$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"/)
  const canaryJob = workflow.slice(workflow.indexOf('deploy-cloudflare-canary:'), workflow.indexOf('deploy-cloudflare-worker:'))
  assert.doesNotMatch(canaryJob, /SUPABASE_SERVICE_ROLE_KEY/)
})


test('Cloudflare canary release verifies exact deployed identity and read-only mutation boundary', () => {
  assert.match(workflow, /DATANEXUS_CLOUDFLARE_CANARY_URL: \$\{\{ vars\.DATANEXUS_CLOUDFLARE_CANARY_URL \}\}/)
  assert.match(workflow, /api\/build-info/)
  assert.match(workflow, /body\.commitSha !== expected/)
  assert.match(workflow, /body\.environment !== 'canary'/)
  assert.match(workflow, /body\.platform !== 'cloudflare'/)
  assert.match(workflow, /mutation_code/)
  assert.match(workflow, /test "\$mutation_code" = "403"/)
})
