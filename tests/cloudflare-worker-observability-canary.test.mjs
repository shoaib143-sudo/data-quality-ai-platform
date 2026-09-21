import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const service = fs.readFileSync('lib/orchestration/worker-service.ts', 'utf8')
const route = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const router = fs.readFileSync('infra/cloudflare/worker-runtime/src/router.ts', 'utf8')
const config = JSON.parse(fs.readFileSync('infra/cloudflare/worker-runtime/wrangler.jsonc', 'utf8'))
const migration = fs.readFileSync('supabase/migrations/20260921124500_cloudflare_observability_canary_claim.sql', 'utf8')
const release = fs.readFileSync('.github/workflows/release-governance.yml', 'utf8')

test('Cloudflare execution remains disabled by default with an explicit OBSERVABILITY canary allowlist', () => {
  assert.equal(config.vars.DATANEXUS_WORKER_EXECUTION_ENABLED, 'false')
  assert.equal(config.vars.DATANEXUS_WORKER_CANARY_JOB_TYPE, 'OBSERVABILITY')
  assert.match(router, /DATANEXUS_WORKER_CANARY_JOB_TYPE !== 'OBSERVABILITY'/)
  assert.match(router, /CLOUDFLARE_OBSERVABILITY_CANARY/)
})

test('ingress rejects general adaptive dispatch after canary execution is enabled', () => {
  assert.match(router, /Cloudflare worker execution is restricted to the observability canary mode/)
  assert.match(router, /body\.mode !== 'CLOUDFLARE_OBSERVABILITY_CANARY'/)
  assert.match(router, /status: 403/)
})

test('portable worker canary cycle claims at most one OBSERVABILITY job', () => {
  assert.match(service, /runCloudflareObservabilityCanaryCycle/)
  assert.match(service, /claimDurableJobsByType\([^\n]+OBSERVABILITY[^\n]+1\)/)
  assert.match(queue, /jobType !== 'OBSERVABILITY'/)
  assert.match(queue, /rpc\('claim_jobs_by_type'/)
  assert.match(queue, /Math\.min\(Math\.floor\(limit\), 4\)/)
})

test('database claim authority only allows OBSERVABILITY and preserves fencing', () => {
  assert.match(migration, /v_type <> 'OBSERVABILITY'/)
  assert.match(migration, /Unsupported Cloudflare canary job type/)
  assert.match(migration, /for update of q skip locked/i)
  assert.match(migration, /lease_owner = p_worker/)
  assert.match(migration, /lease_expires_at > now\(\)/)
  assert.match(migration, /job_dependencies/)
  assert.match(migration, /max_concurrent_jobs/)
  assert.match(migration, /service_role/)
  assert.match(migration, /revoke execute .* public,anon,authenticated/i)
})

test('canary activation is separately owner-approved and remains reversible', () => {
  assert.match(release, /Cloudflare Worker Observability Canary/)
  assert.match(release, /confirm_worker_execution/)
  assert.match(release, /inputs\.confirm_worker_execution == true/)
  assert.match(release, /DATANEXUS_WORKER_EXECUTION_ENABLED:true/)
  assert.match(release, /DATANEXUS_WORKER_CANARY_JOB_TYPE:OBSERVABILITY/)
  assert.match(release, /DATANEXUS_WORKER_EXECUTION_ENABLED:false/)
})

test('enabled canary requires privileged secrets and verifies unauthorized and over-broad modes fail closed', () => {
  assert.match(release, /secrets\.DATANEXUS_WORKER_SECRET/)
  assert.match(release, /secrets\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(release, /test "\$unauthorized_code" = "403"/)
  assert.match(release, /test "\$forbidden_code" = "403"/)
  assert.match(release, /body\.jobType!=='OBSERVABILITY'/)
  assert.match(release, /body\.claimed<0\|\|body\.claimed>1/)
})


test('canary activation remains manual-only inside the release workflow', () => {
  assert.match(release, /workflow_dispatch:/)
  const start = release.indexOf('  enable-cloudflare-worker-canary:')
  const end = release.indexOf('  certify-vercel-production:', start)
  assert.ok(start >= 0 && end > start)
  const canary = release.slice(start, end)
  assert.doesNotMatch(canary, /schedule:/)
  assert.doesNotMatch(canary, /push:/)
})
