import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync(new URL('../.github/workflows/release-governance.yml', import.meta.url), 'utf8')
const tooling = fs.readFileSync(new URL('../scripts/prepare-cloudflare-tooling.mjs', import.meta.url), 'utf8')
const supabaseHealth = fs.readFileSync(new URL('../app/api/health/supabase/route.ts', import.meta.url), 'utf8')
const releaseSchemaHealth = fs.readFileSync(new URL('../app/api/health/release-schema/route.ts', import.meta.url), 'utf8')

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
  assert.match(workflow, /test "\$HEAD_SHA" = "\$REQUESTED_SHA"/)
  assert.match(workflow, /DATANEXUS_COMMIT_SHA:\$EXACT_SHA/)
  assert.match(workflow, /DATANEXUS_ENV:canary/)
  assert.match(workflow, /DATANEXUS_PLATFORM:cloudflare/)
})

test('Cloudflare credentials remain step-scoped and deployment tooling is pinned', () => {
  assert.match(tooling, /wrangler: '4\.131\.1'/)
  assert.match(tooling, /'@cloudflare\/containers': '0\.3\.7'/)
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


test('Cloudflare canary preflight builds governed image and validates Wrangler without deployment', () => {
  assert.match(workflow, /build-cloudflare-container\.mjs/)
  assert.match(workflow, /cloudflare-canary-preflight/)
  assert.match(workflow, /datanexus-cloudflare-tools\/node_modules\/\.bin\/wrangler.*deploy --dry-run/)
})


test('release evidence parsers do not shadow JSON stdin with heredoc scripts', () => {
  assert.doesNotMatch(workflow, /<\/tmp\/[^\n]+<<'NODE'/)
  assert.match(workflow, /readFileSync\(process\.argv\[[23]\], 'utf8'\)/)
})


test('Cloudflare tooling runs from an isolated pinned workspace and exposes the Containers SDK to Wrangler', () => {
  assert.match(workflow, /prepare-cloudflare-tooling\.mjs/)
  assert.match(workflow, /datanexus-cloudflare-tools\/node_modules\/\.bin\/wrangler/)
  assert.match(tooling, /fs\.symlinkSync\(installedContainers, workspaceContainers/)
  assert.doesNotMatch(workflow, /npm install --no-save[^\n]*wrangler/)
  assert.doesNotMatch(workflow, /npx wrangler/)
  assert.doesNotMatch(workflow, /dlx wrangler/)
})


test('Cloudflare canary deployment proves live Supabase public API gateway connectivity without service-role credentials', () => {
  assert.match(supabaseHealth, /getSupabaseEnv/)
  assert.match(supabaseHealth, /\/auth\/v1\/settings/)
  assert.match(supabaseHealth, /apikey: publishableKey/)
  assert.match(supabaseHealth, /Authorization: `Bearer \$\{publishableKey\}`/)
  assert.match(supabaseHealth, /status: 'READY'/)
  assert.match(supabaseHealth, /provider: 'supabase'/)
  assert.doesNotMatch(supabaseHealth, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(workflow, /api\/health\/supabase/)
  assert.match(workflow, /body\.status !== 'READY'/)
  assert.match(workflow, /body\.provider !== 'supabase'/)
  assert.match(workflow, /body\.boundary !== 'public-api-gateway'/)
})


test('Cloudflare activation is gated on primary Vercel exact release and Supabase schema parity', () => {
  assert.match(workflow, /Verify primary Vercel release and Supabase schema parity/)
  assert.match(workflow, /DATANEXUS_VERCEL_PRODUCTION_URL: https:\/\/data-quality-ai-platform\.vercel\.app/)
  assert.match(workflow, /vercel-primary-build\.json/)
  assert.match(workflow, /body\.commitSha !== expected \|\| body\.environment !== 'production' \|\| body\.platform !== 'vercel'/)
  assert.match(workflow, /api\/health\/release-schema/)
  assert.match(workflow, /cloudflare-supabase-release-v1/)
  assert.match(workflow, /Object\.values\(body\.checks\).*status !== 'READY'/)

  assert.match(releaseSchemaHealth, /cloudflare-supabase-release-v1/)
  assert.match(releaseSchemaHealth, /dataNexusEnvironment\(\) !== 'production'/)
  assert.match(releaseSchemaHealth, /dataNexusPlatform\(\) !== 'vercel'/)
  assert.match(releaseSchemaHealth, /agent_version_lifecycle/)
  assert.match(releaseSchemaHealth, /ai_provider_resilience_profile_versions/)
  assert.match(releaseSchemaHealth, /learning_candidates/)
  assert.match(releaseSchemaHealth, /learning_candidate_releases/)
  assert.match(releaseSchemaHealth, /positive_learning_cases/)
  assert.match(releaseSchemaHealth, /production_eligible/)
  assert.match(releaseSchemaHealth, /agent_run_learning_provenance/)
  assert.match(releaseSchemaHealth, /pgcl_run_learning_provenance/)
  assert.match(releaseSchemaHealth, /agent_policy_operational_capabilities/)
  assert.match(releaseSchemaHealth, /execution\.approve/)
  assert.match(releaseSchemaHealth, /agent\.admin/)
  assert.match(releaseSchemaHealth, /recovery_actions/)
  assert.match(releaseSchemaHealth, /execution_token/)
})
