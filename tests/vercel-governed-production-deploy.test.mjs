import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync(
  new URL('../.github/workflows/vercel-production-deploy.yml', import.meta.url),
  'utf8',
)
const vercelConfig = JSON.parse(
  fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
)

test('production deploy is manual-only, explicit, and serialized', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /confirm_deploy:/)
  assert.match(workflow, /if: inputs\.confirm_deploy == true/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /group: datanexus-vercel-production-deploy/)
  assert.match(workflow, /cancel-in-progress: false/)
  assert.doesNotMatch(workflow, /\npush:/)
  assert.doesNotMatch(workflow, /\npull_request:/)
  assert.doesNotMatch(workflow, /\nschedule:/)
  assert.doesNotMatch(workflow, /pull_request_target/)
})

test('deployment accepts only the exact current protected main SHA', () => {
  assert.match(workflow, /ref: \$\{\{ inputs\.commit_sha \}\}/)
  assert.match(workflow, /grep -Eq '\^\[0-9a-f\]\{40\}\$'/)
  assert.match(workflow, /CURRENT_MAIN_SHA="\$\(git rev-parse origin\/main\)"/)
  assert.match(workflow, /Requested Vercel deployment SHA is not the current protected main SHA/)
  assert.match(workflow, /test "\$ACTUAL_SHA" = "\$REQUESTED_SHA"/)
  assert.doesNotMatch(workflow, /merge-base --is-ancestor/)
})

test('Vercel project, team, and CLI version are pinned', () => {
  assert.match(workflow, /VERCEL_ORG_ID: team_qVinlzIY0FqhWavLWzBd8HhT/)
  assert.match(workflow, /VERCEL_PROJECT_ID: prj_Wg1fgyXWUN99I4zlWrtlU9si6yfR/)
  assert.match(workflow, /VERCEL_SCOPE: data-nexus3/)
  assert.match(workflow, /VERCEL_CLI_VERSION: 59\.19\.1/)
  assert.match(workflow, /npm install --global "vercel@\$VERCEL_CLI_VERSION"/)
  assert.match(workflow, /link\.orgId !== expectedOrg \|\| link\.projectId !== expectedProject/)
})

test('Vercel token remains step-scoped and never appears in outputs', () => {
  const jobStart = workflow.indexOf('  deploy:')
  const stepsStart = workflow.indexOf('    steps:', jobStart)
  const jobHeader = workflow.slice(jobStart, stepsStart)
  assert.doesNotMatch(jobHeader, /VERCEL_TOKEN/)
  assert.ok((workflow.match(/VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/g) ?? []).length >= 3)
  assert.doesNotMatch(workflow, /echo .*VERCEL_TOKEN/)
  assert.doesNotMatch(workflow, /GITHUB_OUTPUT.*VERCEL_TOKEN/)
})

test('deployment preserves exact release identity and production-only intent', () => {
  assert.match(workflow, /vercel deploy/)
  assert.match(workflow, /--prod/)
  assert.match(workflow, /--force/)
  assert.match(workflow, /DATANEXUS_COMMIT_SHA=\$EXACT_SHA/)
  assert.match(workflow, /DATANEXUS_ENV=production/)
  assert.match(workflow, /DATANEXUS_PLATFORM=vercel/)
  assert.match(workflow, /DATANEXUS_RELEASE_ID=\$RELEASE_ID/)
  assert.match(workflow, /DATANEXUS_BUILD_TIMESTAMP=\$BUILD_TIMESTAMP/)
})

test('post-deploy verification fails closed on identity and all critical health contracts', () => {
  assert.match(workflow, /\/api\/build-info/)
  assert.match(workflow, /body\.commitSha !== expected/)
  assert.match(workflow, /body\.environment !== 'production'/)
  assert.match(workflow, /body\.platform !== 'vercel'/)
  assert.match(workflow, /\/api\/health\/live/)
  assert.match(workflow, /body\.status !== 'ALIVE'/)
  assert.match(workflow, /\/api\/health\/supabase/)
  assert.match(workflow, /body\.status !== 'READY'/)
  assert.match(workflow, /\/api\/health\/release-schema/)
  assert.match(workflow, /cloudflare-supabase-release-v1/)
  assert.match(workflow, /\/api\/health\/ready/)
})

test('automatic Vercel Git deployments remain disabled', () => {
  assert.equal(vercelConfig.git?.deploymentEnabled, false)
})
