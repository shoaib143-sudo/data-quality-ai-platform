import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync(
  new URL('../.github/workflows/release-governance.yml', import.meta.url),
  'utf8',
)
const vercelConfig = JSON.parse(
  fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
)

const start = workflow.indexOf('  deploy-vercel-production:')
const end = workflow.indexOf('  certify-vercel-production:', start)
assert.ok(start >= 0 && end > start)
const deploy = workflow.slice(start, end)

test('production deploy is an explicit manual governed release operation', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /- vercel-production-deploy/)
  assert.match(deploy, /inputs\.operation == 'vercel-production-deploy'/)
  assert.match(deploy, /environment: production/)
  assert.match(deploy, /group: datanexus-vercel-production-deploy/)
  assert.match(deploy, /cancel-in-progress: false/)
  assert.doesNotMatch(workflow, /pull_request_target/)
})

test('deployment accepts only the exact current protected main SHA', () => {
  assert.match(deploy, /Checkout current protected main/)
  assert.match(deploy, /ref: main/)
  assert.match(deploy, /grep -Eq '\^\[0-9a-f\]\{40\}\$'/)
  assert.match(deploy, /CURRENT_MAIN_SHA="\$\(git rev-parse HEAD\)"/)
  assert.match(deploy, /Requested Vercel deployment SHA is stale/)
  assert.match(deploy, /EXPECTED_SHA.*CURRENT_MAIN_SHA/s)
  assert.doesNotMatch(deploy, /merge-base --is-ancestor/)
})

test('Vercel project, team, and CLI version are pinned', () => {
  assert.match(deploy, /VERCEL_ORG_ID: team_qVinlzIY0FqhWavLWzBd8HhT/)
  assert.match(deploy, /VERCEL_PROJECT_ID: prj_Wg1fgyXWUN99I4zlWrtlU9si6yfR/)
  assert.match(deploy, /VERCEL_SCOPE: data-nexus3/)
  assert.match(deploy, /VERCEL_CLI_VERSION: 59\.19\.1/)
  assert.match(deploy, /npm install --global "vercel@\$VERCEL_CLI_VERSION"/)
  assert.match(deploy, /link\.orgId !== process\.env\.VERCEL_ORG_ID/)
  assert.match(deploy, /link\.projectId !== process\.env\.VERCEL_PROJECT_ID/)
})

test('Vercel token remains step-scoped and never appears in outputs', () => {
  const stepsStart = deploy.indexOf('    steps:')
  const jobHeader = deploy.slice(0, stepsStart)
  assert.doesNotMatch(jobHeader, /VERCEL_TOKEN/)
  assert.ok((deploy.match(/VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/g) ?? []).length >= 3)
  assert.doesNotMatch(deploy, /echo .*VERCEL_TOKEN/)
  assert.doesNotMatch(deploy, /GITHUB_OUTPUT.*VERCEL_TOKEN/)
})

test('deployment preserves exact release identity and production-only intent', () => {
  assert.match(deploy, /vercel deploy/)
  assert.match(deploy, /--prod/)
  assert.match(deploy, /--force/)
  assert.match(deploy, /--skip-domain/)
  assert.match(deploy, /DATANEXUS_COMMIT_SHA=\$EXACT_SHA/)
  assert.match(deploy, /DATANEXUS_ENV=production/)
  assert.match(deploy, /DATANEXUS_PLATFORM=vercel/)
  assert.match(deploy, /DATANEXUS_RELEASE_ID=\$RELEASE_ID/)
  assert.match(deploy, /DATANEXUS_BUILD_TIMESTAMP=\$BUILD_TIMESTAMP/)
})

test('post-deploy verification fails closed on identity and critical health contracts', () => {
  assert.match(deploy, /\/api\/build-info/)
  assert.match(deploy, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/)
  assert.match(deploy, /vercel --token "\$VERCEL_TOKEN" --scope "\$VERCEL_SCOPE" curl \/api\/build-info/)
  assert.match(deploy, /--deployment "\$BASE_URL"/)
  assert.match(deploy, /\/\.well-known\/deployed-artifact-provenance\.json/)
  assert.match(deploy, /body\.sourceCommitSha !== expected/)
  assert.match(deploy, /body\.artifactDigest\.startsWith\('sha256:'\)/)
  assert.match(deploy, /Promote verified staged deployment to Production/)
  assert.match(deploy, /vercel --token "\$VERCEL_TOKEN" --scope "\$VERCEL_SCOPE" promote "\$DEPLOYMENT_URL" --yes/)
  assert.match(deploy, /body\.commitSha !== expected/)
  assert.match(deploy, /body\.environment !== 'production'/)
  assert.match(deploy, /body\.platform !== 'vercel'/)
  assert.match(deploy, /\/api\/health\/live/)
  assert.match(deploy, /body\.status !== 'ALIVE'/)
  assert.match(deploy, /\/api\/health\/supabase/)
  assert.match(deploy, /body\.status !== 'READY'/)
  assert.match(deploy, /\/api\/health\/release-schema/)
  assert.match(deploy, /cloudflare-supabase-release-v1/)
  assert.match(deploy, /\/api\/health\/ready/)
})

test('staged production release verifies before promotion and verifies alias after promotion', () => {
  const snapshot = deploy.indexOf('Snapshot current production identity')
  const stage = deploy.indexOf('Stage exact current main as Vercel Production build')
  const identity = deploy.indexOf('Verify exact deployed identity')
  const stagedHealth = deploy.indexOf('Verify staged artifact provenance and critical health')
  const promote = deploy.indexOf('Promote verified staged deployment to Production')
  const alias = deploy.indexOf('Verify production alias and critical health contracts')
  assert.ok(snapshot >= 0)
  assert.ok(stage > snapshot)
  assert.ok(identity > stage)
  assert.ok(stagedHealth > identity)
  assert.ok(promote > stagedHealth)
  assert.ok(alias > promote)
})

test('successful release persists immutable machine-readable evidence', () => {
  assert.match(deploy, /Persist production release evidence/)
  assert.match(deploy, /evidenceKind: 'VERCEL_PRODUCTION_RELEASE'/)
  assert.match(deploy, /generatedAt: new Date\(\)\.toISOString\(\)/)
  assert.match(deploy, /previousProduction: readJson\('\/tmp\/vercel-previous-production-build\.json'\)/)
  assert.match(deploy, /staged\.provenance\.sourceCommitSha !== evidence\.exactCommitSha/)
  assert.match(deploy, /production\.buildInfo\.commitSha !== evidence\.exactCommitSha/)
  assert.match(deploy, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/)
  assert.match(deploy, /release-evidence\/vercel-production-release\.json/)
  assert.match(deploy, /if-no-files-found: error/)
  assert.match(deploy, /retention-days: 90/)
})

test('release captures prior production identity without blocking emergency recovery', () => {
  assert.match(deploy, /Snapshot current production identity/)
  assert.match(deploy, /vercel-previous-production-build\.json/)
  assert.match(deploy, /Previous production identity could not be captured before promotion/)
  assert.match(deploy, /httpCode: code/)
  assert.doesNotMatch(deploy, /Previous production identity could not be captured[\s\S]{0,120}exit 1/)
})

test('automatic Vercel Git deployments remain disabled', () => {
  assert.equal(vercelConfig.git?.deploymentEnabled, false)
})
